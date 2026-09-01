const { CloudFunctionService } = require('./CloudFunctionService')

class TuanService {
  static async call(action, data = {}, options = {}) {
    return CloudFunctionService.call('tuanService', { action, ...data }, options)
  }

  static getTuanDealList(data, options) { return this.call('getTuanDealList', data, options) }
  static getTuanDealDetail(data, options) { return this.call('getTuanDealDetail', data, options) }
  static createTuanOrder(data, options) { return this.call('createTuanOrder', data, options) }
  // P1-2: 团购订单生命周期操作（发货走 Web 后台 handleTuanOrder，小程序侧无发货入口）
  static confirmReceiveTuanOrder(orderId, options) {
    return this.call('confirmReceiveTuanOrder', { orderId }, options)
  }
  static cancelTuanOrder(orderId, options) {
    return this.call('cancelTuanOrder', { orderId }, options)
  }
}

module.exports = { TuanService }
