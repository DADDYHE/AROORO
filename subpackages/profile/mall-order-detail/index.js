const { OrderService } = require('../../../services/CloudFunctionService')
const PaymentService = require('../../../services/PaymentService')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')

const STATUS_TEXT_MAP = {
  pending_payment: '待付款',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
}

const STATUS_DESC_MAP = {
  pending_payment: '请尽快完成付款，超时订单将自动取消',
  pending_shipment: '商家正在为您准备商品',
  shipped: '商品正在配送中，请注意查收',
  completed: '订单已完成，感谢您的购买',
  cancelled: '订单已取消',
}

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    isLoading: true,
    order: null,
    iconMapPin: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/map-pin-line.svg',
  },

  onLoad(options) {
    if (options.id) {
      this._loadOrder(options.id)
    } else {
      this.error('INVALID_PARAMS')
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  async _loadOrder(orderId) {
    this.setData({ isLoading: true })
    try {
      const res = await OrderService.getMallOrderDetail(orderId)
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
    const status = raw.status || 'pending_payment'
    return {
      _id: raw._id,
      orderNo: raw.orderNo || '',
      productId: raw.productId || '',
      productName: raw.productName || '',
      productImage: raw.productImage || '',
      skuId: raw.skuId || '',
      skuText: raw.skuText || '',
      unitPrice: raw.unitPrice || 0,
      quantity: raw.quantity || 1,
      totalAmount: raw.totalAmount || 0,
      receiverName: raw.receiverName || '',
      receiverPhone: raw.receiverPhone || '',
      receiverAddress: raw.receiverAddress || '',
      status,
      statusText: STATUS_TEXT_MAP[status] || status,
      statusDesc: STATUS_DESC_MAP[status] || '',
      createdAt: this._formatDateTime(raw.createdAt),
    }
  },

  _formatDateTime(dateValue) {
    if (!dateValue) return ''
    const date = this._parseDate(dateValue)
    if (!date) return String(dateValue)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  },

  _parseDate(dateValue) {
    if (!dateValue) return null
    if (dateValue instanceof Date) {
      return isNaN(dateValue.getTime()) ? null : dateValue
    }
    if (typeof dateValue === 'number') {
      return new Date(dateValue)
    }
    if (typeof dateValue === 'string') {
      if (/^\d+$/.test(dateValue)) {
        return new Date(parseInt(dateValue, 10))
      }
      const direct = new Date(dateValue)
      if (!isNaN(direct.getTime())) return direct
      const normalized = dateValue.replace(/-/g, '/')
      const normParsed = new Date(normalized)
      if (!isNaN(normParsed.getTime())) return normParsed
    }
    if (typeof dateValue === 'object') {
      if (dateValue.$date != null) return this._parseDate(dateValue.$date)
      if (dateValue.timestamp != null) return this._parseDate(dateValue.timestamp)
      if (typeof dateValue.getTime === 'function') {
        const t = dateValue.getTime()
        if (!isNaN(t)) return new Date(t)
      }
    }
    return null
  },

  onCopyOrderNo() {
    const orderNo = this.data.order?.orderNo
    if (!orderNo) return
    wx.setClipboardData({
      data: orderNo,
      success: () => this.toast('COPIED'),
    })
  },

  onCancelOrder() {
    const orderId = this.data.order?._id
    if (!orderId) return
    this.showModal({ titleKey: 'BIZ_B1DRZ9', contentKey: 'BIZ_1DLBP94' })
  },

  async onGoPay() {
    const order = this.data.order
    if (!order || !order._id) return

    try {
      await PaymentService.pay({
        type: 'mall',
        orderId: order._id,
        amount: Math.round((order.totalAmount || 0) * 100),
        description: '商城订单',
      })
      this.toast('PAYMENT_SUCCESS')
      this._loadOrder(order._id)
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

  onGoProductDetail() {
    const productId = this.data.order?.productId
    if (!productId) return
    wx.navigateTo({ url: `/subpackages/mall/product-detail?id=${productId}` })
  },

  onConfirmReceive() {
    const orderId = this.data.order?._id
    if (!orderId) return
    this.showModal({ titleKey: 'BIZ_FRS0TJ', contentKey: 'BIZ_18YP595' })
  },

  onRebuy() {
    const productId = this.data.order?.productId
    if (!productId) return
    wx.navigateTo({ url: `/subpackages/mall/product-detail?id=${productId}` })
  },

  onDeleteOrder() {
    const orderId = this.data.order?._id
    if (!orderId) return
    this.showModal({ titleKey: 'BIZ_AZLJXZ', contentKey: 'BIZ_1H4DMEP' })
  },

  onPullDownRefresh() {
    const orderId = this.data.order?._id
    if (orderId) {
      this._loadOrder(orderId).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
    } else {
      wx.stopPullDownRefresh()
    }
  },
})
