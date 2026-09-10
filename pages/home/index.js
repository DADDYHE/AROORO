const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const app = getApp()
const { ListBehavior } = require('../../behaviors/listBehavior')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const authGateBehavior = require('../../behaviors/authGateBehavior')
const homeBannerBehavior = require('../../behaviors/homeBannerBehavior')
const homePetBehavior = require('../../behaviors/homePetBehavior')
const homeActivityBehavior = require('../../behaviors/homeActivityBehavior')
const homeTuanBehavior = require('../../behaviors/homeTuanBehavior')
const homeMallBehavior = require('../../behaviors/homeMallBehavior')
const homeMyActivitiesBehavior = require('../../behaviors/homeMyActivitiesBehavior')
const homeHostInviteBehavior = require('../../behaviors/homeHostInviteBehavior')
const { buildSharePath } = require('../../utils/share')
const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, tabBarSyncBehavior, cloudImageBehavior, authGateBehavior, homeBannerBehavior, homePetBehavior, homeActivityBehavior, homeTuanBehavior, homeMallBehavior, homeMyActivitiesBehavior, homeHostInviteBehavior],
  data: {
    t: pageI18n.buildTMap('zh-CN'),
    isLoggedIn: false,
  pendingOrders: [],
    userInfo: null,
    locale: 'zh-CN',
    todayDate: '',
    _refreshPulling: false,
    // 导航栏 + 顶部栏共用深绿宝石渐变带（白高光贯穿两栏）
    gemNavbarBg: 'linear-gradient(135deg, #2D4F2D 0%, #0F2410 100%)',
    gemTopbarStyle: '', // 空串 = 回落 wxss 兜底渐变（勿给默认值，否则会拼出 size:0 的空背景）
  },

  onLoad(options) {
    this._initNavbarHeight()
    // 邀请落地接力（2026-09-07）：分享 path 页面缺失回退到本页时，检测邀请码转发填写页
    if (options && options.code) {
      wx.navigateTo({
        url: `/subpackages/booking/invitation-fill/index?code=${options.code}`,
        fail: () => {
          wx.showModal({ title: '邀请链接', content: '当前小程序版本暂不支持开单邀请，请更新小程序后重试', showCancel: false })
        },
      })
      return
    }

    // 启动首屏海报：独立启动页（非 tab 页 + custom 导航栏，框架级全屏，
    // 100% 覆盖 navbar 与系统 tabBar）。仅冷启动首屏一次。
    if (app && !app.__splashShown) {
      const sync = app.globalData && app.globalData.__splashSync
      // 已同步缓存且明确关闭 -> 跳过；其余（启用 / 首启未知）都进入启动页最终裁决
      if (!(sync && sync.enabled === false)) {
        app.__splashShown = true
        // 2026-09-07：保留原始落地路径——分享卡片可能直指分包页面（如开单填写页），
        //   冷启动时微信先初始化首页，splash 的 reLaunch 会冲掉原始路径；
        //   splash 退出时按此路由还原（wx.getEnterOptionsSync = 微信收到的真实进入参数）
        try {
          const entry = wx.getEnterOptionsSync()
          if (entry && entry.path && entry.path !== 'pages/home/index') {
            const q = entry.query || {}
            const qs = Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&')
            app.__splashReturnRoute = { path: entry.path, query: qs }
          }
        } catch (e) {}
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
    this._refreshUserData()
    // 待处理板块：每次 onShow 独立轻量拉取（绕 30s 节流）——支付/改价后返回首页必须立即可见最新状态
    if (this.data.isLoggedIn || (app.globalData && app.globalData.isLoggedIn)) {
      this._loadPendingOrders()
      // 寄养开单入口：登录态下按寄养档案存在与否决定板块可见（30s 缓存，实时性靠下拉刷新）
      this._loadHostInvite()
    } else {
      this._clearHostInvite()
    }
    // 性能优化（2026-09-01）：30s 节流——tab 切回时不重复全量云调用
    const now = Date.now()
    if (this._lastInitAt && now - this._lastInitAt < 30000) { return }
    this._lastInitAt = now
    this._initPage()
  },

  _onSessionRestored() {
    this._refreshUserData()
    this._lastInitAt = 0 // 登录回跳强制刷新一次
    this._initPage()
  },

  // 云资源优化：首页 BFF 聚合——一次 getHomeFeed 返回全部板块
  // （banner/团购/活动/商城 + 登录时宠物/可签到活动），替代原先 6 次独立云函数调用。
  // 30s 缓存与 onShow 节流窗口一致；下拉刷新 forceRefresh 穿透缓存。
  // BFF 失败时降级为逐板块单独加载（保持可用性）。
  async _loadHomeFeed(forceRefresh) {
    const { CloudFunctionService } = require('../../services/CloudFunctionService')
const { orderManager } = require('../../services/OrderManager')
    const isLoggedIn = !!(app.globalData && app.globalData.isLoggedIn)
    try {
      const result = await CloudFunctionService.call('utilityService', {
        action: 'getHomeFeed',
        withUser: isLoggedIn,
      }, forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 })

      if (result && result.code === 0 && result.data) {
        const d = result.data
        this._applyBannerData(d.banners || [])
        this._applyTuanDeals(d.tuanDeals || [])
        this._applyLatestActivities(d.activities || [])
        this._applyMallProducts(d.products || [])
        if (d.myPets) { this._applyMyPets(d.myPets) }
        if (d.myActivities) { this._applyMyActivities(d.myActivities) }
        return
      }
      throw new Error((result && result.message) || 'getHomeFeed 返回为空')
    } catch (error) {
      // 降级：逐板块单独加载
      this._loadBannerData(forceRefresh)
      this._loadTuanDeals(forceRefresh)
      this._loadLatestActivities(forceRefresh)
      this._loadMallProducts(forceRefresh)
      if (isLoggedIn) {
        this._loadMyPets()
        this._loadMyActivities()
      }
    }
  },

  /**
   * 待处理订单（2026-09-06）：待支付 + 待补尾款，最多展示 3 笔
   * 独立于 30s 节流——支付完成/改价后返回首页时状态必须立即可见
   */
  async _loadPendingOrders() {
    try {
      const res = await orderManager.getOrders('owner', '', 1, 20)
      const list = (res && res.list) || []
      const pending = list
        .filter(o => o.status === 'pending_payment' || o.status === 'deposit_paid')
        .slice(0, 3)
        .map(o => {
          const total = Number(o.totalPrice) || 0
          const paid = Number(o.paidAmount) || 0
          const isDepositPaid = o.status === 'deposit_paid'
          const created = String(o.createdAt || '')
          return {
            _id: o._id,
            orderTitle: o.orderTitle || o.hostName || '订单',
            createdAt: created ? created.replace('T', ' ').slice(0, 16) : '',
            statusText: isDepositPaid ? '待补尾款' : '待支付',
            payAmount: isDepositPaid
              ? Math.round((total - paid) * 100) / 100
              : total,
          }
        })
      this.setData({ pendingOrders: pending })
    } catch (error) {
      // 静默降级：待处理板块拉取失败不打扰首页
    }
  },

  handlePendingOrderTap(e) {
    const id = e.currentTarget && e.currentTarget.dataset.id
    if (!id) {return}
    wx.navigateTo({ url: '/subpackages/profile/order-detail/index?id=' + id })
  },

  handleViewAllOrders() {
    wx.navigateTo({ url: '/subpackages/profile/order-stats/index?type=boarding' })
  },

  _initPage(forceRefresh) {
    this._loadHomeFeed(forceRefresh)
    // 寄养开单入口：与 feed 并行刷新（缓存 30s 兜底，forceRefresh 穿透）
    this._loadHostInvite(forceRefresh)
  },

  _refreshUserData() {
    const currentAuthService = app.globalData ? app.globalData.authService : null
    if (!currentAuthService) { return }

    const isLoggedIn = currentAuthService.isLoggedIn()
    const userInfo = app.globalData.userInfo

    this.setData({ isLoggedIn, userInfo })
    // 登录态变化时 topbar 显隐，需重新计算 scroll-view 布局
    this._updateScrollLayout()

    // 云资源优化：登录态板块（宠物/可签到活动）随 _initPage 的 feed 聚合返回
    //（onShow 30s 节流窗口内不重复调用）；登出时清理残留的登录态板块数据
    if (!isLoggedIn) {
      if (typeof this._applyMyPets === 'function') { this._applyMyPets([]) }
      if (typeof this._applyMyActivities === 'function') { this._applyMyActivities([]) }
      if (typeof this._clearHostInvite === 'function') { this._clearHostInvite() }
      this.setData({ pendingOrders: [] })
    }
  },

  onPullDownRefresh() {
    this._lastInitAt = 0 // 下拉刷新强制穿透缓存
    this._initPage(true)
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
      title: __i18nT('BIZ_54TFDI'),
      path: buildSharePath('/pages/home/index'),
    }
  },
})
