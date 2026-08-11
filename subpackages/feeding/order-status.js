const { FeedingService } = require('./services/FeedingService')
const DEFAULT_AVATAR = '/images/default-avatar.svg'
const PaymentService = require('../../services/PaymentService')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const countdownBehavior = require('../../behaviors/countdownBehavior')
const { formatTime } = require('../../utils/dateUtils')
const pageI18n = require('../../utils/page-i18n.js')

const STATUS_CONFIG = {
  pending_payment: { title: '待付款', subtitle: '请尽快完成支付', icon: '/images/icons/wallet-luxury-line.svg' },
  confirmed: { title: '订单已确认', subtitle: '平台已接单，将安排服务人员上门', icon: '/images/icons/check-circle-luxury-line.svg' },
  in_progress: { title: '服务进行中', subtitle: '服务人员正在为您服务', icon: '/images/icons/paw-luxury-line.svg' },
  completed: { title: '服务已完成', subtitle: '感谢您的使用', icon: '/images/icons/celebration-luxury-line.svg' },
  cancelled: { title: '订单已取消', subtitle: '', icon: '/images/icons/x-circle-luxury-line.svg' },
}

// 支付状态展示映射：由 _normalizePaymentStatus 派生的状态码 → { 文案, 样式类 }
// 与 web-admin 的 normalizePaymentStatus 逻辑对齐（小程序端在页面内自行实现）
const PAYMENT_DISPLAY_MAP = {
  paid: { text: '已支付', tag: 'paid-status' },
  paying: { text: '支付中', tag: 'unpaid-status' },
  unpaid: { text: '待支付', tag: 'unpaid-status' },
  refunded: { text: '已退款', tag: 'unpaid-status' },
  closed: { text: '已关闭', tag: 'unpaid-status' },
  free: { text: '免单', tag: 'paid-status' },
}

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, countdownBehavior],

  data: {
    orderId: '',
    orderInfo: null,
    isLoading: true,
    statusConfig: null,
    serviceBreakdown: [],
    isPaying: false,
    // 支付倒计时计算用：原始创建时间戳 + 超时分钟（与后端 30min 超时取消对齐）
    createdAtTs: 0,
    timeoutMinutes: 30,
  },

  onLoad(options) {
    this._initNavbarHeight()
    const orderId = options.orderId || ''
    if (!orderId) {
      this.error('INVALID_PARAMS')
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ orderId })
    this._fetchOrderStatus()
  },

  onPullDownRefresh() {
    this._fetchOrderStatus().finally(() => wx.stopPullDownRefresh())
  },

  async _fetchOrderStatus() {
    this.setData({ isLoading: true })
    try {
      const result = await FeedingService.getOrderStatus(this.data.orderId)
      if (result && result.code === 0) {
      const orderInfo = result.data
      // 在 formatTime 覆盖原始 createdAt 之前，先取时间戳供支付倒计时使用
      const createdAtTs = orderInfo.createdAt ? new Date(orderInfo.createdAt).getTime() : 0
      orderInfo.createdAt = formatTime(orderInfo.createdAt)
      orderInfo.confirmedAt = formatTime(orderInfo.confirmedAt)
      orderInfo.completedAt = formatTime(orderInfo.completedAt)

        const dateSet = new Set()
        if (orderInfo.petServices) {
          Object.values(orderInfo.petServices).forEach(svc => {
            if (svc.serviceDates) {
              svc.serviceDates.forEach(d => {
                if (d.shortDate) {dateSet.add(d.shortDate)}
              })
            }
          })
        }
        if (dateSet.size > 0) {
          orderInfo.serviceDateText = Array.from(dateSet).sort().join('、')
        }

        const statusConfig = STATUS_CONFIG[orderInfo.status] || STATUS_CONFIG.confirmed
        const serviceBreakdown = this._buildServiceBreakdown(orderInfo)

        // 预计算支付状态展示字段，避免 wxml 内 inline 三元无法覆盖 refunded 等状态
        const paymentStatusCode = this._normalizePaymentStatus(orderInfo)
        const paymentDisplay = PAYMENT_DISPLAY_MAP[paymentStatusCode] || PAYMENT_DISPLAY_MAP.unpaid
        orderInfo.paymentStatusText = paymentDisplay.text
        orderInfo.paymentStatusTag = paymentDisplay.tag

        this.setData({ orderInfo, statusConfig, serviceBreakdown, isLoading: false, createdAtTs, timeoutMinutes: 30 })
        this._loadedOnce = true
        // 待支付订单启动支付倒计时（与后端 30min 超时取消对齐）
        if (orderInfo.status === 'pending_payment') {
          this._startPayCountdown((this.data.createdAtTs || 0) + (this.data.timeoutMinutes || 30) * 60 * 1000)
        } else {
          this._stopPayCountdown()
        }
      } else {
        this.setData({ isLoading: false })
        this.errorDynamic(result?.message, 'LOAD_FAILED')
      }
    } catch (error) {
      console.error('[order-status] _fetchOrderStatus error:', error)
      this.setData({ isLoading: false })
      this.error('LOAD_FAILED')
    }
  },

  // 页面重新显示时刷新订单（支付/取消后返回需拿到最新状态），并重启倒计时
  onShow() {
    if (this._loadedOnce && this.data.orderId) {
      this._fetchOrderStatus()
    }
  },

  onHide() {
    this._stopPayCountdown()
  },

  onUnload() {
    this._stopPayCountdown()
  },

  _buildServiceBreakdown(orderInfo) {
    const breakdown = []
    const { petDetails, petServices } = orderInfo
    if (!petDetails || !petServices) {return breakdown}

    petDetails.forEach(pet => {
      const svc = petServices[pet.id]
      if (!svc) {return}

      const serviceDays = (svc.serviceDates && svc.serviceDates.length) || 0
      if (serviceDays === 0) {return}

      const baseAmount = serviceDays * 50
      let walkAmount = 0
      if (svc.walkMinutes > 0) {
        walkAmount = serviceDays * svc.walkMinutes * 2
      }
      const subtotal = baseAmount + walkAmount

      breakdown.push({
        name: pet.name || '未知宠物',
        serviceDays,
        baseAmount,
        walkMinutes: svc.walkMinutes || 0,
        walkAmount,
        subtotal,
      })
    })

    return breakdown
  },

  // 派生支付状态码（与 web-admin normalizePaymentStatus 逻辑一致，适配小程序端）
  // 规则：
  //   status === 'cancelled' → paymentStatus === 'refunded' ? 'refunded' : 'closed'
  //   status === 'refunded'  → 'refunded'
  //   paymentStatus === 'paid' && 金额为 0 → 'free'
  //   其他                   → paymentStatus || 'unpaid'
  // 与 web-admin/src/utils/payment-status.js 保持一致
  _normalizePaymentStatus(order) {
    if (!order) {return 'unpaid'}
    const { status, paymentStatus } = order
    if (status === 'cancelled') {
      return paymentStatus === 'refunded' ? 'refunded' : 'closed'
    }
    if (status === 'refunded') {
      return 'refunded'
    }
    if (paymentStatus === 'paid') {
      const amount = Number(order.totalPrice) || Number(order.totalAmount) || Number(order.finalAmount) || 0
      if (amount === 0) {
        return 'free'
      }
    }
    return paymentStatus || 'unpaid'
  },

  async onGoPay() {
    if (this.data.isPaying) {return}
    const { orderInfo, orderId } = this.data
    if (!orderInfo) {return}

    this.setData({ isPaying: true })

    try {
      const payAmount = Math.round((orderInfo.totalPrice || orderInfo.totalAmount || 0) * 100)

      await PaymentService.pay({
        type: 'feeding',
        orderId,
        amount: payAmount,
        description: '上门喂养服务',
      })

      this.setData({ isPaying: false })
      this._fetchOrderStatus()
    } catch (payError) {
      console.error('[order-status] onGoPay error:', payError)
      this.setData({ isPaying: false })

      if (payError.isCancel) {
        this.error('PAYMENT_CANCELLED_TEXT')
      } else if (payError.isPending) {
        this.error(() => payError.message, { duration: 3000 })
      } else {
        this.showModal({ titleKey: 'BIZ_D3H31V', showCancel: false })
      }
    }
  },

  async onCancelOrder() {
    const orderId = this.data.orderId
    if (!orderId) {return}
    this.showModal({
      titleKey: 'BIZ_B1DRZ9',
      contentKey: 'BIZ_YMBMOP',
      success: (confirmed) => {
        if (!confirmed) {return}
        this._doCancelOrder(orderId)
      },
    })
  },

  async _doCancelOrder(orderId) {
    try {
      const res = await FeedingService.updateFeedingOrderStatus({ orderId, status: 'cancelled' })
      if (res && res.code === 0) {
        this.toast('CANCEL_SUCCESS')
        this._fetchOrderStatus()
      } else {
        this.errorDynamic((res && res.message) || '', 'CANCEL_FAILED')
      }
    } catch (err) {
      this.errorDynamic((err && err.message) || '', 'CANCEL_FAILED')
    }
  },

  onAvatarError(e) {
    const idx = e.currentTarget.dataset.petIndex
    if (idx == null) {return}
    const key = `orderInfo.petDetails[${idx}].avatarUrl`
    this.setData({ [key]: DEFAULT_AVATAR })
  },
})
