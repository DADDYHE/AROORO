const { ActivityService } = require('./services/ActivityService')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { transformActivityItem } = require('./utils/activityHelpers')

Page({
  behaviors: [ListBehavior, cloudImageBehavior],

  data: {
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
    const reqData = { action: 'getRegistrationList', page: params.page, pageSize: params.pageSize, status: 'confirmed' }
    const result = await ActivityService.call('getRegistrationList', reqData)
    if (result && result.code === 0 && result.data) {
      return result.data.list || result.data || []
    }
    return []
  },

  _transformListItem(a) { return transformActivityItem(a) },

  _onListError() {
    this.setData({ activities: [] })
  },

  onActivityTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
  },

  onPullDownRefresh() { this._onPullDownRefresh() },
  onReachBottom() { this._onReachBottom() },
})
