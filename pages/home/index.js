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
const homeMyActivitiesBehavior = require('../../behaviors/homeMyActivitiesBehavior')
const { buildSharePath } = require('../../utils/share')
const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, tabBarSyncBehavior, cloudImageBehavior, shareEntryBehavior, homeBannerBehavior, homePetBehavior, homeActivityBehavior, homeTuanBehavior, homeMallBehavior, homeMyActivitiesBehavior],
  data: {
    t: pageI18n.buildTMap('zh-CN'),
    isLoggedIn: false,
    userInfo: null,
    locale: 'zh-CN',
    todayDate: '',
    _refreshPulling: false,
    // 导航栏 + 顶部栏共用深绿宝石渐变带（白高光贯穿两栏）
    gemNavbarBg: 'linear-gradient(135deg, #2D4F2D 0%, #0F2410 100%)',
    gemTopbarStyle: '', // 空串 = 回落 wxss 兜底渐变（勿给默认值，否则会拼出 size:0 的空背景）
  },

  onLoad() {
    // 启动首屏海报：独立启动页（非 tab 页 + custom 导航栏，框架级全屏，
    // 100% 覆盖 navbar 与系统 tabBar）。仅冷启动首屏一次。
    if (app && !app.__splashShown) {
      const sync = app.globalData && app.globalData.__splashSync
      // 已同步缓存且明确关闭 -> 跳过；其余（启用 / 首启未知）都进入启动页最终裁决
      if (!(sync && sync.enabled === false)) {
        app.__splashShown = true
        // 冷启动首屏页面栈未就绪，navigateTo 会被静默丢弃；
        // reLaunch 重建栈、可靠打开启动页，且销毁首页不渲染其可见帧（根绝闪屏）。
        wx.reLaunch({ url: '/pages/splash/index' })
      }
    }
    this._initNavbarHeight()
    this._initGemBand()
    const locale = app && app.globalData ? app.globalData.locale : 'zh-CN'
    this.setData({ t: pageI18n.buildTMap(locale), locale })
    this._initToday()
    this._initBanner()
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
    })
  },

  // 导航栏 + 顶部栏共用同一条深绿宝石渐变带：用 background-size/position 偏移让白高光贯穿两栏。
  // 导航栏(占位高度 navH px) 取长带 [0, navH]，顶部栏(96rpx) 取长带 [navH, navH+topbarH]，
  // 两栏共用同一张渐变图 + 同一 background-size，靠 position 偏移对齐 => 极光帘幕跨接缝连续（仅 scroll=0 成立）。
  _initGemBand() {
    try {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menuButton = wx.getMenuButtonBoundingClientRect()
      const statusBarHeight = windowInfo.statusBarHeight || 20
      const navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height
      const navH = statusBarHeight + navBarHeight
      const windowWidth = windowInfo.windowWidth || 375
      const topbarH = 96 * windowWidth / 750 // 顶部栏高度 96rpx 换算为 px
      const bandH = navH + topbarH
      // 极光态(aurora)：单条 118deg 渐变模拟极光帘幕。
      // Skyline 硬约束：① 不支持多背景层简写(逗号叠加)，整条声明会被丢弃导致元素全透明；
      //   ② 简写里不追加 background-color 兜底(未验证语法)。故全部色标必须 opaque，禁用 rgba alpha。
      // 层次：外帘辉光@48%(#39553F) -> 暗谷@60%(#0F2410) -> 主帘@67% + 热核@68.5%(#5A7C63) -> 尾焰@74%；
      // 首尾回落深绿基底 #2D4F2D/#0F2410，色相始终锁在项目深绿族内，不新增色。
      const gemGradient =
        'linear-gradient(118deg,' +
        ' #2D4F2D 0%,' +
        ' #0F2410 16%,' +
        ' #2D4F2D 28%,' +
        ' #1A361F 40%,' +
        ' #39553F 48%,' +
        ' #142C18 56%,' +
        ' #0F2410 60%,' +
        ' #2E4C36 64%,' +
        ' #4E6D56 67%,' +
        ' #5A7C63 68.5%,' +
        ' #4A6952 70%,' +
        ' #35553E 74%,' +
        ' #16301A 80%,' +
        ' #0F2410 88%,' +
        ' #2D4F2D 100%)'
      this.setData({
        gemNavbarBg: gemGradient + ' 0 0 / 100% ' + bandH + 'px no-repeat',
        gemTopbarStyle:
          'background: ' + gemGradient + ' 0 -' + navH + 'px / 100% ' + bandH + 'px no-repeat;',
      })
    } catch (e) {
      // 降级：gemNavbarBg 已用深绿兜底，顶部栏走 wxss 兜底
    }
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
      this._loadMyActivities()
    }
  },

  onPullDownRefresh() {
    this._initPage()
    this._refreshUserData()
    wx.stopPullDownRefresh()
  },

  onUnload() {
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

  handleBannerTap(e) {
    const action = e.currentTarget.dataset.action
    const actionTarget = e.currentTarget.dataset.target || ''

    if (action === 'none' || !action) { return }

    const routes = {
      boarding: '/pages/boarding/index',
      feeding: '/subpackages/feeding/confirm-service',
      activity: '/subpackages/activity/list',
      mall: '/subpackages/mall/product-list',
      tuan: '/pages/discover/index',
      coupon: '/subpackages/coupon/my-coupons',
      partner: '/subpackages/partner/home/index',
    }

    const tabPages = ['/pages/discover/index', '/pages/boarding/index']

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

  onShareAppMessage() {
    return {
      title: 'AROORO - 安心寄养，让爱宠如家',
      path: buildSharePath('/pages/home/index'),
    }
  },
})
