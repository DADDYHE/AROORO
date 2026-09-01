const { CloudFunctionService } = require('../../../services/CloudFunctionService')

class FeedingService {
  // 性能优化（2026-09-02）：options 透传，读类调用可显式开启缓存（默认仍无缓存，行为不变）
  static async call(action, data = {}, options = {}) {
    return CloudFunctionService.call('feedingService', { action, ...data }, options)
  }

  static createFeedingOrder(data) { return this.call('createFeedingOrder', data) }
  static getFeedingOrders(data) { return this.call('getFeedingOrders', data) }
  static getOrderStatus(orderId) { return this.call('getOrderStatus', { orderId }) }
  static updateFeedingOrderStatus(data) { return this.call('updateFeedingOrderStatus', data) }
}

module.exports = { FeedingService }
