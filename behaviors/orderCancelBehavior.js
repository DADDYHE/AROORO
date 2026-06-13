/**
 * behaviors/orderCancelBehavior.js
 *
 * 取消订单通用行为
 *
 * 用法：
 *   behaviors: [orderCancelBehavior],
 *   _initCancelBehavior(cancelServiceFn, refreshCallback) {
 *     this._cancelServiceFn = cancelServiceFn
 *     this._cancelRefreshCallback = refreshCallback
 *   },
 *   onCancelOrder(e) {
 *     this._cancelOrder(e.currentTarget.dataset.id, e.currentTarget.dataset.reason)
 *   },
 */

const orderCancelBehavior = Behavior({
  methods: {
    _initCancelBehavior(cancelServiceFn, refreshCallback) {
      this._cancelServiceFn = cancelServiceFn
      this._cancelRefreshCallback = refreshCallback
    },

    _cancelOrder(orderId, defaultReason) {
      wx.showModal({
        title: '确认取消',
        content: '确定要取消该订单吗？取消后不可恢复。',
        confirmColor: '#FF3B30',
        success: async (res) => {
          if (!res.confirm) {return}
          try {
            wx.showLoading({ title: '取消中...', mask: true })
            await this._cancelServiceFn(orderId)
            wx.hideLoading()
            this.toast('ORDER_CANCELLED')
            if (this._cancelRefreshCallback) {
              this._cancelRefreshCallback()
            } else {
              wx.navigateBack()
            }
          } catch (error) {
            wx.hideLoading()
            this.errorDynamic(error.message, 'OPERATION_FAILED')
          }
        },
      })
    },
  },
})

module.exports = orderCancelBehavior
