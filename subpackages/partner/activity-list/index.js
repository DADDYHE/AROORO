const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    isRefreshing: false,
    isSearching: false,
    activities: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    currentTab: 'all',
    searchKeyword: '',
    searchFocused: false,
    tabs: [
      { key: 'published', label: '报名中' },
      { key: 'registration_stopped', label: '报名截止' },
      { key: 'ended', label: '已结束' },
      { key: 'draft', label: '待发布' },
      { key: 'all', label: '全部' },
    ],
  },

  onLoad() {
    this._loadData(true)
  },

  onShow() {
    if (!this.data.isLoading && !this.data.isRefreshing) {
      this._loadData(false)
    }
  },

  _mapActivities(list) {
    const statusMap = {
      draft: '待发布',
      published: '报名中',
      registration_stopped: '报名截止',
      ended: '已结束',
      cancelled: '已取消',
    }
    return list.map(item => {
      item.statusText = statusMap[item.status] || item.status
      if (item.currentParticipants < 0) item.currentParticipants = 0
      return item
    })
  },

  async _loadData(isInitial) {
    if (isInitial) {
      this.setData({ isLoading: true, page: 1 })
    } else {
      this.setData({ isRefreshing: true, page: 1 })
    }
    try {
      const params = { page: 1, pageSize: this.data.pageSize }
      if (this.data.currentTab !== 'all') {
        params.status = this.data.currentTab
      }
      if (this.data.searchKeyword.trim()) {
        params.keyword = this.data.searchKeyword.trim()
      }
      const res = await AdminService.getActivityList(params)
      if (res.code === 0 && res.data) {
        const list = this._mapActivities(res.data.list || [])
        this.setData({
          activities: list,
          total: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
          isLoading: false,
          isRefreshing: false,
        })
      } else {
        this.setData({ isLoading: false, isRefreshing: false })
      }
    } catch (e) {
      console.error('[partner/activity-list] _loadData error:', e)
      this.setData({ isLoading: false, isRefreshing: false })
    }
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.currentTab) return
    this.setData({ currentTab: key })
    this._loadData(false)
  },

  onCreateTap() {
    wx.navigateTo({ url: '/subpackages/partner/activity-create/index' })
  },

  onActivityTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/subpackages/partner/activity-detail/index?id=' + id })
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading || this.data.isRefreshing) return
    this._loadMore()
  },

  async _loadMore() {
    if (this.data.isSearching) return
    const nextPage = this.data.page + 1
    this.setData({ isSearching: true })
    try {
      const params = { page: nextPage, pageSize: this.data.pageSize }
      if (this.data.currentTab !== 'all') {
        params.status = this.data.currentTab
      }
      if (this.data.searchKeyword.trim()) {
        params.keyword = this.data.searchKeyword.trim()
      }
      const res = await AdminService.getActivityList(params)
      if (res.code === 0 && res.data) {
        const list = this._mapActivities(res.data.list || [])
        this.setData({
          activities: [...this.data.activities, ...list],
          page: nextPage,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/activity-list] _loadMore error:', e)
    }
    this.setData({ isSearching: false })
  },

  onPullDownRefresh() {
    this._loadData(false).then(() => wx.stopPullDownRefresh())
  },

  onSearchFocus() {
    this.setData({ searchFocused: true })
  },

  onSearchBlur() {
    this.setData({ searchFocused: false })
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  onSearchConfirm() {
    this._loadData(false)
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' })
    this._loadData(false)
  },

  onEmptyCreate() {
    wx.navigateTo({ url: '/subpackages/partner/activity-create/index' })
  },

  onScrollToUpper() {
    if (!this.data.isLoading && !this.data.isRefreshing) {
      this._loadData(false)
    }
  },
})
