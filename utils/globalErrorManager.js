const { ERROR_TYPES, ERROR_LEVELS, ERROR_REPORT_CONFIG } = require('./errorConfig')
const { ErrorStats } = require('./errorStats')
const { ErrorCollector } = require('./errorCollector')

class GlobalErrorManager {
  constructor() {
    this.config = { ...ERROR_REPORT_CONFIG }
    this.stats = new ErrorStats()
    this.collector = new ErrorCollector(this.stats, this.config)
    this.initialized = false
    this._statsCleanupTimer = null
    this._timers = []
  }

  init(options = {}) {
    if (this.initialized) return
    try {
      this.config = { ...this.config, ...options }

      this._setupGlobalErrorHandler()
      this._setupPeriodicTasks()

      this.initialized = true
      console.log('[GlobalErrorManager] 全局错误处理已初始化')
    } catch (error) {
      console.error('[GlobalErrorManager] 初始化失败:', error)
    }
  }

  _setupGlobalErrorHandler() {
    if (typeof wx !== 'undefined') {
      wx.onError && wx.onError((error) => this.handleError(error))
    }
  }

  _setupPeriodicTasks() {
    this._statsCleanupTimer = this._setInterval(() => {
      this.stats.cleanOldStats()
    }, 24 * 60 * 60 * 1000)
  }

  _setTimeout(callback, delay) {
    const timerId = setTimeout(callback, delay)
    this._timers.push(timerId)
    return timerId
  }

  _setInterval(callback, interval) {
    const timerId = setInterval(callback, interval)
    this._timers.push(timerId)
    return timerId
  }

  _clearAllTimers() {
    this._timers.forEach(timerId => {
      clearTimeout(timerId)
      clearInterval(timerId)
    })
    this._timers = []
  }

  handleError(error, options = {}) {
    try {
      return this.collector.handleWxError(error, options)
    } catch (handlerError) {
      console.error('[GlobalErrorManager] 错误处理器异常:', handlerError)
    }
  }

  _getAppVersion() {
    try {
      if (typeof wx !== 'undefined' && wx.getAccountInfoSync) {
        const accountInfo = wx.getAccountInfoSync()
        return (accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.version) || 'dev'
      }
    } catch { /* ignore */ }
    return 'dev'
  }

  _getSystemInfo() {
    try {
      if (typeof wx !== 'undefined' && wx.getWindowInfo) {
        return wx.getWindowInfo()
      }
    } catch { /* ignore */ }
    return {}
  }

  getErrorStats() {
    return this.stats.toJSON()
  }

  clearStats() {
    this.stats = new ErrorStats()
    this.collector = new ErrorCollector(this.stats, this.config)
  }

  destroy() {
    this._clearAllTimers()
    this.initialized = false
    console.log('[GlobalErrorManager] 已销毁')
  }
}

const globalErrorManager = new GlobalErrorManager()

module.exports = {
  globalErrorManager,
  ERROR_TYPES,
  ERROR_LEVELS,
}
