const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const app = getApp()
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { sortAndSliceActivities } = require('../../utils/activityFormatter')
const { ActivityService } = require('../../services/CloudFunctionService')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, tabBarSyncBehavior, cloudImageBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    activities: [],
  },

  onLoad() {
    this._initNavbarHeight()
    this._initListBehavior(
      params => this._doFetch(params),
      { pageSize: 10, listKey: 'activities', sortFn: this._sortActivities }
    )
    this._resetAndLoad()
  },

  onShow() {
    this._syncTabBar()
    if (this._dataLoaded) {
      this._resetAndLoad()
    }
    this._dataLoaded = true
  },

  onReachBottom() {
    this._onReachBottom()
  },

  onPullDownRefresh() {
    this._onPullDownRefresh()
  },

  async _doFetch(params) {
    const result = await ActivityService.getActivityList({
      status: 'published',
      page: params.page,
      pageSize: params.pageSize,
      // 本页依赖 joined（isRegistered）做"已报名"拦截，需显式声明；
      // 无限滚动列表不消费 total，跳过 count 查询
      withJoined: true,
      skipTotal: true,
    })

    if (result && result.code === 0) {
      const list = result.data?.list || []
      return sortAndSliceActivities(list)
    }
    return []
  },

  _sortActivities(a, b) {
    // 按开始时间排序，最新的在前
    if (a.startTime && b.startTime) {
      return new Date(b.startTime) - new Date(a.startTime)
    }
    return 0
  },

  handleActivityTap(e) {
    const id = e.currentTarget.dataset.id
    const isEnded = e.currentTarget.dataset.isended
    const isRegistered = e.currentTarget.dataset.isregistered
    const registrationEnded = e.currentTarget.dataset.registrationended

    if (isEnded) {
      this.error('ACTIVITY_ENDED_TOAST')
      return
    }

    if (isRegistered) {
      this.error('ALREADY_REGISTERED')
      return
    }

    if (registrationEnded) {
      this.error('REGISTRATION_CLOSED')
      return
    }

    wx.navigateTo({ url: `/subpackages/activity/register?id=${id}` })
  },

  handleActivityDetailTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {return}
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
  },
})
