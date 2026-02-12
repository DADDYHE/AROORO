/**
 * 监控和日志管理模块
 * 用于收集和分析系统的运行状态、性能指标和错误信息
 */

// 监控指标类型
const METRIC_TYPES = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  TIMER: 'timer',
  HISTOGRAM: 'histogram'
}

// 日志级别
const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
}

// 监控事件类型
const MONITORING_EVENTS = {
  APP_LAUNCH: 'appLaunch',
  APP_SHOW: 'appShow',
  APP_HIDE: 'appHide',
  PAGE_LOAD: 'pageLoad',
  PAGE_UNLOAD: 'pageUnload',
  API_CALL: 'apiCall',
  IM_LOGIN: 'imLogin',
  IM_MESSAGE: 'imMessage',
  USER_ACTION: 'userAction',
  PERFORMANCE: 'performance',
  ERROR: 'error'
}

class MonitoringManager {
  constructor() {
    this.metrics = {}
    this.logs = []
    this.events = []
    this.performanceData = []
    this.networkRequests = [] // 网络请求记录
    this.pageLoadTimes = {} // 页面加载时间
    this.markers = {} // 性能标记
    this.MAX_LOGS = 1000
    this.MAX_EVENTS = 500
    this.MAX_PERFORMANCE_DATA = 200
    this.MAX_REQUEST_RECORDS = 100 // 最大请求记录数
    this.lastReportTime = 0
    this.reportInterval = 120000 // 2分钟
    this.startTime = Date.now()
    this.isMonitoring = false // 是否正在监控
  }

  /**
   * 初始化监控管理器
   */
  init() {
    console.log('MonitoringManager.init - 初始化监控管理器')
    
    // 注册全局监控
    this._registerGlobalMonitors()
    
    // 启动定期报告
    this._startReporting()
    
    // 记录应用启动事件
    this.recordEvent(MONITORING_EVENTS.APP_LAUNCH, {
      timestamp: Date.now(),
      appVersion: wx.getAppBaseInfo ? wx.getAppBaseInfo().appVersion : 'unknown',
      systemInfo: this._getSystemInfo()
    })
  }

  /**
   * 注册全局监控
   * @private
   */
  _registerGlobalMonitors() {
    // 监控页面加载
    const originalOnPageLoad = wx.onPageNotFound
    wx.onPageNotFound = (res) => {
      this.recordEvent(MONITORING_EVENTS.PAGE_LOAD, {
        type: 'notFound',
        path: res.path,
        query: res.query
      })
      if (originalOnPageLoad) {
        originalOnPageLoad(res)
      }
    }

    // 监控内存警告
    const originalOnMemoryWarning = wx.onMemoryWarning
    wx.onMemoryWarning = (res) => {
      this.recordEvent(MONITORING_EVENTS.PERFORMANCE, {
        type: 'memoryWarning',
        level: res.level
      })
      if (originalOnMemoryWarning) {
        originalOnMemoryWarning(res)
      }
    }
  }

  /**
   * 启动定期报告
   * @private
   */
  _startReporting() {
    setInterval(() => {
      this.reportMetrics()
    }, this.reportInterval)
  }

  /**
   * 记录指标
   * @param {string} name - 指标名称
   * @param {number} value - 指标值
   * @param {string} type - 指标类型
   * @param {object} [tags] - 标签
   */
  recordMetric(name, value, type = METRIC_TYPES.GAUGE, tags = {}) {
    if (!this.metrics[name]) {
      this.metrics[name] = {
        type: type,
        values: [],
        tags: tags,
        lastUpdated: Date.now()
      }
    }

    this.metrics[name].values.push({
      value: value,
      timestamp: Date.now()
    })

    // 限制指标值数量
    if (this.metrics[name].values.length > 100) {
      this.metrics[name].values = this.metrics[name].values.slice(-100)
    }

    this.metrics[name].lastUpdated = Date.now()
  }

  /**
   * 记录计数器指标
   * @param {string} name - 指标名称
   * @param {number} [increment=1] - 增量
   * @param {object} [tags] - 标签
   */
  incrementCounter(name, increment = 1, tags = {}) {
    this.recordMetric(name, increment, METRIC_TYPES.COUNTER, tags)
  }

  /**
   * 记录计时器指标
   * @param {string} name - 指标名称
   * @param {number} duration - 持续时间（毫秒）
   * @param {object} [tags] - 标签
   */
  recordTimer(name, duration, tags = {}) {
    this.recordMetric(name, duration, METRIC_TYPES.TIMER, tags)
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {object} [data] - 附加数据
   */
  log(level, message, data = {}) {
    let currentPage = 'unknown'
    let appVersion = 'unknown'
    
    try {
      // 避免使用getCurrentPages()，防止触发小程序内部错误
      // 如果需要页面信息，可以通过其他方式传递
      currentPage = 'unknown'
      appVersion = wx.getAppBaseInfo ? wx.getAppBaseInfo().appVersion : 'unknown'
    } catch (error) {
      // 捕获任何可能的错误，确保日志记录不会失败
      console.error('监控管理器获取上下文信息失败:', error)
    }
    
    const logEntry = {
      level: level,
      message: message,
      data: data,
      timestamp: Date.now(),
      context: {
        page: currentPage,
        appVersion: appVersion
      }
    }

    this.logs.push(logEntry)

    // 限制日志数量
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS)
    }

    // 输出到控制台
    try {
      this._logToConsole(logEntry)
    } catch (error) {
      // 确保控制台输出不会失败
      console.error('监控管理器输出日志失败:', error)
    }
  }

  /**
   * 记录事件
   * @param {string} type - 事件类型
   * @param {object} [data] - 事件数据
   */
  recordEvent(type, data = {}) {
    const eventEntry = {
      type: type,
      data: data,
      timestamp: Date.now(),
      sessionId: this._getSessionId()
    }

    this.events.push(eventEntry)

    // 限制事件数量
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS)
    }

    console.log(`[Monitoring] 记录事件: ${type}`, data)
  }

  /**
   * 记录性能数据
   * @param {string} name - 性能指标名称
   * @param {number} duration - 持续时间（毫秒）
   * @param {object} [data] - 附加数据
   */
  recordPerformance(name, duration, data = {}) {
    const performanceEntry = {
      name: name,
      duration: duration,
      data: data,
      timestamp: Date.now()
    }

    this.performanceData.push(performanceEntry)

    // 限制性能数据数量
    if (this.performanceData.length > this.MAX_PERFORMANCE_DATA) {
      this.performanceData = this.performanceData.slice(-this.MAX_PERFORMANCE_DATA)
    }

    console.log(`[Monitoring] 性能指标: ${name} - ${duration}ms`, data)
  }

  /**
   * 记录API调用
   * @param {string} url - API URL
   * @param {number} duration - 持续时间（毫秒）
   * @param {number} statusCode - 状态码
   * @param {object} [options] - 选项
   */
  recordApiCall(url, duration, statusCode, options = {}) {
    this.recordEvent(MONITORING_EVENTS.API_CALL, {
      url: url,
      duration: duration,
      statusCode: statusCode,
      method: options.method || 'GET',
      success: statusCode >= 200 && statusCode < 300
    })

    this.recordTimer('apiCall', duration, {
      url: url,
      statusCode: statusCode
    })
  }

  /**
   * 记录IM操作
   * @param {string} type - IM操作类型
   * @param {number} duration - 持续时间（毫秒）
   * @param {boolean} success - 是否成功
   * @param {object} [data] - 附加数据
   */
  recordImOperation(type, duration, success, data = {}) {
    this.recordEvent(MONITORING_EVENTS.IM_MESSAGE, {
      type: type,
      duration: duration,
      success: success,
      ...data
    })

    this.recordTimer(`im_${type}`, duration, {
      success: success
    })
  }

  /**
   * 记录用户操作
   * @param {string} action - 操作名称
   * @param {object} [data] - 操作数据
   */
  recordUserAction(action, data = {}) {
    this.recordEvent(MONITORING_EVENTS.USER_ACTION, {
      action: action,
      ...data
    })

    this.incrementCounter(`user_action_${action}`)
  }

  /**
   * 记录错误
   * @param {string} type - 错误类型
   * @param {string} message - 错误消息
   * @param {object} [data] - 错误数据
   */
  recordError(type, message, data = {}) {
    this.recordEvent(MONITORING_EVENTS.ERROR, {
      type: type,
      message: message,
      ...data
    })

    this.log(LOG_LEVELS.ERROR, message, {
      type: type,
      ...data
    })

    this.incrementCounter(`error_${type}`)
  }

  /**
   * 包装函数以记录性能
   * @param {string} name - 性能指标名称
   * @param {function} fn - 要包装的函数
   * @param {object} [options] - 选项
   * @returns {function} 包装后的函数
   */
  wrapWithPerformance(name, fn, options = {}) {
    return async (...args) => {
      const startTime = Date.now()
      let result
      let error

      try {
        result = await fn(...args)
      } catch (err) {
        error = err
        throw err
      } finally {
        const duration = Date.now() - startTime
        this.recordPerformance(name, duration, {
          success: !error,
          ...options
        })
      }

      return result
    }
  }

  /**
   * 报告指标
   */
  reportMetrics() {
    const now = Date.now()
    if (now - this.lastReportTime < this.reportInterval) {
      return
    }

    this.lastReportTime = now

    const report = {
      timestamp: now,
      sessionId: this._getSessionId(),
      uptime: now - this.startTime,
      metrics: this._aggregateMetrics(),
      eventCount: this.events.length,
      logCount: this.logs.length,
      performanceCount: this.performanceData.length,
      systemInfo: this._getSystemInfo()
    }

    console.log('[Monitoring] 报告指标:', report)

    // 可以在这里实现指标上报，例如调用云函数
  }

  /**
   * 聚合指标
   * @private
   * @returns {object} 聚合后的指标
   */
  _aggregateMetrics() {
    const aggregated = {}

    for (const [name, metric] of Object.entries(this.metrics)) {
      if (metric.values.length === 0) {
        continue
      }

      const values = metric.values.map(v => v.value)
      const latestValue = values[values.length - 1]

      aggregated[name] = {
        type: metric.type,
        latest: latestValue,
        count: values.length,
        average: values.reduce((a, b) => a + b, 0) / values.length,
        tags: metric.tags
      }

      if (metric.type === METRIC_TYPES.TIMER) {
        aggregated[name].min = Math.min(...values)
        aggregated[name].max = Math.max(...values)
      }
    }

    return aggregated
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
      return {
        platform: 'unknown',
        version: 'unknown',
        system: 'unknown'
      }
    }
  }

  /**
   * 获取会话ID
   * @private
   * @returns {string} 会话ID
   */
  _getSessionId() {
    if (!this.sessionId) {
      this.sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
    }
    return this.sessionId
  }

  /**
   * 输出日志到控制台
   * @private
   * @param {object} logEntry - 日志条目
   */
  _logToConsole(logEntry) {
    const { level, message, data, timestamp } = logEntry
    const timeString = new Date(timestamp).toISOString()

    switch (level) {
    case LOG_LEVELS.CRITICAL:
    case LOG_LEVELS.ERROR:
      console.error(`[${timeString}] [${level.toUpperCase()}] ${message}`, data)
      break
    case LOG_LEVELS.WARNING:
      console.warn(`[${timeString}] [${level.toUpperCase()}] ${message}`, data)
      break
    case LOG_LEVELS.INFO:
      console.log(`[${timeString}] [${level.toUpperCase()}] ${message}`, data)
      break
    case LOG_LEVELS.DEBUG:
      console.log(`[${timeString}] [${level.toUpperCase()}] ${message}`, data)
      break
    }
  }

  /**
   * 获取监控数据
   * @param {object} [options] - 选项
   * @returns {object} 监控数据
   */
  getMonitoringData(options = {}) {
    const {
      includeLogs = false,
      includeEvents = false,
      includePerformance = false
    } = options

    return {
      timestamp: Date.now(),
      sessionId: this._getSessionId(),
      uptime: Date.now() - this.startTime,
      metrics: this._aggregateMetrics(),
      logs: includeLogs ? this.logs.slice(-50) : [],
      events: includeEvents ? this.events.slice(-50) : [],
      performance: includePerformance ? this.performanceData.slice(-50) : [],
      systemInfo: this._getSystemInfo()
    }
  }

  /**
   * 清除监控数据
   * @param {object} [options] - 选项
   */
  clearData(options = {}) {
    const {
      logs = false,
      events = false,
      performance = false,
      metrics = false
    } = options

    if (logs) {
      this.logs = []
    }

    if (events) {
      this.events = []
    }

    if (performance) {
      this.performanceData = []
    }

    if (metrics) {
      this.metrics = {}
    }

    console.log('MonitoringManager.clearData - 清除监控数据', options)
  }

  /**
   * 导出监控报告
   * @returns {object} 监控报告
   */
  exportReport() {
    return {
      timestamp: Date.now(),
      sessionId: this._getSessionId(),
      uptime: Date.now() - this.startTime,
      metrics: this._aggregateMetrics(),
      recentLogs: this.logs.slice(-100),
      recentEvents: this.events.slice(-100),
      recentPerformance: this.performanceData.slice(-50),
      systemInfo: this._getSystemInfo(),
      appInfo: wx.getAppBaseInfo ? wx.getAppBaseInfo() : {},
      summary: {
        totalLogs: this.logs.length,
        totalEvents: this.events.length,
        totalPerformanceData: this.performanceData.length,
        totalMetrics: Object.keys(this.metrics).length
      }
    }
  }

  /**
   * 获取性能摘要
   * @returns {object} 性能摘要
   */
  getPerformanceSummary() {
    const summary = {
      averageApiCallTime: 0,
      averageImOperationTime: 0,
      pageLoadTimes: {},
      totalApiCalls: 0,
      totalImOperations: 0
    }

    // 计算API调用平均时间
    const apiCalls = this.performanceData.filter(p => p.name === 'apiCall')
    if (apiCalls.length > 0) {
      summary.averageApiCallTime = apiCalls.reduce((sum, p) => sum + p.duration, 0) / apiCalls.length
      summary.totalApiCalls = apiCalls.length
    }

    // 计算IM操作平均时间
    const imOperations = this.performanceData.filter(p => p.name.startsWith('im_'))
    if (imOperations.length > 0) {
      summary.averageImOperationTime = imOperations.reduce((sum, p) => sum + p.duration, 0) / imOperations.length
      summary.totalImOperations = imOperations.length
    }

    // 计算页面加载时间
    const pageLoads = this.performanceData.filter(p => p.name.startsWith('page_load_'))
    pageLoads.forEach(p => {
      const pageName = p.name.replace('page_load_', '')
      if (!summary.pageLoadTimes[pageName]) {
        summary.pageLoadTimes[pageName] = []
      }
      summary.pageLoadTimes[pageName].push(p.duration)
    })

    // 计算页面加载平均时间
    for (const [pageName, times] of Object.entries(summary.pageLoadTimes)) {
      summary.pageLoadTimes[pageName] = {
        average: times.reduce((sum, t) => sum + t, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length
      }
    }

    return summary
  }

  /**
   * 获取错误摘要
   * @returns {object} 错误摘要
   */
  getErrorSummary() {
    const errorEvents = this.events.filter(e => e.type === MONITORING_EVENTS.ERROR)
    const errorLogs = this.logs.filter(l => l.level === LOG_LEVELS.ERROR || l.level === LOG_LEVELS.CRITICAL)

    const errorTypes = {}
    errorEvents.forEach(e => {
      const type = e.data.type || 'unknown'
      errorTypes[type] = (errorTypes[type] || 0) + 1
    })

    return {
      totalErrors: errorEvents.length,
      totalErrorLogs: errorLogs.length,
      errorTypes: errorTypes,
      recentErrors: errorEvents.slice(-10)
    }
  }
}

// 导出单例实例
const monitoringManager = new MonitoringManager()

module.exports = {
  MonitoringManager,
  monitoringManager,
  METRIC_TYPES,
  LOG_LEVELS,
  MONITORING_EVENTS
}
