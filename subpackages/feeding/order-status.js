const { FeedingService } = require('./services/FeedingService')
const DEFAULT_AVATAR = '/images/default-avatar.svg'
const PaymentService = require('../../services/PaymentService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { formatTime } = require('../../profile/utils/dateUtils')

const STATUS_CONFIG = {
  pending_payment: { title: '待付款', subtitle: '请尽快完成支付', icon: '💰' },
  confirmed: { title: '订单已确认', subtitle: '平台已接单，将安排服务人员上门', icon: '✅' },
  in_progress: { title: '服务进行中', subtitle: '服务人员正在为您服务', icon: '🐾' },
  completed: { title: '服务已完成', subtitle: '感谢您的使用', icon: '🎉' },
  cancelled: { title: '订单已取消', subtitle: '', icon: '❌' },
}

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],

  data: {
    orderId: '',
    orderInfo: null,
    isLoading: true,
    statusConfig: null,
    serviceBreakdown: [],
    isPaying: false,
  },

  onLoad(options) {
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

        this.setData({ orderInfo, statusConfig, serviceBreakdown, isLoading: false })
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
