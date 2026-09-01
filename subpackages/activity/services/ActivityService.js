const { CloudFunctionService } = require('../../../services/CloudFunctionService')

class ActivityService {
  // 性能优化（2026-09-02）：options 透传，读类调用可显式开启缓存（默认仍无缓存，行为不变）
  static async call(action, data = {}, options = {}) {
    return CloudFunctionService.call('activityService', { action, ...data }, { useCache: false, ...options })
  }

  static getActivityList(data) { return this.call('getActivityList', data) }
  static getActivityDetail(activityId) { return this.call('getActivityDetail', { activityId }) }
  static submitRegistration(data) { return this.call('submitRegistration', data) }
  static getRegistrationList(data) { return this.call('getRegistrationList', data) }
  static getRegistrationDetail(registrationId) { return this.call('getRegistrationDetail', { registrationId }) }
  static signInRegistration(data) { return this.call('signInRegistration', data) }
}

module.exports = { ActivityService }
