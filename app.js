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

    await appStartupOptimizer.executeCriticalPhase(this)
    this._preloadServiceIcon()
  },

  _preloadServiceIcon() {
    console.log('[APP] 服务图标已就绪:', this.globalData.serviceIconUrl)
  },

  async _executeBackgroundStartup() {
    try {
      const appConfig = require('./config')

      if (!appConfig.envId) {
        console.error('[APP] 云环境ID未配置，无法恢复会话')
        return
      }

      if (authService) {
        this.globalData.authService = authService
      }

      // 尝试恢复会话
      if (authService) {
        try {
          const restored = await authService.tryRestoreSession()
          if (restored) {
            this._notifySessionRestored()
          } else {
            const hadCachedLogin = this.globalData.isLoggedIn
            if (hadCachedLogin) {
              this.globalData.userInfo = null
              this.globalData.isLoggedIn = false
              this._notifySessionRestored()
            }
          }
        } catch (sessionError) {
          console.warn('[APP] 会话恢复失败（不影响应用使用）:', sessionError.message)
          if (this.globalData.isLoggedIn) {
            this.globalData.userInfo = null
            this.globalData.isLoggedIn = false
            this._notifySessionRestored()
          }
        }
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
      }
    })
  },

})
