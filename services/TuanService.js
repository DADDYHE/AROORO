const { CloudFunctionService } = require('./CloudFunctionService')

class TuanService {
  static async call(action, data = {}) {
    return CloudFunctionService.call('tuanService', { action, ...data })
  }

  static getTuanDealList(data) { return this.call('getTuanDealList', data) }
  static getTuanDealDetail(data) { return this.call('getTuanDealDetail', data) }
  static createTuanOrder(data) { return this.call('createTuanOrder', data) }
}

module.exports = { TuanService }
