const { CloudFunctionService } = require('../../../services/CloudFunctionService')

class FeedingService {
  static async call(action, data = {}) {
    return CloudFunctionService.call('feedingService', { action, ...data })
  }

  static createFeedingOrder(data) { return this.call('createFeedingOrder', data) }
  static getFeedingOrders(data) { return this.call('getFeedingOrders', data) }
  static getOrderStatus(orderId) { return this.call('getOrderStatus', { orderId }) }
  static updateFeedingOrderStatus(data) { return this.call('updateFeedingOrderStatus', data) }
}

module.exports = { FeedingService }
