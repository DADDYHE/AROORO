const { NotificationService } = require('../services/NotificationService')
const { ListBehavior } = require('../../behaviors/listBehavior')

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],

  data: { notifications: [], unreadCount: 0 },

  onLoad() {
    this._initNavbarHeight()
    this._initListBehavior(
      params => this._doFetch(params),
      { listKey: 'notifications' }
    )
    this._loadPageData()
  },

  onShow() { this._resetAndLoad() },

  async _doFetch(params) {
    const result = await NotificationService.getNotificationList({ page: params.page, pageSize: params.pageSize })
    if (result && result.code === 0) {
      this.setData({ unreadCount: result.data.unreadCount || 0 })
      return (result.data.list || [])
    }
    return []
  },

  _transformListItem(n) {
    return {
      ...n,
      displayDate: n.createdAt ? n.createdAt.substring(0, 16) : '',
      icon: this._getIcon(n.type),
    }
  },

  _getIcon(type) {
    const map = { order: '📋', system: '🔔', review: '⭐', promotion: '🎁' }
    return map[type] || '📢'
  },

  onNotificationTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/subpackages/profile/notification/detail?id=${id}` })
    this._markAsRead(id)
  },

  async _markAsRead(notificationId) {
    try { await NotificationService.markNotificationRead(notificationId) } catch (error) { console.error(error) }
  },

  async onMarkAllRead() {
    try {
      await NotificationService.markAllNotificationsRead()
      this.toast('ALL_MARKED_READ')
      this._resetAndLoad()
    } catch (error) { this.error('OPERATION_FAILED') }
  },

  onPullDownRefresh() { this._onPullDownRefresh() },
  onReachBottom() { this._onReachBottom() },
})
