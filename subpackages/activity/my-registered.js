const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { ActivityService } = require('./services/ActivityService')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { transformActivityItem } = require('./utils/activityHelpers')
const { parseDate } = require('../../utils/dateUtils')
const { getLocation } = require('../../utils/geolocation')

Page({
  behaviors: [ListBehavior, cloudImageBehavior],

  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    activities: [],
  },

  onLoad() {
    this._initNavbarHeight()
    this._initListBehavior(
      params => this._doFetch(params),
      { pageSize: 10, listKey: 'activities', sortFn: (a, b) => {
        const order = { upcoming: 0, registration_stopped: 1, ended: 2 }
        const aOrder = order[a.activityStatus] ?? 0
        const bOrder = order[b.activityStatus] ?? 0
        if (aOrder !== bOrder) {return aOrder - bOrder}
        return (a.startTime || '').localeCompare(b.startTime || '')
      }}
    )
    this._loadPageData()
  },

  onShow() {
    this._resetAndLoad()
  },

  async _doFetch(params) {
    // 报名单有效状态为 paid/pending_payment/completed（V5 起 'confirmed' 已废弃），
    // 用 'all' 让后端映射为有效报名集合，避免查到空列表
    const reqData = { action: 'getRegistrationList', page: params.page, pageSize: params.pageSize, status: 'all' }
    // 性能优化：仅首屏被动加载开缓存（30s）；onShow 重拉命中缓存=隐式节流；分页/下拉刷新（_forceRefresh）穿透
    const result = await ActivityService.call('getRegistrationList', reqData, {
      useCache: params.page === 1 && !this._forceRefresh,
      cacheTime: 30000,
    })
    if (result && result.code === 0 && result.data) {
      return result.data.list || result.data || []
    }
    return []
  },

  _transformListItem(a) {
    const item = transformActivityItem(a)
    const now = new Date()
    const start = parseDate(a.startTime)
    const end = parseDate(a.endTime)
    const within = Boolean(start) && now >= start && (!end || now <= end)
    item.canSignIn = item.signInStatus !== 'signed' && within
    return item
  },

  _onListError() {
    this.setData({ activities: [] })
  },

  async onSignIn(e) {
    const regId = e.currentTarget.dataset.regid
    if (!regId) { return }
    wx.showLoading({ title: '签到中' })
    try {
      const loc = await getLocation()
      const res = await ActivityService.signInRegistration({
        registrationId: regId,
        latitude: loc.latitude,
        longitude: loc.longitude,
      })
      wx.hideLoading()
      if (res && res.code === 0 && res.data) {
        if (res.data.tooFar) {
          wx.showToast({ title: (res.message || '距离活动地点过远') + '，请在现场签到', icon: 'none' })
          return
        }
        const activities = (this.data.activities || []).map((it) =>
          it._registrationId === regId ? { ...it, signInStatus: 'signed', canSignIn: false } : it)
        this.setData({ activities })
        wx.showToast({ title: '签到成功', icon: 'success' })
      } else {
        wx.showToast({ title: res && res.message ? res.message : '签到失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      const title = (err && err.code)
        ? (err.message || '签到失败，请稍后重试')
        : '获取定位失败，请开启定位权限后重试'
      wx.showToast({ title, icon: 'none' })
    }
  },

  onActivityTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
  },

  onPullDownRefresh() {
    // 下拉刷新为主动行为，强制穿透缓存（复用 ListBehavior 刷新语义）
    this._forceRefresh = true
    return this._onPullDownRefresh().finally(() => { this._forceRefresh = false })
  },
  onReachBottom() { this._onReachBottom() },
})
