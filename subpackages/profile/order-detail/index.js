const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { OrderService } = require('../../../services/CloudFunctionService')
const PaymentService = require('../../../services/PaymentService')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')
const countdownBehavior = require('../../../behaviors/countdownBehavior')
const { STATUS_TEXT_MAP } = require('../utils/orderConstants')
const { formatDate, formatDateTime } = require('../utils/dateUtils')

const STATUS_DESC_MAP = {
  pending_payment: '请尽快完成付款，超时订单将自动取消',
  deposit_paid: '定金已支付，请补齐尾款完成预订',
  paid: '订单已支付，等待寄养家庭确认',
  confirmed: '寄养家庭已确认您的订单',
  in_progress: '宠物寄养服务进行中',
  completed: '订单已完成，感谢您的信任',
  cancelled: '订单已取消',
  rejected: '订单已被拒绝',
  refunded: '订单已退款',
}

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

const authGateBehavior = require('../../../behaviors/authGateBehavior')
Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, countdownBehavior, authGateBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    isLoading: true,
    order: null,
    actions: [],
    iconMapPin: '/images/icons/map-pin-line.svg',
    iconTimeLine: '/images/icons/time-line.svg',
  },

  // 底部操作栏配置（UI 展示层）：key 对应 onAction 分支
  _buildActions(status) {
    switch (status) {
      case 'pending_payment':
        // 2026-09-06：定金/全款并排按钮（取消订单移至顶部状态区）
        return [
          { key: 'payDeposit', text: '支付定金', type: 'secondary' },
          { key: 'payFull', text: '支付全款', type: 'primary' },
        ]
      case 'deposit_paid':
        return [
          { key: 'pay', text: '补尾款', type: 'primary' },
        ]
      case 'paid':
      case 'confirmed':
        return [{ key: 'cancel', text: '取消订单', type: 'secondary' }]
      case 'in_progress':
        return [{ key: 'contact', text: '联系寄养家庭', type: 'primary' }]
      case 'completed':
        return [{ key: 'contact', text: '联系寄养家庭', type: 'secondary' }]
      default:
        return []
    }
  },

  onAction(e) {
    const { action } = e.detail || {}
    if (action === 'cancel') this.onCancelOrder()
    else if (action === 'payDeposit') this.onGoPay('deposit')
    else if (action === 'payFull') this.onGoPay('full')
    else if (action === 'pay') this.onGoPay('tail')
    else if (action === 'contact') this.onContactHost()
    else if (action === 'share') this.openShareSheet()
  },

  /** 分享订单（寄养家庭发给客户 / 客户自存）：onGoShareButton 触发菜单，直接分享走 onShareAppMessage */
  openShareSheet() {
    // action-bar 场景无 button 上下文，引导用户点右上角菜单分享（最简可靠路径）
    this.toast(() => '请点击右上角「···」转发给客户')
  },

  onShareAppMessage() {
    const order = this.data.order || {}
    return {
      title: `寄养订单待支付 · ${order.hostName || '家庭寄养'} · ¥${order.remainAmount > 0 ? order.remainAmount : order.totalPrice}`,
      path: `/subpackages/profile/order-detail/index?id=${order._id || ''}&from=hostShare`,
    }
  },

  onLoad(options) {
    this._initNavbarHeight()
    const orderId = options.id || ''
    const outTradeNo = options.outTradeNo || ''
    if (orderId || outTradeNo) {
      this._loadOrder({ orderId, outTradeNo })
    } else {
      this.error('INVALID_PARAMS')
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  async _loadOrder({ orderId, outTradeNo, silent }) {
    if (!silent) { this.setData({ isLoading: true }) }
    try {
      const res = await OrderService.getOrderDetail({ orderId, outTradeNo })
      if (res && res.code === 0 && res.data) {
        const order = this._normalizeOrder(res.data)
        this.setData({ order, actions: this._buildActions(order.status), isLoading: false })
        /* 支付回调异步（可能晚于跳转数秒）：待支付态有限轮询（5×2s），
           状态推进（deposit_paid/paid）即停 —— 按钮/金额自动切到补尾款，防重复付全款 */
        if (order.status === 'pending_payment') { this._startStatusPolling(orderId) }
        // 定金 = 全款 30%（四舍五入 2 位，与服务端同口径）
        const dep = Math.round((order.totalPrice || 0) * 0.3 * 100) / 100
        this.setData({ depositAmount: dep, remainAmountTip: Math.round(((order.totalPrice || 0) - dep) * 100) / 100 })
        // 支付倒计时（timeoutAt 由 createOrder 写入，旧单无此字段不显示）
        this._stopPayCountdown()
        if (order.status === 'pending_payment' && order.timeoutAt) {
          this._startPayCountdown(Number(order.timeoutAt))
          // 页面级到期定时器：倒计时归零即主动触发服务端取消（秒级闭环，不等 cron）；
          //   失败静默——cron 兜底，刷新后以服务端状态为准
          if (this._expireTimer) { clearTimeout(this._expireTimer) }
          this._expireTimer = setTimeout(() => {
            OrderService.cancelOrder({ orderId: order._id, cancelReason: '超时未支付' })
              .catch(() => {})
              .then(() => this._loadOrder({ orderId: order._id }))
          }, Math.max(0, Number(order.timeoutAt) - Date.now()) + 1000)
        }
        this._loadedOnce = true
      } else {
        this.setData({ isLoading: false })
        this.error('ORDER_NOT_FOUND')
      }
    } catch (error) {
      this.setData({ isLoading: false })
      this.error('LOAD_FAILED')
    }
  },

  _normalizeOrder(raw) {
    const status = raw.status || 'pending_payment'
    const hostInfo = raw.hostInfo || {}
    const ownerInfo = raw.ownerInfo || {}
    const petList = raw.petsInfo || raw.pets || []
    const petNames = petList.map(p => p.name || '').filter(Boolean).join('、')

    const hostName = raw.hostName || hostInfo.hostName || ''
    const hostPhone = raw.hostPhone || hostInfo.phone || ''
    const hostAvatar = raw.hostAvatar || hostInfo.avatarUrl || ''
    const ownerPhone = raw.ownerPhone || ownerInfo.phone || ''
    const ownerName = raw.ownerName || ownerInfo.nickName || ''

    return {
      _id: raw._id,
      orderNo: raw.orderNo || raw._id || '',
      status,
      statusText: STATUS_TEXT_MAP[status] || status,
      statusDesc: STATUS_DESC_MAP[status] || '',
      hostName,
      hostPhone,
      hostAvatar,
      hostId: raw.hostId || '',
      ownerName,
      ownerPhone,
      petNames: petNames || '宠物',
      petList,
      startDate: this._formatDate(raw.startDate),
      // 卷宗头展示（2026-09-06）：短日期 MM.DD + 计费方式标签（JS 预计算，Skyline 合规）
      dateStartShort: this._shortDate(raw.startDate),
      dateEndShort: this._shortDate(raw.endDate),
      billingLabel: raw.billingMode === 'hourly24' ? '24小时制' : (raw.billingMode ? '酒店制' : ''),
      endDate: this._formatDate(raw.endDate),
      startAt: raw.startAt || '',
      endAt: raw.endAt || '',
      days: raw.days || raw.duration || 0,
      pricePerDay: raw.pricePerDay || 0,
      petCount: raw.petCount || (raw.petIds ? raw.petIds.length : petList.length),
      basicPrice: raw.basicPrice || 0,
      totalPrice: raw.totalPrice || 0,
      couponDiscount: raw.couponDiscount || 0,
      finalPrice: raw.finalPrice || raw.totalPrice || 0,
      // 付款双模式（2026-09-06）：payType full/deposit + 已付/待补金额
      payType: raw.payType || 'full',
      payAmount: raw.payAmount || 0,
      paidAmount: raw.paidAmount || 0,
      remainAmount: Math.max(0, Math.round(((raw.totalPrice || 0) - (raw.paidAmount || 0)) * 100) / 100),
      timeoutAt: raw.timeoutAt || 0,
      note: raw.note || '',
      // 计费方式（2026-09-06 双计费算法）：老订单无 chargeBreakdown → 展示退化为「X 天」
      ...this._buildChargeDisplay(raw),
      createdAt: this._formatDateTime(raw.createdAt),
      // 保留原始创建时间戳，供支付倒计时计算（与后端 ORDER_TIMEOUT_MINUTES=30 对齐）
      createdAtTs: raw.createdAt ? new Date(raw.createdAt).getTime() : 0,
      timeoutMinutes: 30,
      paidAt: this._formatDateTime(raw.paidAt),
      paymentStatus: raw.paymentStatus || 'unpaid',
    }
  },

  /**
   * 计费展示字段（chargeBreakdown → 展示层）
   * - hotel：N 晚 + 超时加收行
   * - hourly24：X 天 + 尾数 Y 小时行
   * - 老订单（无快照）：daysLabel 退化为「X 天」，chargeLines 为空不渲染
   */
  _buildChargeDisplay(raw) {
    const bd = raw.chargeBreakdown
    if (!bd || !bd.mode) {
      return { daysLabel: `${raw.days || raw.duration || 0} 天`, chargeLines: [] }
    }

    const petCount = Number(bd.petCount) || 1
    const r2 = n => Math.round((Number(n) || 0) * petCount * 100) / 100
    const chargeLines = []

    if (bd.mode === 'hotel') {
      const lines = [`住宿 ${bd.nights} 晚：¥${r2(bd.baseFee)}`]
      if (bd.overtimeFee > 0) {
        const h = Math.floor((bd.overtimeMinutes || 0) / 60)
        const m = (bd.overtimeMinutes || 0) % 60
        const dur = m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
        lines.push(`超时 ${dur} 加收：¥${r2(bd.overtimeFee)}`)
      }
      return {
        daysLabel: `${bd.nights} 晚`,
        chargeLines: lines,
      }
    }

    // hourly24
    const lines = [`住宿 ${bd.days} 天：¥${r2(bd.baseFee)}`]
    if (bd.remainHours > 0) {
      lines.push(`尾数 ${bd.remainHours} 小时：¥${r2(bd.hourlyFee)}`)
    }
    return {
      daysLabel: bd.remainHours > 0 ? `${bd.days} 天 ${bd.remainHours} 小时` : `${bd.days} 天`,
      chargeLines: lines,
    }
  },

  _formatDate(dateValue) { return formatDate(dateValue) },

  /** 'YYYY-MM-DD' → 'MM.DD'（卷宗编辑式日期）；解析失败返回原值 */
  _shortDate(dateValue) {
    const s = String(dateValue || '')
    const m = s.match(/\d{4}-\d{2}-\d{2}/)
    if (!m) {return s}
    const parts = m[0].split('-')
    return parts[1] + '.' + parts[2]
  },

  _formatDateTime(dateValue) { return formatDateTime(dateValue) },

  _parseDate(dateValue) { return formatDate(dateValue) ? new Date(dateValue) : null },

  onCopyOrderNo() {
    const orderNo = this.data.order?.orderNo
    if (!orderNo) {return}
    wx.setClipboardData({
      data: orderNo,
      success: () => this.toast('COPIED'),
    })
  },

  onContactHost() {
    const phone = this.data.order?.hostPhone
    if (!phone) {
      this.error('CONTACT_MISSING')
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  /**
   * 发起支付（2026-09-06）：底部按钮直接决定支付类型
   *   - 'deposit'：预付定金 30%（pending_payment）
   *   - 'full'：支付全款（pending_payment）
   *   - 'tail'：补尾款（deposit_paid，应付 = totalPrice - 已付定金）
   */
  /* 待支付态有限轮询：支付回调异步，最多 5 次 × 2s，状态推进即停 */
  _startStatusPolling(orderId) {
    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null }
    let n = 0
    const tick = async () => {
      n++
      const cur = this.data.order
      if (!cur || cur._id !== orderId || cur.status !== 'pending_payment') { return }
      await this._loadOrder({ orderId, silent: true })
      const st = this.data.order && this.data.order.status
      if (st && st !== 'pending_payment') { return }
      if (n >= 5) { return }
      this._pollTimer = setTimeout(tick, 2000)
    }
    this._pollTimer = setTimeout(tick, 2000)
  },

  async onGoPay(payType) {
    const prev = this.data.order
    if (!prev || !prev._id) {return}
    /* 点击瞬间先显支付遮罩：前置的静默重拉（0.5~1.5s RTT）期间不能无反馈；
       pay() 内部再次 show 幂等，finally hide 兜底（金额异常等 return 路径也关闭） */
    const { PaymentService } = require('../../services/PaymentService')
    PaymentService.showPayLoading()
    try {
      await this._loadOrder({ orderId: prev._id, silent: true })
    } catch (e) { /* 重拉失败沿用快照继续（pay 侧仍有金额校验兜底） */ }
    const order = this.data.order

    const isTail = order.status === 'deposit_paid'
    const pt = isTail ? 'tail' : (payType || 'full')
    const payAmount = isTail
      ? order.remainAmount
      : (pt === 'deposit' ? this.data.depositAmount : order.totalPrice)

    if (!(payAmount > 0)) {
      this.error(() => '订单金额异常，请联系客服')
      return
    }

    const desc = isTail
      ? `寄养尾款-${order.hostName || ''}-${order.petNames || ''}`
      : order.hostName
        ? `寄养-${order.hostName}-${order.petNames}-${order.days || 0}天${pt === 'deposit' ? '-定金' : ''}`
        : `寄养订单-${order.petNames}`

    try {
      await PaymentService.pay({
        type: 'order',
        orderId: order._id,
        payType: isTail ? undefined : pt,
        amount: Math.round((payAmount || 0) * 100),
        description: desc.substring(0, 127),
      })
      this.toast(() => isTail ? '尾款支付成功' : '支付成功')
      this._loadOrder({ orderId: order._id })
    } catch (err) {
      if (err.isCancel) {
        this.error('PAYMENT_CANCELLED')
      } else if (err.isPending) {
        this.error(() => err.message, { duration: 3000 })
      } else {
        this.errorDynamic(err.message, 'PAYMENT_FAILED')
      }
    } finally {
      /* pay 内部 finally 已 hide；此处兜底金额异常等提前 return 的路径 */
      PaymentService.hidePayLoading()
    }
  },

  onCancelOrder() {
    const orderId = this.data.order?._id
    if (!orderId) {return}
    this.showModal({
      titleKey: 'BIZ_B1DRZ9',
      contentKey: 'BIZ_1DLBP94',
      success: (confirmed) => {
        if (!confirmed) {return}
        this._doCancelOrder(orderId)
      },
    })
  },

  async _doCancelOrder(orderId) {
    try {
      const res = await OrderService.cancelOrder({ orderId })
      if (res && res.code === 0) {
        this.toast('CANCEL_SUCCESS')
        this._loadOrder({ orderId })
      } else {
        this.errorDynamic((res && res.message) || '', 'CANCEL_FAILED')
      }
    } catch (err) {
      this.errorDynamic((err && err.message) || '', 'CANCEL_FAILED')
    }
  },

  // 页面重新显示时刷新订单（支付/取消后返回需拿到最新状态），并重启倒计时
  onShow() {
    if (this._loadedOnce && this.data.order && this.data.order._id) {
      this._loadOrder({ orderId: this.data.order._id })
    }
  },

  onHide() {
    this._stopPayCountdown()
  },

  onUnload() {
    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null }
    if (this._expireTimer) { clearTimeout(this._expireTimer); this._expireTimer = null }
    this._stopPayCountdown()
  },

  onPullDownRefresh() {
    const orderId = this.data.order?._id
    if (orderId) {
      this._loadOrder({ orderId }).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
    } else {
      wx.stopPullDownRefresh()
    }
  },
})
