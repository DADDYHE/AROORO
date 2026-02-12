/**
 * 错误处理模块
 * 用于统一处理应用中的错误，提供一致的错误处理机制
 */

// 错误等级
const ERROR_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
}

// 错误恢复策略
const ERROR_RECOVERY_STRATEGIES = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  IGNORE: 'ignore',
  RESET: 'reset',
  NOTIFY: 'notify'
}

// 错误类型定义
const ERROR_TYPES = {
  NETWORK: 'NetworkError',
  LOGIN: 'LoginError',
  PERMISSION: 'PermissionError',
  STATE: 'StateError',
  VALIDATION: 'ValidationError',
  IM: 'IMError',
  STORAGE: 'StorageError',
  AUTHENTICATION: 'AuthenticationError',
  API: 'APIError',
  MINIPROGRAM_NETWORK: 'MiniProgramNetworkError',
  MINIPROGRAM_SECURITY: 'MiniProgramSecurityError',
  UNKNOWN: 'UnknownError'
}

class ErrorHandler {
  constructor() {
    this.errorLogs = []
    this.MAX_ERROR_LOGS = 100
    this.retryAttempts = new Map()
    this.errorListeners = new Map()
    this.errorStats = {
      total: 0,
      byType: {},
      byLevel: {},
      byDay: {}
    }
    this.lastErrorReportTime = 0
    this.errorReportInterval = 60000 // 1分钟
  }

  /**
   * 初始化全局错误处理
   */
  initGlobalErrorHandler() {
    // 捕获全局错误
    const originalOnError = wx.onError
    wx.onError = (error) => {
      this.handleError('GlobalError', error, { level: ERROR_LEVELS.ERROR })
      if (originalOnError) {
        originalOnError(error)
      }
    }

    // 捕获未处理的Promise拒绝
    const originalOnUnhandledRejection = wx.onUnhandledRejection
    wx.onUnhandledRejection = (res) => {
      this.handleError('UnhandledRejection', res.reason || res, { level: ERROR_LEVELS.WARNING })
      if (originalOnUnhandledRejection) {
        originalOnUnhandledRejection(res)
      }
    }

    // 捕获页面不存在错误
    const originalOnPageNotFound = wx.onPageNotFound
    wx.onPageNotFound = (res) => {
      this.handleError('PageNotFoundError', res, { level: ERROR_LEVELS.INFO })
      if (originalOnPageNotFound) {
        originalOnPageNotFound(res)
      }
    }

    // 捕获内存警告
    const originalOnMemoryWarning = wx.onMemoryWarning
    wx.onMemoryWarning = (res) => {
      this.handleError('MemoryWarning', res, { level: ERROR_LEVELS.WARNING })
      if (originalOnMemoryWarning) {
        originalOnMemoryWarning(res)
      }
    }

    console.log('全局错误处理已初始化')
  }

  /**
   * 处理错误
   * @param {string} errorType - 错误类型
   * @param {Error|string} error - 错误对象或错误信息
   * @param {object} [options] - 选项
   * @param {string} [options.level] - 错误等级
   * @param {object} [options.context] - 错误上下文信息
   * @param {function} [options.fallback] -  fallback函数
   * @param {object} [options.retry] - 重试配置
   * @returns {object} 错误信息
   */
  handleError(errorType, error, options = {}) {
    const {
      level = ERROR_LEVELS.ERROR,
      context = {},
      fallback,
      retry
    } = options

    const errorInfo = {
      errorType,
      message: error.message || error.toString(),
      stack: error.stack || '',
      timestamp: Date.now(),
      level,
      context: {
        ...context,
        appVersion: wx.getAppBaseInfo ? wx.getAppBaseInfo().appVersion : 'unknown',
        systemInfo: this._getSystemInfo(),
        networkType: wx.getNetworkType ? wx.getNetworkType() : 'unknown'
      },
      retryable: !!retry
    }

    // 记录错误
    this.logError(errorInfo)

    // 统计错误
    this.updateErrorStats(errorInfo)

    // 打印错误
    this.logErrorToConsole(errorInfo)

    // 分类处理错误
    this.handleErrorByType(errorType, errorInfo)

    // 执行fallback
    if (fallback && typeof fallback === 'function') {
      try {
        fallback(errorInfo)
      } catch (fallbackError) {
        console.error('Fallback执行失败:', fallbackError)
      }
    }

    // 触发错误监听器
    this.emitErrorEvent(errorType, errorInfo)

    // 检查是否需要自动重试
    if (retry && this.shouldRetry(errorType, errorInfo, retry)) {
      this.scheduleRetry(errorType, errorInfo, retry)
    }

    // 检查是否需要上报错误
    this.checkErrorReport()

    return errorInfo
  }

  /**
   * 按类型处理错误
   * @private
   * @param {string} errorType - 错误类型
   * @param {object} errorInfo - 错误信息
   */
  handleErrorByType(errorType, errorInfo) {
    switch (errorType) {
    case ERROR_TYPES.NETWORK:
    case 'NetworkError':
      this.handleNetworkError(errorInfo)
      break
    case ERROR_TYPES.LOGIN:
    case 'LoginError':
      this.handleLoginError(errorInfo)
      break
    case ERROR_TYPES.PERMISSION:
    case 'PermissionError':
      this.handlePermissionError(errorInfo)
      break
    case ERROR_TYPES.STATE:
    case 'StateError':
      this.handleStateError(errorInfo)
      break
    case ERROR_TYPES.VALIDATION:
      this.handleValidationError(errorInfo)
      break
    case ERROR_TYPES.IM:
      this.handleIMError(errorInfo)
      break
    case ERROR_TYPES.STORAGE:
      this.handleStorageError(errorInfo)
      break
    case ERROR_TYPES.MINIPROGRAM_NETWORK:
    case 'MiniProgramNetworkError':
      this.handleMiniProgramNetworkError(errorInfo)
      break
    case ERROR_TYPES.MINIPROGRAM_SECURITY:
    case 'MiniProgramSecurityError':
      this.handleMiniProgramSecurityError(errorInfo)
      break
    default:
      this.handleGeneralError(errorInfo)
      break
    }
  }

  /**
   * 处理网络错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleNetworkError(errorInfo) {
    // 显示网络错误提示
    wx.showToast({
      title: '网络错误，请检查网络连接',
      icon: 'none',
      duration: 2000
    })

    // 检查网络状态，提供更详细的提示
    wx.getNetworkType({
      success: (res) => {
        const networkType = res.networkType
        console.log('[ErrorHandler] 当前网络类型:', networkType)
        
        // 根据网络类型提供不同的提示
        if (networkType === 'none') {
          setTimeout(() => {
            wx.showModal({
              title: '网络连接失败',
              content: '请检查您的网络连接后重试',
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#3CC51F'
            })
          }, 1000)
        } else if (networkType === '2g') {
          setTimeout(() => {
            wx.showModal({
              title: '网络信号较弱',
              content: '当前网络信号较弱，可能影响消息发送和接收，请尝试切换到更稳定的网络',
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#3CC51F'
            })
          }, 1000)
        }
      }
    })

    // 可以在这里添加网络错误的其他处理逻辑
    // 例如：检查网络状态，切换网络类型等
  }

  /**
   * 显示加载状态
   * @param {string} title - 加载提示文字
   * @returns {string} - 加载ID
   */
  showLoading(title = '加载中...') {
    const loadingId = `loading_${Date.now()}`
    wx.showLoading({
      title: title,
      mask: true
    })
    return loadingId
  }

  /**
   * 隐藏加载状态
   */
  hideLoading() {
    wx.hideLoading()
  }

  /**
   * 显示网络错误修复提示
   */
  showNetworkErrorFixTip() {
    wx.showModal({
      title: '网络连接问题',
      content: '检测到网络连接不稳定，建议：\n1. 检查网络连接\n2. 尝试切换网络类型\n3. 重启小程序',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#3CC51F'
    })
  }

  /**
   * 显示离线模式提示
   */
  showOfflineModeTip() {
    wx.showModal({
      title: '离线模式',
      content: '当前网络连接不稳定，已进入离线模式\n\n您发送的消息将在网络恢复后自动同步',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#3CC51F'
    })
  }

  /**
   * 显示网络恢复提示
   */
  showNetworkRecoverTip() {
    wx.showToast({
      title: '网络已恢复',
      icon: 'success',
      duration: 2000
    })
  }

  /**
   * 处理登录错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleLoginError(errorInfo) {
    // 显示登录错误提示
    wx.showToast({
      title: '登录失败，请重新登录',
      icon: 'none',
      duration: 2000
    })

    // 可以在这里添加登录错误的其他处理逻辑
    // 例如：清除登录状态，跳转到登录页面等
  }

  /**
   * 处理权限错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handlePermissionError(errorInfo) {
    // 显示权限错误提示
    wx.showToast({
      title: '权限不足，无法执行此操作',
      icon: 'none',
      duration: 2000
    })

    // 可以在这里添加权限错误的其他处理逻辑
    // 例如：引导用户开启权限，显示权限设置页面等
  }

  /**
   * 处理状态错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleStateError(errorInfo) {
    // 显示状态错误提示
    wx.showToast({
      title: '状态错误，请重试',
      icon: 'none',
      duration: 2000
    })

    // 可以在这里添加状态错误的其他处理逻辑
    // 例如：重置状态，恢复默认值等
  }

  /**
   * 处理验证错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleValidationError(errorInfo) {
    // 显示验证错误提示
    wx.showToast({
      title: errorInfo.message || '输入信息有误，请检查',
      icon: 'none',
      duration: 2000
    })
  }

  /**
   * 处理IM错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleIMError(errorInfo) {
    // 显示IM错误提示
    wx.showToast({
      title: '消息服务异常，请重试',
      icon: 'none',
      duration: 2000
    })
  }

  /**
   * 处理存储错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleStorageError(errorInfo) {
    // 显示存储错误提示
    wx.showToast({
      title: '存储失败，请检查存储空间',
      icon: 'none',
      duration: 2000
    })
  }

  /**
   * 处理小程序网络错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleMiniProgramNetworkError(errorInfo) {
    // 显示小程序网络错误提示
    wx.showToast({
      title: '网络连接失败，请检查网络后重试',
      icon: 'none',
      duration: 2000
    })

    // 检查网络状态
    wx.getNetworkType({
      success: (res) => {
        console.log('[ErrorHandler] 当前网络状态:', res.networkType)
        if (res.networkType === 'none') {
          // 如果无网络，显示更详细的提示
          setTimeout(() => {
            wx.showModal({
              title: '网络连接失败',
              content: '请检查您的网络连接后重试',
              showCancel: false,
              confirmText: '知道了'
            })
          }, 1000)
        }
      }
    })
  }

  /**
   * 处理小程序安全错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleMiniProgramSecurityError(errorInfo) {
    // 显示小程序安全错误提示
    wx.showToast({
      title: '安全信息获取失败，请检查网络后重试',
      icon: 'none',
      duration: 2000
    })

    // 安全错误通常也是网络问题导致的，检查网络状态
    wx.getNetworkType({
      success: (res) => {
        console.log('[ErrorHandler] 当前网络状态:', res.networkType)
        if (res.networkType !== 'none') {
          // 如果有网络但安全信息获取失败，可能是微信服务器问题
          setTimeout(() => {
            wx.showModal({
              title: '安全信息获取失败',
              content: '可能是微信服务器临时问题，请稍后重试',
              showCancel: false,
              confirmText: '知道了'
            })
          }, 1000)
        }
      }
    })
  }

  /**
   * 处理通用错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  handleGeneralError(errorInfo) {
    // 根据错误等级显示不同的提示
    const title = errorInfo.level === ERROR_LEVELS.CRITICAL
      ? '系统异常，请联系客服'
      : errorInfo.level === ERROR_LEVELS.WARNING
        ? '操作可能未完成，请检查'
        : '操作失败，请重试'

    // 显示通用错误提示
    wx.showToast({
      title: title,
      icon: 'none',
      duration: 2000
    })
  }

  /**
   * 记录错误
   * @private
   * @param {object} errorInfo - 错误信息
   */
  logError(errorInfo) {
    this.errorLogs.push(errorInfo)

    // 限制错误日志数量
    if (this.errorLogs.length > this.MAX_ERROR_LOGS) {
      this.errorLogs = this.errorLogs.slice(-this.MAX_ERROR_LOGS)
    }

    // 可以在这里添加错误日志的其他处理逻辑，如上报到服务器
    // 例如：调用云函数上报错误
  }

  /**
   * 更新错误统计
   * @private
   * @param {object} errorInfo - 错误信息
   */
  updateErrorStats(errorInfo) {
    // 更新总错误数
    this.errorStats.total++

    // 更新按类型统计
    this.errorStats.byType[errorInfo.errorType] = (this.errorStats.byType[errorInfo.errorType] || 0) + 1

    // 更新按等级统计
    this.errorStats.byLevel[errorInfo.level] = (this.errorStats.byLevel[errorInfo.level] || 0) + 1

    // 更新按天统计
    const today = new Date().toISOString().split('T')[0]
    if (!this.errorStats.byDay[today]) {
      this.errorStats.byDay[today] = 0
    }
    this.errorStats.byDay[today]++
  }

  /**
   * 打印错误到控制台
   * @private
   * @param {object} errorInfo - 错误信息
   */
  logErrorToConsole(errorInfo) {
    const { errorType, message, level, timestamp, context } = errorInfo
    const timeString = new Date(timestamp).toISOString()

    switch (level) {
    case ERROR_LEVELS.CRITICAL:
      console.error(`[${timeString}] [${level}] [${errorType}]: ${message}`, context)
      break
    case ERROR_LEVELS.ERROR:
      console.error(`[${timeString}] [${level}] [${errorType}]: ${message}`)
      break
    case ERROR_LEVELS.WARNING:
      console.warn(`[${timeString}] [${level}] [${errorType}]: ${message}`)
      break
    case ERROR_LEVELS.INFO:
    case ERROR_LEVELS.DEBUG:
      console.log(`[${timeString}] [${level}] [${errorType}]: ${message}`)
      break
    }
  }

  /**
   * 获取系统信息
   * @private
   * @returns {object} 系统信息
   */
  _getSystemInfo() {
    try {
      return wx.getSystemInfoSync()
    } catch (error) {
      return { platform: 'unknown', version: 'unknown' }
    }
  }

  /**
   * 检查是否需要重试
   * @private
   * @param {string} errorType - 错误类型
   * @param {object} errorInfo - 错误信息
   * @param {object} retryConfig - 重试配置
   * @returns {boolean} 是否需要重试
   */
  shouldRetry(errorType, errorInfo, retryConfig) {
    const { maxAttempts = 3, delay = 1000, maxDelay = 5000 } = retryConfig
    const key = `${errorType}_${errorInfo.message.substring(0, 50)}`
    const attempts = this.retryAttempts.get(key) || 0

    if (attempts >= maxAttempts) {
      this.retryAttempts.delete(key)
      return false
    }

    return true
  }

  /**
   * 安排重试
   * @private
   * @param {string} errorType - 错误类型
   * @param {object} errorInfo - 错误信息
   * @param {object} retryConfig - 重试配置
   */
  scheduleRetry(errorType, errorInfo, retryConfig) {
    const { delay = 1000, maxDelay = 5000, onRetry } = retryConfig
    const key = `${errorType}_${errorInfo.message.substring(0, 50)}`
    const attempts = this.retryAttempts.get(key) || 0

    // 指数退避延迟
    const backoffDelay = Math.min(delay * Math.pow(2, attempts), maxDelay)

    setTimeout(() => {
      if (onRetry && typeof onRetry === 'function') {
        try {
          onRetry(attempts + 1)
        } catch (retryError) {
          this.handleError('RetryError', retryError, {
            level: ERROR_LEVELS.WARNING,
            context: { originalError: errorInfo }
          })
        }
      }
    }, backoffDelay)

    this.retryAttempts.set(key, attempts + 1)
  }

  /**
   * 检查是否需要上报错误
   * @private
   */
  checkErrorReport() {
    const now = Date.now()
    if (now - this.lastErrorReportTime > this.errorReportInterval) {
      this.lastErrorReportTime = now
      this.reportErrorStats()
    }
  }

  /**
   * 上报错误统计
   * @private
   */
  reportErrorStats() {
    // 可以在这里实现错误统计上报
    // 例如：调用云函数上报错误统计
    console.log('上报错误统计:', this.errorStats)
  }

  /**
   * 获取错误日志
   * @param {number} [limit] - 返回日志数量限制
   * @returns {array} 错误日志
   */
  getErrorLogs(limit) {
    if (limit) {
      return this.errorLogs.slice(-limit)
    }
    return this.errorLogs
  }

  /**
   * 清除错误日志
   */
  clearErrorLogs() {
    this.errorLogs = []
  }

  /**
   * 创建标准化的错误对象
   * @param {string} type - 错误类型
   * @param {string} message - 错误消息
   * @param {object} [options] - 选项
   * @param {string} [options.level] - 错误等级
   * @param {object} [options.details] - 错误详情
   * @returns {Error} 标准化的错误对象
   */
  createError(type, message, options = {}) {
    const { level = ERROR_LEVELS.ERROR, details = {} } = options
    const error = new Error(message)
    error.type = type
    error.details = details
    error.level = level
    error.timestamp = Date.now()
    return error
  }

  /**
   * 包装异步函数，统一处理错误
   * @param {function} fn - 异步函数
   * @param {object} [options] - 选项
   * @param {string} [options.errorType] - 错误类型
   * @param {string} [options.level] - 错误等级
   * @param {function} [options.fallback] - fallback函数
   * @param {object} [options.retry] - 重试配置
   * @returns {function} 包装后的函数
   */
  wrapAsyncFunction(fn, options = {}) {
    const {
      errorType = 'AsyncError',
      level = ERROR_LEVELS.ERROR,
      fallback,
      retry
    } = options

    return async (...args) => {
      try {
        return await fn(...args)
      } catch (error) {
        const errorInfo = this.handleError(errorType, error, {
          level,
          context: { args },
          fallback,
          retry
        })
        throw error
      }
    }
  }

  /**
   * 包装同步函数，统一处理错误
   * @param {function} fn - 同步函数
   * @param {object} [options] - 选项
   * @param {string} [options.errorType] - 错误类型
   * @param {string} [options.level] - 错误等级
   * @param {function} [options.fallback] - fallback函数
   * @returns {function} 包装后的函数
   */
  wrapSyncFunction(fn, options = {}) {
    const {
      errorType = 'SyncError',
      level = ERROR_LEVELS.ERROR,
      fallback
    } = options

    return (...args) => {
      try {
        return fn(...args)
      } catch (error) {
        this.handleError(errorType, error, {
          level,
          context: { args },
          fallback
        })
        throw error
      }
    }
  }

  /**
   * 注册错误监听器
   * @param {string} errorType - 错误类型
   * @param {function} listener - 监听器函数
   */
  onError(errorType, listener) {
    if (!this.errorListeners.has(errorType)) {
      this.errorListeners.set(errorType, [])
    }
    this.errorListeners.get(errorType).push(listener)
  }

  /**
   * 移除错误监听器
   * @param {string} errorType - 错误类型
   * @param {function} listener - 监听器函数
   */
  offError(errorType, listener) {
    if (this.errorListeners.has(errorType)) {
      const listeners = this.errorListeners.get(errorType)
      this.errorListeners.set(errorType, listeners.filter(l => l !== listener))
    }
  }

  /**
   * 触发错误事件
   * @private
   * @param {string} errorType - 错误类型
   * @param {object} errorInfo - 错误信息
   */
  emitErrorEvent(errorType, errorInfo) {
    // 触发特定类型的监听器
    if (this.errorListeners.has(errorType)) {
      this.errorListeners.get(errorType).forEach(listener => {
        try {
          listener(errorInfo)
        } catch (error) {
          console.error('错误监听器执行失败:', error)
        }
      })
    }

    // 触发通用错误监听器
    if (this.errorListeners.has('*')) {
      this.errorListeners.get('*').forEach(listener => {
        try {
          listener(errorInfo)
        } catch (error) {
          console.error('通用错误监听器执行失败:', error)
        }
      })
    }
  }

  /**
   * 检查错误是否为网络错误
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否为网络错误
   */
  isNetworkError(error) {
    const networkErrorMessages = [
      '网络错误',
      '请求失败',
      '网络连接',
      'timeout',
      'Network Error',
      'net::',
      'ERR_NETWORK',
      'Connection refused',
      'webapi_getwxaasyncsecinfo',
      'failed to fetch'
    ]

    const errorMessage = (error.message || error.toString()).toLowerCase()
    return networkErrorMessages.some(message => errorMessage.includes(message.toLowerCase()))
  }

  /**
   * 检查错误是否为登录错误
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否为登录错误
   */
  isLoginError(error) {
    const loginErrorMessages = [
      '登录失败',
      '登录超时',
      '用户未登录',
      'Login failed',
      'Authentication failed',
      'Unauthorized'
    ]

    const errorMessage = (error.message || error.toString()).toLowerCase()
    return loginErrorMessages.some(message => errorMessage.includes(message.toLowerCase()))
  }

  /**
   * 导出错误报告
   * @returns {object} 错误报告
   */
  exportErrorReport() {
    return {
      timestamp: Date.now(),
      errorCount: this.errorLogs.length,
      recentErrors: this.errorLogs.slice(-10),
      errorTypes: this.getErrorTypes(),
      errorStats: this.errorStats,
      systemInfo: this._getSystemInfo(),
      appInfo: wx.getAppBaseInfo ? wx.getAppBaseInfo() : {}
    }
  }

  /**
   * 获取错误类型统计
   * @returns {object} 错误类型统计
   */
  getErrorTypes() {
    const errorTypes = {}
    this.errorLogs.forEach(log => {
      errorTypes[log.errorType] = (errorTypes[log.errorType] || 0) + 1
    })
    return errorTypes
  }

  /**
   * 获取错误统计
   * @returns {object} 错误统计
   */
  getErrorStats() {
    return this.errorStats
  }

  /**
   * 重置错误统计
   */
  resetErrorStats() {
    this.errorStats = {
      total: 0,
      byType: {},
      byLevel: {},
      byDay: {}
    }
  }

  /**
   * 处理Promise链中的错误
   * @param {function} onRejected - 拒绝处理函数
   * @returns {function} 包装后的处理函数
   */
  catchError(onRejected) {
    return (error) => {
      try {
        return onRejected(error)
      } catch (handlerError) {
        this.handleError('ErrorHandlerError', handlerError, {
          level: ERROR_LEVELS.WARNING,
          context: { originalError: error }
        })
        throw handlerError
      }
    }
  }

  /**
   * 安全执行函数
   * @param {function} fn - 要执行的函数
   * @param {object} [options] - 选项
   * @param {*} [options.defaultValue] - 默认值
   * @param {string} [options.errorType] - 错误类型
   * @returns {*} 函数执行结果或默认值
   */
  safeExecute(fn, options = {}) {
    const { defaultValue, errorType = 'SafeExecuteError' } = options
    try {
      return fn()
    } catch (error) {
      this.handleError(errorType, error, {
        level: ERROR_LEVELS.WARNING
      })
      return defaultValue
    }
  }
}

// 导出单例实例
const errorHandler = new ErrorHandler()

module.exports = {
  ErrorHandler,
  errorHandler,
  // 导出错误相关常量
  ERROR_LEVELS,
  ERROR_RECOVERY_STRATEGIES,
  ERROR_TYPES
}