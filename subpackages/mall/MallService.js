const { CloudFunctionService } = require('../../services/CloudFunctionService')

class MallService {
  static async call(action, data = {}) {
    return CloudFunctionService.call('mallService', { action, ...data })
  }

  static getProductList(data) { return this.call('getProductList', data) }
  static getProductDetail(productId) { return this.call('getProductDetail', { productId }) }
  static getCategoryStats() { return this.call('getCategoryStats') }
  static listCategories() { return this.call('listCategories') }
  static createOrder(data) { return this.call('createOrder', data) }
  static createGroupBuyOrder(data) { return this.call('createGroupBuyOrder', data) }
}

module.exports = { MallService }
