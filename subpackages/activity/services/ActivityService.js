const { CloudFunctionService } = require('../../../services/CloudFunctionService')

class ActivityService {
  static async call(action, data = {}) {
    return CloudFunctionService.call('activityService', { action, ...data }, { useCache: false })
  }

  static getActivityList(data) { return this.call('getActivityList', data) }
  static getActivityDetail(activityId) { return this.call('getActivityDetail', { activityId }) }
  static submitRegistration(data) { return this.call('submitRegistration', data) }
  static createActivityPaymentOrder(data) { return this.call('createActivityPaymentOrder', data) }
  static confirmActivityPayment(data) { return this.call('confirmActivityPayment', data) }
  static getRegistrationList(data) { return this.call('getRegistrationList', data) }
  static getRegistrationDetail(registrationId) { return this.call('getRegistrationDetail', { registrationId }) }
}

module.exports = { ActivityService }
