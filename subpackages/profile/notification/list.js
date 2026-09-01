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

  // 性能优化：onShow 30s 节流——被动重拉限频，避免切 tab 往返反复请求
  onShow() {
    const now = Date.now()
    if (!this._lastRefreshAt || now - this._lastRefreshAt > 30000) {
      this._lastRefreshAt = now
      this._resetAndLoad()
    }
  },

  async _doFetch(params) {
    // 性能优化：仅首屏被动加载开缓存（30s）；分页/下拉刷新（_forceRefresh）穿透
    const result = await NotificationService.getNotificationList(
      { page: params.page, pageSize: params.pageSize },
      { useCache: params.page === 1 && !this._forceRefresh, cacheTime: 30000 }
    )
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
    try {
      await NotificationService.markNotificationRead(notificationId)
      this._lastRefreshAt = 0 // 已读成功 → 下次 onShow 强制重拉（unreadCount 需同步）
    } catch (error) { console.error(error) }
  },

  async onMarkAllRead() {
    try {
      await NotificationService.markAllNotificationsRead()
      this.toast('ALL_MARKED_READ')
      this._resetAndLoad()
    } catch (error) { this.error('OPERATION_FAILED') }
  },

  onPullDownRefresh() {
    // 下拉刷新为主动行为，强制穿透缓存（复用 ListBehavior 刷新语义）
    this._forceRefresh = true
    return this._onPullDownRefresh().finally(() => { this._forceRefresh = false })
  },
  onReachBottom() { this._onReachBottom() },
})
