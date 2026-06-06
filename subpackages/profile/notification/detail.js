const { NotificationService } = require('../services/NotificationService')

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  data: { notification: null, isLoading: true },

  onLoad(options) {
    if (options.id) {
      this._loadNotification(options.id)
    } else {
      this.setData({ isLoading: false })
      this.error('INVALID_PARAMS')
    }
  },

  async _loadNotification(notificationId) {
    this.setData({ isLoading: true })
    try {
      const result = await NotificationService.getNotificationDetail(notificationId)
      if (result && result.code === 0) {
        this.setData({ notification: result.data })
      }
    } catch (error) {
      console.error('[NotificationDetail] 加载失败:', error)
    }
    this.setData({ isLoading: false })
  },
})
