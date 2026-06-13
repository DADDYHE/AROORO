const { OrderService } = require('../../../services/CloudFunctionService')
const PaymentService = require('../../../services/PaymentService')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')
const { MALL_STATUS_TEXT_MAP } = require('../utils/orderConstants')
const { formatDate, formatDateTime } = require('../utils/dateUtils')

const STATUS_TEXT_MAP = MALL_STATUS_TEXT_MAP

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
    iconMapPin: '/images/icons/map-pin-line.svg',
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
        // 异步拉一次 wx 平台发货状态并对齐本地显示
        // ——商家在 mp.weixin.qq.com 后台手动发货时，Plan A/B 兜底同步可能还有延迟，
        // 这里让订单详情页"实时感知"，避免用户看到几秒的 paid 旧状态。
        // 团购/商城订单都在 orders 集合，靠 type 字段区分；详情页也支持两种类型，
        // 必须把实际 orderType 透传，否则 wx 查询会因为 type 过滤命中不到而静默失败。
        this._enrichWxStatus(orderId, res.data && res.data.type)
      } else {
        this.setData({ isLoading: false })
        this.error('ORDER_NOT_FOUND')
      }
    } catch (error) {
      this.setData({ isLoading: false })
      this.error('LOAD_FAILED')
    }
  },

  /**
   * 主动拉一次 wx 平台订单发货状态，按需更新本地页面展示。
   * - 后端 mallService.getWxShippingStatus 已内置 preReconcile（1 小时节流），
   *   多次调用也不会真打到 wx API 太频繁。
   * - 这里只关心"wx 状态比本地更新"的场景：若本地已经是终态，跳过。
   * - 静默降级：失败不影响页面主流程。
   */
  async _enrichWxStatus(orderId, orderType) {
    try {
      const res = await OrderService.getWxShippingStatus({
        orderIds: [orderId],
        // 兼容老调用：默认 'mall'。订单详情页同时承担团购/商城，必须传实际 type。
        orderType: orderType || 'mall',
      })
      if (!res || res.code !== 0 || !res.data || !Array.isArray(res.data.items)) {return}
      const it = res.data.items[0]
      if (!it || !it.ok || it.order_state == null) {return}

      const newStatus = this._mapWxStateToStatus(it.order_state)
      if (!newStatus) {return}  // wx 是 1(待发货) / 6(资金待结算) → 不改变本项目状态

      const current = this.data.order
      if (!current || !current._id || current._id !== orderId) {return}
      if (current.status === newStatus) {return}  // 已经一致，无需 setData

      // wx 比本地新，刷新页面底部按钮区（按钮渲染依赖 order.status）
      this.setData({
        'order.status': newStatus,
        'order.statusText': STATUS_TEXT_MAP[newStatus] || newStatus,
        'order.statusDesc': STATUS_DESC_MAP[newStatus] || '',
      })
    } catch (e) {
      // 静默降级
    }
  },

  /**
   * wx order_state → 本项目 OrderStatus
   * 1=待发货 / 2=已发货 / 3=确认收货 / 4=交易完成 / 5=已退款 / 6=资金待结算
   */
  _mapWxStateToStatus(wxState) {
    const s = Number(wxState)
    if (s === 2) return 'shipped'
    if (s === 3 || s === 4) return 'completed'
    if (s === 5) return 'cancelled'
    return null
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
      // 微信支付订单号（确认收货组件必传）
      transactionId: raw.transactionId || '',
      wxTransactionId: raw.wxTransactionId || '',
      status,
      statusText: STATUS_TEXT_MAP[status] || status,
      statusDesc: STATUS_DESC_MAP[status] || '',
      createdAt: this._formatDateTime(raw.createdAt),
    }
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
      const res = await OrderService.cancelMallOrder(orderId)
      if (res && res.code === 0) {
        this.toast('CANCEL_SUCCESS')
        this._loadOrder(orderId)
      } else {
        this.errorDynamic((res && res.message) || '', 'CANCEL_FAILED')
      }
    } catch (err) {
      this.errorDynamic((err && err.message) || '', 'CANCEL_FAILED')
    }
  },

  async onGoPay() {
    const order = this.data.order
    if (!order || !order._id) {return}

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
    if (!productId) {return}
    wx.navigateTo({ url: `/subpackages/mall/product-detail?id=${productId}` })
  },

  onConfirmReceive() {
    const order = this.data.order
    if (!order || !order._id) {return}
    this.showModal({
      titleKey: 'BIZ_FRS0TJ',
      contentKey: 'BIZ_18YP595',
      success: (confirmed) => {
        if (!confirmed) {return}
        this._openWxConfirmView()
      },
    })
  },

  /**
   * 拉起微信官方"确认收货"组件。
   * - 文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping-half.html
   * - 回调走 App.onShow，referrerInfo.appId === 'wx1183b055aeec94d1'，
   *   extraData.status === 'success' 表示用户已确认。
   */
  _openWxConfirmView() {
    const order = this.data.order
    const transactionId = (order && (order.wxTransactionId || order.transactionId)) || ''
    if (!transactionId) {
      this.error('WXCONFIRM_NO_TXID')
      return
    }
    if (typeof wx.openBusinessView !== 'function') {
      this.error('WX_UPGRADE_REQUIRED')
      return
    }
    wx.openBusinessView({
      businessType: 'weappOrderConfirm',
      extraData: { transaction_id: transactionId },
      success: () => {
        // 不在这里直接刷新：真正的 success 回调在 App.onShow 收到
        this.toast('WXCONFIRM_INVOKED', { icon: 'none' })
      },
      fail: (err) => {
        console.warn('[mall-order-detail] wx.openBusinessView fail', err)
        // 用户取消（status=cancel）或真失败——都提示一下，不更新本地 DB
        this.error('WXCONFIRM_FAILED')
      },
    })
  },

  /**
   * App.onShow 在收到微信"确认收货"组件的 success 回调后调用本方法。
   * 本方法只同步本地 DB（mallService.confirmReceive 内部已带 preReconcile，
   * 即先拉 wx 状态确认 order_state=3 再置本地为 completed）。
   *
   * @param {string} transactionId 微信组件回传的 transaction_id
   */
  _onWxConfirmReceiveSuccess(transactionId) {
    const order = this.data.order
    if (!order || !order._id) {return}
    const orderTxId = order.wxTransactionId || order.transactionId
    // 防御：只处理当前页面订单的回调
    if (transactionId && orderTxId && transactionId !== orderTxId) {return}
    OrderService.confirmMallReceive(order._id)
      .then((res) => {
        if (res && res.code === 0) {
          this.toast('WXCONFIRM_SUCCESS')
          this._loadOrder(order._id)
        } else {
          this.errorDynamic((res && res.message) || '', 'WXCONFIRM_FAILED')
        }
      })
      .catch((err) => {
        this.errorDynamic((err && err.message) || '', 'WXCONFIRM_FAILED')
      })
  },

  onRebuy() {
    const productId = this.data.order?.productId
    if (!productId) {return}
    wx.navigateTo({ url: `/subpackages/mall/product-detail?id=${productId}` })
  },

  onDeleteOrder() {
    const orderId = this.data.order?._id
    if (!orderId) {return}
    this.showModal({
      titleKey: 'BIZ_AZLJXZ',
      contentKey: 'BIZ_1H4DMEP',
      success: (confirmed) => {
        if (!confirmed) {return}
        this._doDeleteOrder(orderId)
      },
    })
  },

  async _doDeleteOrder(orderId) {
    try {
      const res = await OrderService.deleteMallOrder(orderId)
      if (res && res.code === 0) {
        this.toast('DELETE_SUCCESS')
        setTimeout(() => {
          wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) })
        }, 1200)
      } else {
        this.errorDynamic((res && res.message) || '', 'DELETE_FAILED')
      }
    } catch (err) {
      this.errorDynamic((err && err.message) || '', 'DELETE_FAILED')
    }
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
