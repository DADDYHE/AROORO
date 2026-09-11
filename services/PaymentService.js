const { CloudFunctionService } = require('./CloudFunctionService')

class PaymentService {
  createPayment(data) {
    return CloudFunctionService.call('paymentService', { action: 'createPayment', ...data }, { retryCount: 1 })
  }

  queryPayment(data) {
    return CloudFunctionService.call('paymentService', { action: 'queryPayment', ...data }, { retryCount: 0 })
  }

  closePayment(data) {
    return CloudFunctionService.call('paymentService', { action: 'closePayment', ...data }, { retryCount: 0 })
  }

  confirmPayment(data) {
    return CloudFunctionService.call('paymentService', { action: 'confirmPayment', ...data }, { retryCount: 0 })
  }

  createRefund(data) {
    return CloudFunctionService.call('paymentService', { action: 'createRefund', ...data }, { retryCount: 0 })
  }

  queryRefund(data) {
    return CloudFunctionService.call('paymentService', { action: 'queryRefund', ...data }, { retryCount: 0 })
  }

  async pay(params) {
    /* 支付 loading：拉起支付全程遮罩反馈（变体 A：金环 + 「支付中，请稍等...」），
       收银台交互完成（success/cancel/error）后关闭——遮罩同时挡住重复点击（防双支付单） */
    this._notifyPayLoading(true)
    try {
      return await this._payInner(params)
    } finally {
      this._notifyPayLoading(false)
    }
  }

  async _payInner(params) {
    const { type, orderId, amount, description, payType } = params

    // payType：2026-09-06 付款双模式（full 全款 / deposit 定金 30%），透传给 createPayment 做服务端金额推算
    const result = await this.createPayment({ type, orderId, amount, description, payType })
    if (!result || result.code !== 0 || !result.data || !result.data.paymentParams) {
      throw new Error(result?.message || '创建支付订单失败')
    }

    const outTradeNo = result.data.outTradeNo

    const paymentResult = await new Promise(resolve => {
      wx.requestPayment({
        timeStamp: result.data.paymentParams.timeStamp,
        nonceStr: result.data.paymentParams.nonceStr,
        package: result.data.paymentParams.package,
        signType: result.data.paymentParams.signType,
        paySign: result.data.paymentParams.paySign,
        success: () => resolve('success'),
        fail: err => {
          if (err && err.errMsg && err.errMsg.includes('cancel')) {
            resolve('cancel')
          } else {
            resolve('error')
          }
        },
      })
    })

    if (paymentResult === 'cancel') {
      const err = new Error('cancel')
      err.isCancel = true
      throw err
    }

    try {
      const confirmResult = await this.confirmPayment({ outTradeNo })
      if (confirmResult && confirmResult.code === 0 && confirmResult.data && confirmResult.data.paid) {
        return { ...result.data, paid: true }
      }
    } catch (e) {
      console.warn('[PaymentService] confirmPayment failed, will rely on callback', e)
    }

    const err = new Error('支付结果确认中，请稍后在订单中查看')
    err.isPending = true
    throw err
  }
}

// 支付 loading 通知：pay-loading 组件注册监听，页面挂 <pay-loading /> 即全自动显隐
let _payLoadingListener = null
PaymentService.prototype.setPayLoadingListener = function (fn) {
  _payLoadingListener = fn || null
}
PaymentService.prototype._notifyPayLoading = function (visible) {
  if (typeof _payLoadingListener === 'function') {
    try { _payLoadingListener(visible) } catch (e) { /* 组件销毁竞态，静默 */ }
  }
}

module.exports = new PaymentService()
