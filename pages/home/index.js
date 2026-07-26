const app = getApp()
const { authService } = require('../../services/AuthService')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const homeBannerBehavior = require('../../behaviors/homeBannerBehavior')
const homePetBehavior = require('../../behaviors/homePetBehavior')
const homeActivityBehavior = require('../../behaviors/homeActivityBehavior')
const homeTuanBehavior = require('../../behaviors/homeTuanBehavior')
const { buildSharePath } = require('../../utils/share')
const { CLOUD_ICONS } = require('../../utils/cloudIcons')
const pageI18n = require('../../utils/page-i18n.js')

const FEATURE_ICONS = [
  CLOUD_ICONS.MEGAPHONE,
  CLOUD_ICONS.SHOPPING_CART,
  CLOUD_ICONS.DOOR_OPEN,
  CLOUD_ICONS.HOME_HEART,
]

const CLOUD_ICON_TIME = CLOUD_ICONS.TIME
const CLOUD_ICON_MAP_PIN = CLOUD_ICONS.MAP_PIN

Page({
  ...pageI18n.mixin(),
  behaviors: [tabBarSyncBehavior, cloudImageBehavior, shareEntryBehavior, homeBannerBehavior, homePetBehavior, homeActivityBehavior, homeTuanBehavior],
  data: {
    t: pageI18n.buildTMap('zh-CN'),
    isLoggedIn: false,
    userInfo: null,
    locale: 'zh-CN',
    todayDate: '',
    weatherTemp: 14,
    unreadCount: 0,
    featureItems: [
      { id: 'activity', name: '线下活动', desc: '精彩社区活动', icon: FEATURE_ICONS[0] },
      { id: 'mall', name: '宠物商城', desc: '精选好物推荐', icon: FEATURE_ICONS[1] },
    ],
    recentViews: [],
    iconTimeLine: CLOUD_ICON_TIME,
    iconMapPin: CLOUD_ICON_MAP_PIN,
  },

  onLoad() {
    const locale = app && app.globalData ? app.globalData.locale : 'zh-CN'
    this.setData({ t: pageI18n.buildTMap(locale), locale })
    this._initToday()
    this._initBanner()
  },

  _initToday() {
    const now = new Date()
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const month = now.getMonth() + 1
    const date = now.getDate()
    const weekday = weekdays[now.getDay()]
    this.setData({
      todayDate: `${month}月${date}日 ${weekday}`,
      weatherTemp: Math.floor(10 + Math.random() * 15),
    })
  },

  onShow() {
    this._syncTabBar()
    this._initPage()
    this._refreshUserData()
  },

  _onSessionRestored() {
    this._refreshUserData()
  },

  _initPage() {
    this._loadBannerData()
    this._loadTuanDeals()
    this._loadLatestActivities()
  },

  _refreshUserData() {
    const currentAuthService = app.globalData ? app.globalData.authService : null
    if (!currentAuthService) { return }

    const isLoggedIn = currentAuthService.isLoggedIn()
    const userInfo = app.globalData.userInfo

    this.setData({ isLoggedIn, userInfo })

    if (isLoggedIn) {
      this._loadMyPets()
      this._loadRecentViews()
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
    if (this.isLogging) { return }
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
    const routes = {
      activity: '/subpackages/activity/list',
      mall: '/subpackages/mall/product-list',
    }
    const url = routes[id]
    if (!url) { return }
    wx.navigateTo({ url })
  },

  handleBannerTap(e) {
    const action = e.currentTarget.dataset.action
    const actionTarget = e.currentTarget.dataset.target || ''

    if (action === 'none' || !action) { return }

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
      tuan_detail: '/pages/group-detail/index?dealId=',
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

  handleViewAllActivities() {
    wx.navigateTo({ url: '/subpackages/activity/list' })
  },

  handleViewAllTuan() {
    wx.switchTab({ url: '/pages/discover/index' })
  },

  handleTuanTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) { return }
    wx.navigateTo({ url: `/pages/group-detail/index?dealId=${id}` })
  },

  handleActivityTap(e) {
    const id = e.detail.id || e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
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
    return {
      title: 'AROORO - 安心寄养，让爱宠如家',
      path: buildSharePath('/pages/home/index'),
    }
  },
})
