const { CloudFunctionService } = require('../../../services/CloudFunctionService')

class NotificationService {
  // 性能优化（2026-09-02）：options 透传，读类调用可显式开启缓存（默认仍无缓存，行为不变）
  static async call(action, data = {}, options = {}) {
    return CloudFunctionService.call('userService', { action, ...data }, options)
  }

  static getNotificationList(data, options) { return this.call('getNotificationList', data, options) }
  static markNotificationRead(notificationId) { return this.call('markNotificationRead', { notificationId }) }
  static markAllNotificationsRead() { return this.call('markAllNotificationsRead') }
  static getNotificationDetail(notificationId) { return this.call('getNotificationDetail', { notificationId }) }
}

module.exports = { NotificationService }
