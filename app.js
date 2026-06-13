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
  },

  async onLaunch(options) {
    const appLaunchStartTime = Date.now()

    this._captureInviterId(options)

    try {
      await this._executeCriticalStartup()

      this._executeBackgroundStartup().catch(error => {
        console.error('[APP] 后台初始化异常:', error)
      })

      console.log('[APP] 关键启动完成，耗时:', Date.now() - appLaunchStartTime, 'ms')
    } catch (error) {
      console.error('[APP] 启动失败:', error)
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
      }
    }

    await appStartupOptimizer.executeCriticalPhase(this)
    this._preloadServiceIcon()
  },

  _preloadServiceIcon() {
    console.log('[APP] 服务图标已就绪:', this.globalData.serviceIconUrl)
  },

  async _executeBackgroundStartup() {
    try {
      // 会话恢复已提升至 _executeCriticalStartup，此处不再重复执行。

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
      }
    })
  },

})
