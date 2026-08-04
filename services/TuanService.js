const { CloudFunctionService } = require('./CloudFunctionService')

class TuanService {
  static async call(action, data = {}) {
    return CloudFunctionService.call('tuanService', { action, ...data })
  }

  static getTuanDealList(data) { return this.call('getTuanDealList', data) }
  static getTuanDealDetail(data) { return this.call('getTuanDealDetail', data) }
  static createTuanOrder(data) { return this.call('createTuanOrder', data) }
  // P1-2: 团购订单生命周期操作（发货走 Web 后台 handleTuanOrder，小程序侧无发货入口）
  static confirmReceiveTuanOrder(orderId) {
    return this.call('confirmReceiveTuanOrder', { orderId })
  }
  static cancelTuanOrder(orderId) {
    return this.call('cancelTuanOrder', { orderId })
  }
}

module.exports = { TuanService }
