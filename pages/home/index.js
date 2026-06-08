const app = getApp()
const { authService } = require('../../services/AuthService')
const { PetService, HostService, UtilityService, ActivityService } = require('../../services/CloudFunctionService')
const { TuanService } = require('../../services/TuanService')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { sortAndSliceActivities } = require('../../utils/activityFormatter')

const FEATURE_ICONS = [
  'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/megaphone-line.svg',
  'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/shopping-cart-2-line.svg',
  'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/door-open-line.svg',
  'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/home-heart-line.svg',
]

const CLOUD_ICON_TIME = 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/time-line.svg'
const CLOUD_ICON_MAP_PIN = 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/map-pin-line.svg'

Page({
  behaviors: [tabBarSyncBehavior, cloudImageBehavior],
  data: {
    isLoggedIn: false,
    userInfo: null,
    bannerList: [],
    bannerHeight: 422,
    featureItems: [
      { id: 'activity', name: '线下活动', desc: '精彩社区活动', icon: FEATURE_ICONS[0] },
      { id: 'mall', name: '宠物商城', desc: '精选好物推荐', icon: FEATURE_ICONS[1] },
    ],
    myPets: [],
    latestActivities: [],
    tuanDeals: [],
    recentViews: [],
    iconTimeLine: CLOUD_ICON_TIME,
    iconMapPin: CLOUD_ICON_MAP_PIN,
  },

  onLoad() {
    const windowWidth = wx.getWindowInfo().windowWidth
    const bannerHeight = Math.round(windowWidth * 9 / 16)
    this.setData({ bannerHeight })
  },

  onShow() {
    this._syncTabBar()
    this._initPage()
    this._refreshUserData()
  },

  onHide() {
  },

  onUnload() {
  },

  _onSessionRestored() {
    this._refreshUserData()
  },

  _initPage() {
    try {
      this._loadBannerData()
      this._loadTuanDeals()
      this._loadLatestActivities()
    } catch (e) {
      console.error('[home] 初始化失败:', e)
    }
  },

  _refreshUserData() {
    const currentAuthService = app.globalData ? app.globalData.authService : null
    if (!currentAuthService) {return}

    const isLoggedIn = currentAuthService.isLoggedIn()
    const userInfo = app.globalData.userInfo

    this.setData({ isLoggedIn, userInfo })

    if (isLoggedIn) {
      this._loadMyPets()
      this._loadRecentViews()
    }
  },

  async _loadBannerData() {
    try {
      const result = await UtilityService.getBanners()
      if (result && result.code === 0 && result.data) {
        const list = result.data.list || []
        this.setData({ bannerList: list })
      } else {
        console.warn('[home] 未获取到Banner数据，请在后台管理系统中配置')
        this.setData({ bannerList: [] })
      }
    } catch (error) {
      console.error('[home] 获取Banner失败:', error)
      this.setData({ bannerList: [] })
    }
  },

  async _loadMyPets() {
    try {
      const result = await PetService.getPetList()

      if (!result || result.code !== 0) {
        throw new Error(result?.message || '获取宠物列表失败')
      }

      const data = result.data || {}
      const pets = data.list || data.pets || []

      const myPets = (Array.isArray(pets) ? pets : []).map(pet => ({
        _id: pet._id || pet.id,
        name: pet.name || '',
        breed: pet.breed || '',
        birthday: pet.birthday || '',
        avatarUrl: pet.avatarUrl || '/images/default-avatar.svg',
        genderClass: pet.gender === 'male' ? 'male' : pet.gender === 'female' ? 'female' : 'unknown',
        type: pet.type || '',
      }))

      this.setData({ myPets, displayPets: myPets.slice(0, 2), hasMorePets: myPets.length > 2 })
    } catch (error) {
      console.error('[home] 获取宠物列表失败:', error)
      this.setData({ myPets: [] })
    }
  },

  async _loadLatestActivities() {
    try {
      const result = await ActivityService.getActivityList({ status: 'published' })
      if (result && result.code === 0) {
        const sorted = sortAndSliceActivities(result.data?.list || [], 5)
        this.setData({ latestActivities: sorted })
      } else {
        this.setData({ latestActivities: [] })
      }
    } catch (error) {
      console.error('[home] 获取最新活动失败:', error)
      this.setData({ latestActivities: [] })
    }
  },

  async _loadTuanDeals() {
    try {
      const result = await TuanService.getTuanDealList({ page: 1, pageSize: 4 })
      if (result && result.code === 0 && result.data) {
        const list = (result.data.list || []).map(deal => ({
          _id: deal._id,
          title: deal.title || '',
          coverUrl: deal.coverUrl || '',
          minPrice: deal.minPrice || 0,
          totalOrders: deal.totalOrders || 0,
          endTime: deal.endTime || '',
        }))
        this.setData({ tuanDeals: list })
      } else {
        this.setData({ tuanDeals: [] })
      }
    } catch (error) {
      console.error('[home] 获取宠团团失败:', error)
      this.setData({ tuanDeals: [] })
    }
  },

  _loadRecentViews() {
    this.setData({ recentViews: [] })
  },

  onPullDownRefresh() {
    this._initPage()
    this._refreshUserData()
    wx.stopPullDownRefresh()
  },

  handleLogin() {
    if (this.isLogging) {return}
    this.isLogging = true

    const currentApp = getApp()
    if (currentApp.globalData.authService) {
      currentApp.globalData.authService.startLogin()
    }
    this.isLogging = false
  },

  handleSearch() {
    wx.navigateTo({ url: '/subpackages/booking/host-list-all' })
  },

  handleFeatureTap(e) {
    const id = e.currentTarget.dataset.id
    console.log('[home] 功能入口点击:', id)
    const routes = {
      activity: '/subpackages/activity/list',
      mall: '/subpackages/mall/product-list',
    }
    const url = routes[id]
    if (!url) {
      console.warn('[home] 未找到路由:', id)
      return
    }
    console.log('[home] 跳转:', url)
    wx.navigateTo({ url })
  },

  handleBannerTap(e) {
    const action = e.currentTarget.dataset.action
    const actionTarget = e.currentTarget.dataset.target || ''

    if (action === 'none' || !action) {return}

    const routes = {
      boarding: '/subpackages/booking/host-list-all',
      feeding: '/subpackages/feeding/groomer-list',
      activity: '/subpackages/activity/list',
      mall: '/subpackages/mall/product-list',
      tuan: '/pages/discover/index',
      coupon: '/subpackages/coupon/my-coupons',
      partner: '/subpackages/partner/home/index',
    }

    const tabPages = ['/pages/discover/index']

    const detailRoutes = {
      activity_detail: '/subpackages/activity/detail?id=',
      product_detail: '/subpackages/mall/product-detail?id=',
      tuan_detail: '/pages/group-detail/index?id=',
    }

    if (routes[action]) {
      const url = routes[action]
      if (tabPages.includes(url)) {
        wx.switchTab({ url })
      } else {
        wx.navigateTo({ url })
      }
    } else if (detailRoutes[action] && actionTarget) {
      wx.navigateTo({ url: detailRoutes[action] + actionTarget })
    } else if (action === 'page' && actionTarget) {
      if (tabPages.some(p => actionTarget.startsWith(p))) {
        wx.switchTab({ url: actionTarget })
      } else {
        wx.navigateTo({ url: actionTarget })
      }
    }
  },

  handlePetTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/pet/detail?id=${id}` })
  },

  handleAddPet() {
    wx.navigateTo({ url: '/subpackages/pet/create-step1' })
  },

  handleViewAllPets() {
    wx.navigateTo({ url: '/subpackages/pet/list' })
  },

  handleHostTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/booking/host-detail?id=${id}` })
  },

  handleViewAllOrders() {
    wx.navigateTo({ url: '/subpackages/profile/order-stats/index?type=boarding' })
  },

  handleViewAllActivities() {
    wx.navigateTo({ url: '/subpackages/activity/list' })
  },

  handleViewAllTuan() {
    wx.navigateTo({ url: '/subpackages/tuan/list' })
  },

  handleTuanTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/tuan/detail?id=${id}` })
  },

  handleActivityTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
  },

  handleViewAllHosts() {
    wx.navigateTo({ url: '/subpackages/booking/host-list-all' })
  },

  handleRecentViewTap(e) {
    const id = e.currentTarget.dataset.id
    const type = e.currentTarget.dataset.type
    if (type === 'host') {
      wx.navigateTo({ url: `/subpackages/booking/host-detail?id=${id}` })
    } else if (type === 'activity') {
      wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
    }
  },

  onShareAppMessage() {
    const userInfo = getApp().globalData.userInfo
    const inviterId = ((userInfo?.isPartner || userInfo?.permissions?.length) && userInfo?.openid) ? userInfo.openid : ''
    return {
      title: 'AROORO - 安心寄养，让爱宠如家',
      path: inviterId ? `/pages/home/index?inviterId=${inviterId}` : '/pages/home/index',
    }
  },
})
