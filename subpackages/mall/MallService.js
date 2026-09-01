const { CloudFunctionService } = require('../../services/CloudFunctionService')

class MallService {
  // 性能优化（2026-09-02）：options 透传，读类调用可显式开启缓存（默认仍无缓存，行为不变）
  static async call(action, data = {}, options = {}) {
    return CloudFunctionService.call('mallService', { action, ...data }, options)
  }

  static getProductList(data, options) { return this.call('getProductList', data, options) }
  static getProductDetail(productId) { return this.call('getProductDetail', { productId }) }
  static getCategoryStats(options) { return this.call('getCategoryStats', undefined, options) }
  static listCategories(options) { return this.call('listCategories', undefined, options) }
  static createOrder(data) { return this.call('createOrder', data) }
}

module.exports = { MallService }
