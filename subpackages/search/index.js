const { ListBehavior } = require('../../behaviors/listBehavior')

const HOT_KEYWORDS = ['猫粮', '狗粮', '寄养', '洗澡', '逗猫棒', '冻干']

const HISTORY_KEY = 'search_history'
const MAX_HISTORY = 10

Page({
  behaviors: [ListBehavior],
  data: {
    keyword: '',
    hotKeywords: HOT_KEYWORDS,
    history: [],
    results: [],
    loading: false,
    searched: false,
    showHistory: true,
    searchHeaderHeight: 96,
    inputFocus: false,
  },

  onLoad() {
    this._initNavbarHeight()
    this._initSearchHeaderHeight()
    this._loadHistory()
    wx.nextTick(() => {
      this.setData({ inputFocus: true })
    })
  },

  // 计算搜索栏实际高度（rpx → px），供 scroll-view 高度计算使用
  _initSearchHeaderHeight() {
    try {
      const windowWidth = wx.getWindowInfo().windowWidth
      // padding 16rpx * 2 + input-wrap 内容 64rpx（16rpx padding * 2 + 32rpx 字体）
      const heightRpx = 96
      const heightPx = Math.round(heightRpx * windowWidth / 750)
      this.setData({ searchHeaderHeight: heightPx })
    } catch (e) {
      // 降级使用默认值
    }
  },

  _loadHistory() {
    try {
      const history = wx.getStorageSync(HISTORY_KEY) || []
      this.setData({ history })
    } catch (e) {
      this.setData({ history: [] })
    }
  },

  _saveHistory(keyword) {
    let history = this.data.history.filter((k) => k !== keyword)
    history.unshift(keyword)
    history = history.slice(0, MAX_HISTORY)
    this.setData({ history })
    try {
      wx.setStorageSync(HISTORY_KEY, history)
    } catch (e) {
      // 忽略存储失败
    }
  },

  handleInput(e) {
    const keyword = e.detail.value
    // model:value 已自动同步 keyword，这里仅做防抖搜索
    this.setData({ showHistory: !keyword })
    if (!keyword.trim()) {
      this.setData({ results: [], searched: false })
      return
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
    }
    this._debounceTimer = setTimeout(() => {
      this._doSearch()
    }, 300)
  },

  handleSearch() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
    }
    this._doSearch()
  },

  handleClearInput() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
    }
    this.setData({
      keyword: '',
      results: [],
      searched: false,
      showHistory: true,
    })
  },

  handleHotKeyword(e) {
    const keyword = e.currentTarget.dataset.keyword
    this._keyword = keyword
    this.setData({ keyword, showHistory: false })
    this._doSearch()
  },

  handleHistoryKeyword(e) {
    const keyword = e.currentTarget.dataset.keyword
    this._keyword = keyword
    this.setData({ keyword, showHistory: false })
    this._doSearch()
  },

  handleClearHistory() {
    wx.showModal({
      title: '提示',
      content: '确认清空搜索历史？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [] })
          wx.removeStorageSync(HISTORY_KEY)
        }
      },
    })
  },

  async _doSearch() {
    const keyword = this.data.keyword.trim()
    if (!keyword) return

    this.setData({ loading: true, searched: true })
    this._saveHistory(keyword)

    try {
      const res = await wx.cloud.callFunction({
        name: 'searchService',
        data: {
          keyword,
          type: 'all',
        },
      })

      const result = (res && res.result) || {}
      const data = result.data || { list: [], total: 0 }
      const list = (data.list || []).map((item) => this._normalizeItem(item))

      this.setData({ results: list, loading: false })
    } catch (err) {
      this.setData({ results: [], loading: false })
      wx.showToast({ title: '搜索失败，请重试', icon: 'none' })
    }
  },

  _normalizeItem(item) {
    const typeLabelMap = {
      product: '商品',
      tuan: '团购',
      activity: '活动',
      host: '寄养',
    }

    let title = ''
    let coverUrl = ''
    let priceText = ''
    let subtitle = ''

    switch (item._type) {
      case 'product':
        title = item.name || ''
        coverUrl = item.coverUrl || ''
        priceText = item.price != null ? `¥${item.price}` : ''
        subtitle = item.subTitle || item.category || ''
        break
      case 'tuan':
        title = item.title || ''
        coverUrl = item.coverUrl || ''
        priceText = item.minPrice != null ? `¥${item.minPrice}` : ''
        subtitle = item.totalOrders > 0 ? `已拼${item.totalOrders}件` : ''
        break
      case 'activity':
        title = item.title || ''
        coverUrl = item.coverUrl || ''
        subtitle = item.location || ''
        break
      case 'host':
        title = item.hostName || ''
        coverUrl = item.avatarUrl || ''
        priceText = item.pricePerDay != null ? `¥${item.pricePerDay}/天` : ''
        subtitle = item.address || ''
        break
    }

    return {
      ...item,
      _title: title,
      _coverUrl: coverUrl,
      _priceText: priceText,
      _subtitle: subtitle,
      _typeLabel: typeLabelMap[item._type] || '',
    }
  },

  handleItemTap(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item._id) return

    const routes = {
      product: `/subpackages/mall/product-detail?id=${item._id}`,
      tuan: `/pages/group-detail/index?dealId=${item._id}`,
      activity: `/subpackages/activity/detail?id=${item._id}`,
      host: `/subpackages/booking/host-detail?hostId=${item._id}`,
    }

    const url = routes[item._type]
    if (url) {
      wx.navigateTo({ url })
    }
  },

  handleCancel() {
    wx.navigateBack({ delta: 1 })
  },
})
