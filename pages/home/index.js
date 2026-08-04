const app = getApp()
const { ListBehavior } = require('../../behaviors/listBehavior')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const homeBannerBehavior = require('../../behaviors/homeBannerBehavior')
const homePetBehavior = require('../../behaviors/homePetBehavior')
const homeActivityBehavior = require('../../behaviors/homeActivityBehavior')
const homeTuanBehavior = require('../../behaviors/homeTuanBehavior')
const homeMallBehavior = require('../../behaviors/homeMallBehavior')
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
  behaviors: [ListBehavior, tabBarSyncBehavior, cloudImageBehavior, shareEntryBehavior, homeBannerBehavior, homePetBehavior, homeActivityBehavior, homeTuanBehavior, homeMallBehavior],
  data: {
    t: pageI18n.buildTMap('zh-CN'),
    isLoggedIn: false,
    userInfo: null,
    locale: 'zh-CN',
    todayDate: '',
    weatherTemp: 14,
    unreadCount: 0,
    _refreshPulling: false,
    featureItems: [
      { id: 'activity', name: '线下活动', desc: '精彩社区活动', icon: FEATURE_ICONS[0] },
      { id: 'mall', name: '宠物商城', desc: '精选好物推荐', icon: FEATURE_ICONS[1] },
    ],
    recentViews: [],
    iconTimeLine: CLOUD_ICON_TIME,
    iconMapPin: CLOUD_ICON_MAP_PIN,
  },

  onLoad() {
    this._initNavbarHeight()
    const locale = app && app.globalData ? app.globalData.locale : 'zh-CN'
    this.setData({ t: pageI18n.buildTMap(locale), locale })
    this._initToday()
    this._initBanner()
    this._initParallax()
    this._initRefreshAnimation()
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
    this._loadMallProducts()
  },

  _refreshUserData() {
    const currentAuthService = app.globalData ? app.globalData.authService : null
    if (!currentAuthService) { return }

    const isLoggedIn = currentAuthService.isLoggedIn()
    const userInfo = app.globalData.userInfo

    this.setData({ isLoggedIn, userInfo })
    // 登录态变化时 topbar 显隐，需重新计算 scroll-view 布局
    this._updateScrollLayout()

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

  // ================================================================
  // Worklet 视差滚动
  // ----------------------------------------------------------------
  // 滚动时 hero 图片轻微放大 + 上移，产生层次感
  // worklet 在 UI 线程同步驱动 transform，无 setData 开销，60fps 流畅
  // ================================================================
  _initParallax() {
    if (!wx.worklet || !this.applyAnimatedStyle) return
    const { shared } = wx.worklet
    this._heroScrollY = shared(0)

    const scrollY = this._heroScrollY
    // Hero 图片：视差上移 + 轻微放大（丝绸层叠感）
    const updateHeroStyle = () => {
      'worklet'
      const y = scrollY.value
      const clampedY = Math.min(Math.max(y, 0), 350)
      const translateY = -clampedY * 0.25
      const scale = 1 + clampedY * 0.0002
      return { transform: `translateY(${translateY}px) scale(${scale})` }
    }

    // Hero 遮罩：滚动时渐深（聚焦内容）
    const updateOverlayStyle = () => {
      'worklet'
      const y = scrollY.value
      const clampedY = Math.min(Math.max(y, 0), 350)
      const opacity = 0.55 + clampedY * 0.001
      return { opacity: opacity }
    }

    // Hero 文字：视差上移速度更快（漂浮感）+ 渐隐
    const updateHeroTextStyle = () => {
      'worklet'
      const y = scrollY.value
      const clampedY = Math.min(Math.max(y, 0), 280)
      const translateY = -clampedY * 0.4
      const opacity = 1 - clampedY / 280
      return { transform: `translateY(${translateY}px)`, opacity: opacity }
    }

    wx.nextTick(() => {
      try {
        this._cancelHeroStyle = this.applyAnimatedStyle('.hero-card', updateHeroStyle)
        this._cancelOverlayStyle = this.applyAnimatedStyle('.hero-overlay', updateOverlayStyle)
        this._cancelHeroTextStyle = this.applyAnimatedStyle('.hero-text', updateHeroTextStyle)
      } catch (e) {
        this._cancelHeroStyle = null
        this._cancelOverlayStyle = null
        this._cancelHeroTextStyle = null
      }
    })
  },

  // 由 listBehavior._onScroll 调用，直接更新 SharedValue（无 setData 开销）
  _onParallaxScroll(scrollTop) {
    if (this._heroScrollY) {
      this._heroScrollY.value = scrollTop
    }
  },

  onUnload() {
    if (this._cancelHeroStyle) {
      this._cancelHeroStyle()
      this._cancelHeroStyle = null
    }
    if (this._cancelOverlayStyle) {
      this._cancelOverlayStyle()
      this._cancelOverlayStyle = null
    }
    if (this._cancelHeroTextStyle) {
      this._cancelHeroTextStyle()
      this._cancelHeroTextStyle = null
    }
    this._teardownRefreshAnimation()
  },

  // ================================================================
  // Worklet 下拉刷新阻尼弹簧
  // ----------------------------------------------------------------
  // 下拉时：指示器阻尼跟随（下拉距离 * 0.5，越拉越阻尼）
  // 释放后：spring 动画回弹到原位，带物理弹性
  // 超过阈值（80rpx）：箭头翻转，提示松手刷新
  // ================================================================
  _initRefreshAnimation() {
    if (!wx.worklet || !this.applyAnimatedStyle) return
    const { shared } = wx.worklet
    // 下拉距离 SharedValue（阻尼后）
    this._refreshY = shared(0)

    const refreshY = this._refreshY
    const updateRefreshStyle = () => {
      'worklet'
      // 阻尼系数 0.5：实际位移是下拉距离的一半，产生阻尼感
      const y = refreshY.value * 0.5
      const opacity = Math.min(y / 40, 1) // 40px 时完全显示
      return {
        transform: `translateY(${y}px)`,
        opacity: opacity,
      }
    }

    wx.nextTick(() => {
      try {
        this._cancelRefreshStyle = this.applyAnimatedStyle('.refresh-indicator', updateRefreshStyle)
      } catch (e) {
        this._cancelRefreshStyle = null
      }
    })
  },

  // scroll-view bindrefresherpulling：下拉过程中持续触发
  _onRefresherPulling(e) {
    if (!this._refreshY) return
    const dy = e.detail.deltaY || 0
    // 更新 SharedValue，worklet 在 UI 线程同步驱动样式（无 setData 开销）
    this._refreshY.value = Math.max(0, dy)
    // 超过阈值时翻转箭头（用 setData，频率较低可接受）
    const threshold = 80
    if (dy >= threshold && !this.data._refreshPulling) {
      this.setData({ _refreshPulling: true })
    } else if (dy < threshold && this.data._refreshPulling) {
      this.setData({ _refreshPulling: false })
    }
  },

  // scroll-view bindrefresherabort：下拉未触发刷新被中断
  _onRefresherAbort() {
    this._animateRefreshBack()
  },

  // 刷新结束钩子：listBehavior._onRefresherRefresh 完成后调用
  // 触发 worklet spring 回弹动画
  _afterRefresherRefresh() {
    this.setData({ _refreshPulling: false })
    this._animateRefreshBack()
  },

  _animateRefreshBack() {
    if (!this._refreshY) return
    const { spring, runOnUI } = wx.worklet || {}
    if (!runOnUI) return
    runOnUI(() => {
      'worklet'
      this._refreshY.value = spring(0, {
        stiffness: 200,
        damping: 20,
        mass: 1,
      })
    })()
  },

  _teardownRefreshAnimation() {
    if (this._cancelRefreshStyle) {
      this._cancelRefreshStyle()
      this._cancelRefreshStyle = null
    }
    this._refreshY = null
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
    wx.navigateTo({ url: '/subpackages/search/index' })
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
      feeding: '/subpackages/feeding/confirm-service',
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
