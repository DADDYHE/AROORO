const { OrderService } = require('../../../services/CloudFunctionService')
const PaymentService = require('../../../services/PaymentService')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')
const { STATUS_TEXT_MAP } = require('../utils/orderConstants')
const { formatDate, formatDateTime } = require('../utils/dateUtils')

const STATUS_DESC_MAP = {
  pending: '等待寄养家庭确认您的订单',
  pending_payment: '请尽快完成付款，超时订单将自动取消',
  paid: '订单已支付，等待寄养家庭确认',
  confirmed: '寄养家庭已确认您的订单',
  in_progress: '宠物寄养服务进行中',
  ongoing: '宠物寄养服务进行中',
  completed: '订单已完成，感谢您的信任',
  cancelled: '订单已取消',
}

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    isLoading: true,
    order: null,
    iconMapPin: '/images/icons/map-pin-line.svg',
    iconTimeLine: '/images/icons/time-line.svg',
  },

  onLoad(options) {
    const orderId = options.id || ''
    const outTradeNo = options.outTradeNo || ''
    if (orderId || outTradeNo) {
      this._loadOrder({ orderId, outTradeNo })
    } else {
      this.error('INVALID_PARAMS')
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  async _loadOrder({ orderId, outTradeNo }) {
    this.setData({ isLoading: true })
    try {
      const res = await OrderService.getOrderDetail({ orderId, outTradeNo })
      if (res && res.code === 0 && res.data) {
        const order = this._normalizeOrder(res.data)
        this.setData({ order, isLoading: false })
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
    const status = raw.status || 'pending'
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
      endDate: this._formatDate(raw.endDate),
      days: raw.days || raw.duration || 0,
      pricePerDay: raw.pricePerDay || 0,
      petCount: raw.petCount || (raw.petIds ? raw.petIds.length : petList.length),
      basicPrice: raw.basicPrice || 0,
      totalPrice: raw.totalPrice || 0,
      couponDiscount: raw.couponDiscount || 0,
      finalPrice: raw.finalPrice || raw.totalPrice || 0,
      note: raw.note || '',
      createdAt: this._formatDateTime(raw.createdAt),
      paidAt: this._formatDateTime(raw.paidAt),
      paymentStatus: raw.paymentStatus || 'unpaid',
    }
  },

  _formatDate(dateValue) { return formatDate(dateValue) },

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

  async onGoPay() {
    const order = this.data.order
    if (!order || !order._id) {return}

    const desc = order.hostName
      ? `寄养-${order.hostName}-${order.petNames}-${order.days || 0}天`
      : `寄养订单-${order.petNames}`

    try {
      await PaymentService.pay({
        type: 'order',
        orderId: order._id,
        amount: Math.round((order.totalPrice || 0) * 100),
        description: desc.substring(0, 127),
      })
      this.toast('PAYMENT_SUCCESS')
      this._loadOrder({ orderId: order._id })
    } catch (err) {
      if (err.isCancel) {
        this.error('PAYMENT_CANCELLED')
      } else if (err.isPending) {
        this.error(() => err.message, { duration: 3000 })
      } else {
        this.errorDynamic(err.message, 'PAYMENT_FAILED')
      }
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

  onPullDownRefresh() {
    const orderId = this.data.order?._id
    if (orderId) {
      this._loadOrder({ orderId }).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
    } else {
      wx.stopPullDownRefresh()
    }
  },
})
