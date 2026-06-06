const { FeedingService } = require('./services/FeedingService')
const { ListBehavior } = require('./behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

Page({
  behaviors: [ListBehavior, cloudImageBehavior],

  data: {
    groomers: [],
  },

  onLoad() {
    this._initListBehavior(
      params => this._doFetch(params),
      { pageSize: 10, listKey: 'groomers' }
    )
    this._loadPageData()
  },

  async _doFetch(params) {
    const result = await FeedingService.getFeederList({ page: params.page, pageSize: params.pageSize, serviceType: 'grooming' })
    if (result && result.code === 0) return (result.data.list || [])
    return []
  },

  _transformListItem(g) {
    return {
      ...g,
      displayName: g.nickname || g.realName || g.name || '服务师',
      priceText: g.pricePerVisit ? `¥${g.pricePerVisit}/次` : '面议',
    }
  },

  _onListError(error) {
    console.error('[GroomerList] 加载失败:', error)
  },

  onGroomerTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/feeding/groomer-detail?id=${id}` })
  },

  onPullDownRefresh() { this._onPullDownRefresh() },
  onReachBottom() { this._onReachBottom() },
})
