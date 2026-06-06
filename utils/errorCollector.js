const { ERROR_TYPES, ERROR_LEVELS, classifyError } = require('./errorConfig')
const { ErrorStats } = require('./errorStats')

class ErrorCollector {
  constructor(stats, config) {
    this.stats = stats
    this.config = config
    this._cachedNetworkType = 'unknown'
    this._refreshNetworkType()
  }

  _refreshNetworkType() {
    if (typeof wx !== 'undefined' && wx.getNetworkType) {
      wx.getNetworkType({
        success: (res) => { this._cachedNetworkType = res.networkType || 'unknown' },
        fail: () => { this._cachedNetworkType = 'unknown' }
      })
    }
  }

  _isDuplicateError(errorInfo) {
    const recentErrors = this.stats.recentErrors
    const lastError = recentErrors.length > 0 ? recentErrors[recentErrors.length - 1] : null
    if (!lastError) return false

    const timeDiff = errorInfo.timestamp - lastError.timestamp
    return (
      lastError.type === errorInfo.type &&
      lastError.message === errorInfo.message &&
      timeDiff < 1000
    )
  }

  _buildErrorInfo(error, options = {}) {
    return {
      type: options.type || classifyError(error),
      level: options.level || ERROR_LEVELS.ERROR,
      message: error.message || 'Unknown Error',
      stack: error.stack || '',
      timestamp: options.timestamp || Date.now(),
      context: options.context || {},
    }
  }

  collect(error, options = {}) {
    const errorInfo = this._buildErrorInfo(error, options)

    if (this._isDuplicateError(errorInfo)) return

    this.stats.record(errorInfo)

    if (errorInfo.level >= ERROR_LEVELS.CRITICAL &&
        this.stats.total % this.config.criticalNotifyThreshold === 0) {
      this._notifyCriticalError(errorInfo)
    }

    return errorInfo
  }

  handleWxError(error, options = {}) {
    const errorInfo = this.collect(error, {
      ...options,
      type: options.type || classifyError(error),
    })
    if (errorInfo && options.onHandle) {
      try { options.onHandle(errorInfo) } catch { /* ignore */ }
    }
    return errorInfo
  }

  _notifyCriticalError(errorInfo) {
    try {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '系统异常', icon: 'error', duration: 2000 })
      }
    } catch { /* ignore */ }
  }

  getNetworkType() {
    return this._cachedNetworkType || 'unknown'
  }
}

module.exports = { ErrorCollector }
