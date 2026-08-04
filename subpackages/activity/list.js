const { ActivityService } = require('./services/ActivityService')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { buildSharePath } = require('../../utils/share')
const { CLOUD_ICONS } = require('../../utils/cloudIcons')
const { transformActivityItem, sortActivities, toDate, formatDateTime } = require('./utils/activityHelpers')

Page({
  behaviors: [ListBehavior, cloudImageBehavior, shareEntryBehavior],

  data: {
    activities: [],
    currentCategory: 'all',
    iconTimeLine: CLOUD_ICONS.TIME,
    iconMapPin: CLOUD_ICONS.MAP_PIN,
    categories: [
      { key: 'all', label: '全部' },
      { key: 'outdoor', label: '户外' },
      { key: 'social', label: '社交' },
      { key: 'training', label: '训练' },
      { key: 'health', label: '健康' },
      { key: 'joined', label: '我报名的' },
    ],
  },

  onLoad() {
    this._initNavbarHeight()
    this._initListBehavior(
      params => this._doFetch(params),
      { pageSize: 10, listKey: 'activities', sortFn: this._sortActivities }
    )
    this._loadPageData()
  },

  onShow() {
  },

  async _doFetch(params) {
    const action = this.data.currentCategory === 'joined' ? 'getRegistrationList' : 'getActivityList'
    const reqData = { action, page: params.page, pageSize: params.pageSize }
    if (this.data.currentCategory !== 'all' && this.data.currentCategory !== 'joined') {
      reqData.category = this.data.currentCategory
    }
    const result = await ActivityService.call(action, reqData)
    if (result && result.code === 0 && result.data) {
      return result.data.list || result.data || []
    }
    return []
  },

  async onAvatarImageError(e) {
    const index = e.currentTarget.dataset.index
    const key = `activities[${index}].organizer.hasValidAvatar`
    this.setData({ [key]: false })
  },

  _toDate(str) { return toDate(str) },

  _formatDateTime(date) { return formatDateTime(date) },

  _transformListItem(a) { return transformActivityItem(a) },

  _sortActivities(a, b) { return sortActivities(a, b) },

  _onListError() {
    this.setData({ activities: [] })
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.key
    this.setData({ currentCategory: category })
    this._resetAndLoad()
  },

  onActivityTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
  },

  onJoinActivity(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/register?id=${id}` })
  },

  onPullDownRefresh() { this._onPullDownRefresh() },
  onReachBottom() { this._onReachBottom() },

  onShareAppMessage() {
    return {
      title: 'AROORO 宠团活动 - 精彩宠物社区活动等你来',
      path: buildSharePath('/subpackages/activity/list'),
    }
  },
})
