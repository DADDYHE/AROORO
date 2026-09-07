const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { HostService } = require('../../services/CloudFunctionService')
const { formatRegion } = require('../../utils/addressUtils')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')

const pageI18n = require('../../utils/page-i18n.js')
const { buildSharePath } = require('../../utils/share')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, tabBarSyncBehavior, shareEntryBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    isLoading: true,
    hasMore: true,
    page: 1,
    pageSize: 10,
    searchKeyword: '',
    activeSort: 'default',
    showFilterModal: false,
    filters: {
      petTypes: { dog: true, cat: true, other: false },
      services: { board: true, walk: false, feed: false },
      price: { min: '', max: '' },
    },
    hosts: [],
    errorMsg: '',
    showEmptyState: false,
    totalCount: 0,
  },

  onLoad(options) {
    this._initNavbarHeight()
    // 邀请落地接力（2026-09-07）：接收者端版本差异导致分享回退到本页时，
    //   检测邀请码转发到填写页（体验/开发版可用；正式版上线后自然闭环）
    if (options && options.code) {
      wx.navigateTo({
        url: `/subpackages/booking/invitation-fill/index?code=${options.code}`,
        fail: () => {
          wx.showModal({ title: '邀请链接', content: '当前小程序版本暂不支持开单邀请，请更新小程序后重试', showCancel: false })
        },
      })
      return
    }
    this.getHostList()
  },

  onShow() {
    this._syncTabBar()
    if (this.data.hosts.length === 0 && !this.data.isLoading) {
      this.getHostList()
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hosts: [], hasMore: true })
    this.getHostList(() => { wx.stopPullDownRefresh() }, true)
  },

  onReachBottom() {
    if (!this.data.isLoading && this.data.hasMore) {
      this.getHostList()
    }
  },

  async getHostList(callback, forceRefresh) {
    this.setData({ isLoading: true, errorMsg: '', showEmptyState: false })

    try {
      const params = {
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: this.data.searchKeyword,
        sort: this.data.activeSort,
        filters: this.data.filters,
      }

      const opts = forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 }
      const result = await HostService.getHostList(params, opts)

      if (result && result.code === 0) {
        const hostData = (result.data && result.data.list) || []

        if (hostData.length === 0) {
          this.setData({ hosts: [], isLoading: false, hasMore: false, showEmptyState: true, totalCount: this.data.page === 1 ? 0 : this.data.totalCount })
          if (callback) {callback()}
          return
        }

        const hosts = hostData.map((host, index) => {
          const originalId = host._id || host.id || host.hostProfileId || ''
          const uniqueId = originalId ? `${originalId}_${this.data.page}_${index}` : `host_${Date.now()}_${index}`

          const photos = host.photos && host.photos.length > 0
            ? host.photos
            : [host.avatarUrl || '/images/default-avatar.svg']

          // 简介两行截断（Skyline 下 wxml 无 line-clamp 把握，JS 预截断）
          const rawDesc = host.description || '专业宠物寄养服务，提供24小时贴心照顾'
          const shortDesc = rawDesc.length > 28 ? `${rawDesc.slice(0, 28)}…` : rawDesc

          return {
            id: uniqueId,
            originalId,
            name: host.hostName || host.name || '匿名寄养家庭',
            description: rawDesc,
            shortDesc,
            avatarUrl: host.avatarUrl && host.avatarUrl !== '/images/default-avatar.png'
              ? host.avatarUrl : '/images/default-avatar.svg',
            photos,
            price: host.pricePerDay || host.price || 80,
            priceUnit: '天',
            location: formatRegion(host),
            // 评分（列表投影透出）：无评分不显示金星
            rating: Number(host.averageRating) || 0,
            // 收费方式简洁标签（勿与寄养方式 boardingMode 混淆）；缺失不显示
            billingLabel: host.billingMode === 'hourly24' ? '24小时制'
              : host.billingMode === 'hotel' ? '酒店式' : '',
            isRecommended: host.isRecommended || false,
            isAcceptingOrders: host.isAcceptingOrders !== false,
          }
        })

        const existingOriginalIds = new Set(this.data.hosts.map(h => h.originalId).filter(Boolean))
        const uniqueHosts = hosts.filter(h => !existingOriginalIds.has(h.originalId))
        const updatedHosts = this.data.page === 1 ? uniqueHosts : [...this.data.hosts, ...uniqueHosts]

        const totalCount = result.data.total || 0
        const hasMore = updatedHosts.length < totalCount

        const newPage = this.data.page + (uniqueHosts.length > 0 ? 1 : 0)

        this.setData({
          hosts: updatedHosts,
          page: newPage,
          isLoading: false,
          hasMore,
          totalCount: result.data.total || updatedHosts.length,
        })

        // 封面高度真实化：实测首图比例 → 卡片高度严丝合缝等于图高（下限 420 装下信息列）
        if (uniqueHosts.length > 0) {
          this._computeCoverHeights(uniqueHosts)
        }
      } else {
        this.setData({ isLoading: false, errorMsg: result?.message || '获取失败' })
        this.errorDynamic(result?.message, 'GET_FAILED')
      }
    } catch (error) {
      console.error('[boarding] 获取寄养家庭列表失败', error)
      this.setData({ isLoading: false, errorMsg: '网络异常，请稍后重试' })
      this.error('GET_RETRY')
    } finally {
      this.setData({ isLoading: false })
      if (callback) {callback()}
    }
  },

  /**
   * 封面高度真实化：实测首图宽高比 → photoH = max(420, 264 × h/w)
   *   - 竖图（3:4/9:16）：卡片高度 = 图高，零裁切
   *   - 横图/方图：保底 420rpx 装下信息列（aspectFill 居中裁切兜底）
   * 宽 264 固定；getImageInfo 同 URL 有微信侧缓存，翻页增量开销可控
   */
  _computeCoverHeights(newHosts) {
    newHosts.forEach(h => {
      const src = h.photos && h.photos[0]
      if (!src) {return}
      wx.getImageInfo({
        src,
        success: res => {
          if (!res.width) {return}
          const photoH = Math.max(400, Math.round(300 * (res.height / res.width)))
          const idx = this.data.hosts.findIndex(x => x.id === h.id)
          if (idx > -1 && this.data.hosts[idx].photoH !== photoH) {
            this.setData({ [`hosts[${idx}].photoH`]: photoH })
          }
        },
        fail: () => { /* 兜底默认 420，不打断列表 */ },
      })
    })
  },

  handleSearchInput(e) { this.setData({ searchKeyword: e.detail.value }) },

  handleSearch() {
    this.setData({ page: 1, hosts: [], hasMore: true })
    this.getHostList()
  },

  showFilterModal() { this.setData({ showFilterModal: true }) },
  closeFilterModal() { this.setData({ showFilterModal: false }) },

  /** 筛选 chip 切换（原生 wxml 不支持内联传参，走 dataset） */
  onToggleFilter(e) {
    const { category, key } = e.currentTarget.dataset
    if (!category || !key) { return }
    const filters = { ...this.data.filters }
    filters[category] = { ...filters[category], [key]: !filters[category][key] }
    this.setData({ filters })
  },

  handlePriceInput(e) {
    const type = e.currentTarget.dataset.type
    const value = e.detail.value
    const filters = { ...this.data.filters }
    filters.price[type] = value
    this.setData({ filters })
  },

  resetFilters() {
    this.setData({
      filters: {
        petTypes: { dog: true, cat: true, other: false },
        services: { board: true, walk: false, feed: false },
        price: { min: '', max: '' },
      },
    })
  },

  applyFilters() {
    this.setData({ showFilterModal: false, page: 1, hosts: [], hasMore: true })
    this.getHostList()
  },

  selectHost(e) {
    const hostId = e?.currentTarget?.dataset?.id || ''
    const host = this.data.hosts.find(h => h.id === hostId)
    const actualId = host?.originalId || hostId
    if (!actualId) {
      this.error('HOST_INFO_INVALID')
      return
    }
    wx.navigateTo({ url: `/subpackages/booking/host-detail?id=${actualId}` })
  },

  bookHost(e) {
    if (e && typeof e.stopPropagation === 'function') {e.stopPropagation()}
    const hostId = e?.currentTarget?.dataset?.id || ''
    const host = this.data.hosts.find(h => h.id === hostId)
    const actualId = host?.originalId || hostId
    if (!actualId) {
      this.error('HOST_INFO_INVALID')
      return
    }
    wx.navigateTo({
      url: `/subpackages/booking/confirm?hostId=${actualId}`,
      fail: err => {
        console.error('[boarding] 跳转失败:', err)
        this.showModal({ titleKey: 'NAVIGATE_FAILED', contentKey: 'BIZ_1BCURQC', showCancel: false })
      },
    })
  },

  onShareAppMessage() {
    return {
      title: 'AROORO - 家庭寄养，安心呼噜放心托付',
      path: buildSharePath('/pages/boarding/index'),
    }
  },
})
