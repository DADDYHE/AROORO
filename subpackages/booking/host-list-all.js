const { HostService } = require('../../services/CloudFunctionService')
const { extractCityAndDistrict } = require('../../utils/addressUtils')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    isHeaderScrolled: false,
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
  },

  onLoad(options) {
    this.getHostList()
  },

  onShow() {
    if (this.data.hosts.length === 0 && !this.data.isLoading) {
      this.getHostList()
    }
  },

  onPageScroll(e) {
    const isHeaderScrolled = e.scrollTop > 50
    if (isHeaderScrolled !== this.data.isHeaderScrolled) {
      this.setData({ isHeaderScrolled })
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hosts: [], hasMore: true })
    this.getHostList(() => { wx.stopPullDownRefresh() })
  },

  onReachBottom() {
    if (!this.data.isLoading && this.data.hasMore) {
      this.getHostList()
    }
  },

  async getHostList(callback) {
    this.setData({ isLoading: true, errorMsg: '', showEmptyState: false })

    try {
      const params = {
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: this.data.searchKeyword,
        sort: this.data.activeSort,
        filters: this.data.filters,
      }

      const result = await HostService.getHostList(params)

      if (result && result.code === 0) {
        const hostData = (result.data && result.data.list) || []

        if (hostData.length === 0) {
          this.setData({ hosts: [], isLoading: false, hasMore: false, showEmptyState: true })
          if (callback) {callback()}
          return
        }

        const hosts = hostData.map((host, index) => {
          const originalId = host._id || host.id || host.hostProfileId || ''
          const uniqueId = originalId ? `${originalId}_${this.data.page}_${index}` : `host_${Date.now()}_${index}`

          const photos = host.photos && host.photos.length > 0
            ? host.photos
            : [host.avatarUrl || '/images/default-avatar.svg']

          return {
            id: uniqueId,
            originalId,
            name: host.hostName || host.name || '匿名寄养家庭',
            description: host.description || '专业宠物寄养服务，提供24小时贴心照顾',
            avatarUrl: host.avatarUrl && host.avatarUrl !== '/images/default-avatar.png'
              ? host.avatarUrl : '/images/default-avatar.svg',
            photos,
            price: host.pricePerDay || host.price || 80,
            priceUnit: '天',
            location: extractCityAndDistrict(host.address),
            tags: host.tags || ['有经验', '爱干净'],
            roomType: host.housingType || host.roomType || '独立房间',
            petLimit: host.maxPets || host.petLimit || 3,
            distance: host.distance || null,
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
        })
      } else {
        this.setData({ isLoading: false, errorMsg: result?.message || '获取失败' })
        this.errorDynamic(result?.message, 'GET_FAILED')
      }
    } catch (error) {
      console.error('[host-list-all] 获取寄养家庭列表失败', error)
      this.setData({ isLoading: false, errorMsg: '网络异常，请稍后重试' })
      this.error('GET_RETRY')
    } finally {
      this.setData({ isLoading: false })
      if (callback) {callback()}
    }
  },

  handleSearchInput(e) { this.setData({ searchKeyword: e.detail.value }) },

  handleSearch() {
    this.setData({ page: 1, hosts: [], hasMore: true })
    this.getHostList()
  },

  showFilterModal() { this.setData({ showFilterModal: true }) },
  closeFilterModal() { this.setData({ showFilterModal: false }) },

  toggleFilter(category, key) {
    const filters = { ...this.data.filters }
    filters[category][key] = !filters[category][key]
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
        console.error('[host-list-all] 跳转失败:', err)
        this.showModal({ titleKey: 'NAVIGATE_FAILED', contentKey: 'BIZ_1BCURQC', showCancel: false })
      },
    })
  },
})
