const { appStartupOptimizer } = require('./utils/appStartupOptimizer')
const { globalErrorManager } = require('./utils/globalErrorManager')
const { init: initLogger } = require('./utils/logger')
const safeMode = require('./utils/safeMode')
const i18n = require('./utils/i18n')

let authService = null

try {
  const authModule = require('./services/AuthService')
  authService = authModule.authService
} catch (error) {
  console.error('[app.js] AuthService 导入失败:', error)
}

// 会话恢复同步点（2026-09-02 修复首页预取竞态）
// ------------------------------------------------------------------
// 问题：小程序不保证页面 onLoad 会等待 App.onLaunch 的 await 完成，
// 因此 splash 页 onLoad 读 globalData.isLoggedIn 时，
// _executeCriticalStartup 里的 await tryRestoreSession() 往往尚未 resolve，
// 读到的是初始值 false。预取 getHomeFeed(withUser:false) 与首页随后的
// getHomeFeed(withUser:true) cacheKey 不同 => 预取完全失效。
// 修法：暴露本 Promise，凡依赖登录态的启动期预取都必须 await 它。
let _resolveSessionReady = () => {}
const sessionReadyPromise = new Promise(resolve => { _resolveSessionReady = resolve })

App({
  globalData: {
    envId: require('./config.js').envId,
    userInfo: null,
    isLoggedIn: false,
    authService: null,
    isLogout: false,
    serviceIconUrl: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/service-bell-line.svg',
    bookingData: {
      selectedDates: null,
      selectedDatesTimestamp: null,
      selectedPets: [],
      selectedPetDetails: [],
      selectedHost: null,
      bookingRequirements: {},
      petFormData: null,
    },
    selectedAddress: null,
    globalErrorManager: null,
    // Sprint 16：i18n 状态（由 utils/i18n 管理）
    locale: i18n.getLocale(),
    i18n,
    // 启动首屏海报：同步缓存(__splashSync)供首帧展示（销闪屏），异步结果(splashPoster)刷新；
    // __splashFetch 为幂等拉取 Promise，供独立启动页(pages/splash)订阅。
    splashPoster: null,
    __splashSync: null,
    __splashFetch: null,
    // 强制登录：来源页记录（route + options），供登录成功后回跳原页面。
    // 由 requireLogin / startLogin 写入，登录页回跳后清理。
    loginReturnTo: null,
  },

  // 会话恢复完成同步点：启动期预取（homePrefetch 等）须 await 后再读 isLoggedIn，
  // 否则会与 _executeCriticalStartup 的异步恢复产生竞态。见文件头注释。
  sessionReady: sessionReadyPromise,

  async onLaunch(options) {
    const appLaunchStartTime = Date.now()

    // 最早读取启动海报本地缓存：进入首页前即由启动页(pages/splash)首帧展示，彻底消除"首页先闪一下"
    this.globalData.__splashSync = this._readSplashCache()

    this._captureInviterId(options)

    try {
      await this._executeCriticalStartup()

      // 启动海报：云函数拉取最新配置，更新本地缓存与 globalData（首帧由缓存驱动，此处仅刷新）
      this.getSplashPosterAsync()

      this._executeBackgroundStartup().catch(error => {
        console.error('[APP] 后台初始化异常:', error)
      })

      console.log('[APP] 关键启动完成，耗时:', Date.now() - appLaunchStartTime, 'ms')
    } catch (error) {
      console.error('[APP] 启动失败:', error)
      // 兜底放行：启动异常时不能让等待 sessionReady 的预取永久挂起
      _resolveSessionReady()
    }
  },

  onShow(options) {
    this._captureInviterId(options)
    this._handleWxOrderConfirmCallback(options)
  },

  /**
   * 处理微信"确认收货"组件的回调。
   * - 拉起方式：wx.openBusinessView({ businessType: 'weappOrderConfirm' })
   * - 回调参数：options.referrerInfo.appId === 'wx1183b055aeec94d1'
   *   options.referrerInfo.extraData = { status, errormsg, req_extradata: { transaction_id } }
   * - 文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping-half.html
   */
  _handleWxOrderConfirmCallback(options) {
    const referrer = options && options.referrerInfo
    if (!referrer || referrer.appId !== 'wx1183b055aeec94d1') {return}
    const extra = referrer.extraData || {}
    if (extra.status !== 'success') {return}
    const transactionId = (extra.req_extradata && extra.req_extradata.transaction_id) || ''
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage && typeof currentPage._onWxConfirmReceiveSuccess === 'function') {
      try {
        currentPage._onWxConfirmReceiveSuccess(transactionId)
      } catch (e) {
        console.warn('[APP] 转发微信确认收货回调到页面失败:', e)
      }
    }
  },

  onError(err) {
    console.error('[APP] 未捕获的错误:', err)
  },

  _captureInviterId(options) {
    const inviterId = options?.query?.inviterId || options?.query?.inviter_id || ''
    if (inviterId) {
      this.globalData.pendingInviterId = inviterId
      wx.setStorageSync('pendingInviterId', inviterId)
    }
  },

  async _executeCriticalStartup() {
    const appConfig = require('./config')
    if (appConfig.envId) {
      wx.cloud.init({
        env: appConfig.envId,
        traceUser: false,
      })
    } else {
      console.warn('[APP] envId 未配置，跳过云开发初始化')
    }

    safeMode.loadConfig()

    initLogger(typeof appConfig.logLevel === 'number' ? appConfig.logLevel : undefined)

    globalErrorManager.init()
    this.globalData.globalErrorManager = globalErrorManager

    // 关键启动阶段恢复会话：确保所有页面 onLoad 时
    // globalData.userInfo 已是最终态，避免 partner/home 等
    // 同步判断登录态的页面在冷启动竞态中误判为"未登录"。
    if (authService) {
      this.globalData.authService = authService
      try {
        const restored = await authService.tryRestoreSession(this)
        if (!restored && this.globalData.isLoggedIn) {
          this.globalData.userInfo = null
          this.globalData.isLoggedIn = false
        }
      } catch (sessionError) {
        console.warn('[APP] 会话恢复失败（不影响应用使用）:', sessionError.message)
        this.globalData.userInfo = null
        this.globalData.isLoggedIn = false
      } finally {
        // 登录态已落定（成功或失败），放行所有等待 sessionReady 的预取
        _resolveSessionReady()
      }
    } else {
      _resolveSessionReady()
    }

    await appStartupOptimizer.executeCriticalPhase(this)
    this._preloadServiceIcon()
  },

  _preloadServiceIcon() {
    console.log('[APP] 服务图标已就绪:', this.globalData.serviceIconUrl)
  },

  // ============================================================
  // 启动首屏海报：同步缓存 + 异步拉取
  // 同步缓存(__splashSync) 在 onLaunch 最早读取，custom-tab-bar 首帧即可展示，
  // 彻底消除"首页先闪一下"；异步拉取更新本地缓存与 globalData.splashPoster。
  // ============================================================
  _readSplashCache() {
    try {
      const cached = wx.getStorageSync('__splash_cache')
      if (cached && typeof cached === 'object' && 'enabled' in cached) {
        return cached
      }
    } catch (e) {}
    return null
  },

  async _fetchSplashPoster() {
    // 云资源优化：启动海报为低频运营配置，本地缓存 12h 内视为新鲜，跳过云端拉取
    // （每次冷启动省 1 次云函数调用 + 2 次后端读；splash 页首帧由 __splashSync 驱动，
    //  此处返回缓存数据结构与云端一致，splash 页渲染逻辑不受影响）
    const SPLASH_FETCH_TTL = 12 * 3600 * 1000
    const sync = this.globalData.__splashSync
    if (sync && sync.fetchedAt && Date.now() - sync.fetchedAt < SPLASH_FETCH_TTL) {
      this.globalData.splashPoster = sync
      return sync
    }
    try {
      const { UtilityService } = require('./services/CloudFunctionService')
      const result = await UtilityService.getSplashPoster()
      if (result && result.code === 0 && result.data) {
        const d = result.data
        this.globalData.splashPoster = d
        // 落本地缓存：下次冷启动可同步首帧展示
        try {
          wx.setStorageSync('__splash_cache', {
            enabled: !!d.enabled,
            imageUrl: d.imageUrl || '',
            imagePreviewUrl: d.imagePreviewUrl || '',
            durationMs: d.durationMs || 2500,
            updatedAt: d.updatedAt || Date.now(),
            // 本地拉取时间（非配置更新时间）：12h TTL 判定基准，
            // 配置本身很旧时不触发重复拉取
            fetchedAt: Date.now(),
          })
        } catch (e) {}
        return d
      }
    } catch (err) {
      console.warn('[APP] 启动海报拉取失败（不影响首屏）:', err)
    }
    return null
  },

  getSplashPosterAsync() {
    if (this.__splashFetch) return this.__splashFetch
    this.__splashFetch = this._fetchSplashPoster()
    return this.__splashFetch
  },

  async _executeBackgroundStartup() {
    try {
      // 会话恢复已提升至 _executeCriticalStartup，此处不再重复执行。

      // 合作伙伴状态刷新为网络请求，放在后台启动阶段执行，避免阻塞首屏
      if (authService && this.globalData.isLoggedIn) {
        authService._refreshAdminStatus(this).catch(e => {
          console.warn('[APP] 后台刷新合作伙伴状态失败:', e.message)
        })
      }

      await appStartupOptimizer.executeDeferredTasks()
      appStartupOptimizer.printPerformanceReport()
    } catch (error) {
      console.error('[APP] 后台初始化失败:', error)
    }
  },

  _notifySessionRestored() {
    const pages = getCurrentPages()
    pages.forEach(page => {
      if (typeof page._onSessionRestored === 'function') {
        try {
          page._onSessionRestored()
        } catch (e) {
          console.warn('[APP] 通知页面会话恢复失败:', e)
        }
      } else if (typeof page.onShow === 'function') {
        // 兜底：页面未实现 _onSessionRestored 时，调用 onShow 触发刷新，
        // 确保登录回跳后原页用户态/数据刷新（老用户头像昵称/专属内容等）。
        // 注：navigateBack 回到原页时 onShow 会自动再触发一次，本兜底与自动触发
        // 重复但幂等（列表刷新类 onShow 应设计为幂等），收益是未实现钩子的页面也能刷新。
        try {
          page.onShow()
        } catch (e) {
          console.warn('[APP] 兜底刷新页面 onShow 失败:', e)
        }
      }
    })
  },

})
