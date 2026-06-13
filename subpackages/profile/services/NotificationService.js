const { CloudFunctionService } = require('../../../services/CloudFunctionService')

class NotificationService {
  static async call(action, data = {}) {
    return CloudFunctionService.call('userService', { action, ...data })
  }

  static getNotificationList(data) { return this.call('getNotificationList', data) }
  static markNotificationRead(notificationId) { return this.call('markNotificationRead', { notificationId }) }
  static markAllNotificationsRead() { return this.call('markAllNotificationsRead') }
  static getNotificationDetail(notificationId) { return this.call('getNotificationDetail', { notificationId }) }
}

module.exports = { NotificationService }
