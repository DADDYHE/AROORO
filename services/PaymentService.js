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
    const { type, orderId, amount, description } = params

    const result = await this.createPayment({ type, orderId, amount, description })
    if (!result || result.code !== 0 || !result.data || !result.data.paymentParams) {
      throw new Error(result?.message || '创建支付订单失败')
    }

    const outTradeNo = result.data.outTradeNo

    const paymentResult = await new Promise((resolve) => {
      wx.requestPayment({
        timeStamp: result.data.paymentParams.timeStamp,
        nonceStr: result.data.paymentParams.nonceStr,
        package: result.data.paymentParams.package,
        signType: result.data.paymentParams.signType,
        paySign: result.data.paymentParams.paySign,
        success: () => resolve('success'),
        fail: (err) => {
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

module.exports = new PaymentService()
