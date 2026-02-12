/**
 * 性能监控工具
 * 用于跟踪应用性能指标，包括启动时间、页面加载时间、网络请求时间等
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {} // 性能指标
    this.markers = {} // 性能标记
    this.networkRequests = [] // 网络请求记录
    this.pageLoadTimes = {} // 页面加载时间
    this.MAX_REQUEST_RECORDS = 100 // 最大请求记录数
    this.isMonitoring = false // 是否正在监控
  }

  /**
   * 开始监控
   */
  startMonitoring() {
    this.isMonitoring = true
    this._setupNetworkMonitoring()
    this._setupPageMonitoring()

  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    this.isMonitoring = false

  }

  /**
   * 设置网络监控
   * @private
   */
  _setupNetworkMonitoring() {
    // 重写wx.request方法以监控网络请求
    const originalRequest = wx.request
    wx.request = (options) => {
      const startTime = Date.now()
      const requestId = `${options.url}_${Date.now()}`

      // 保存原始的success和fail回调
      const originalSuccess = options.success
      const originalFail = options.fail

      // 重写success回调
      options.success = (res) => {
        const endTime = Date.now()
        const duration = endTime - startTime

        // 记录网络请求
        this._recordNetworkRequest({
          id: requestId,
          url: options.url,
          method: options.method || 'GET',
          startTime,
          endTime,
          duration,
          statusCode: res.statusCode,
          success: true
        })

        // 调用原始的success回调
        if (originalSuccess) {
          originalSuccess(res)
        }
      }

      // 重写fail回调
      options.fail = (error) => {
        const endTime = Date.now()
        const duration = endTime - startTime

        // 记录网络请求
        this._recordNetworkRequest({
          id: requestId,
          url: options.url,
          method: options.method || 'GET',
          startTime,
          endTime,
          duration,
          success: false,
          error: error.errMsg
        })

        // 调用原始的fail回调
        if (originalFail) {
          originalFail(error)
        }
      }

      return originalRequest(options)
    }

    // 重写wx.cloud.callFunction方法以监控云函数调用
    const originalCallFunction = wx.cloud.callFunction
    if (originalCallFunction) {
      wx.cloud.callFunction = async (options) => {
        const startTime = Date.now()
        const requestId = `cloud.function:${options.name}_${Date.now()}`

        try {
          const result = await originalCallFunction(options)
          const endTime = Date.now()
          const duration = endTime - startTime

          // 记录云函数调用
          this._recordNetworkRequest({
            id: requestId,
            url: `cloud.function:${options.name}`,
            method: 'POST',
            startTime,
            endTime,
            duration,
            success: true,
            type: 'cloud_function'
          })

          return result
        } catch (error) {
          const endTime = Date.now()
          const duration = endTime - startTime

          // 记录云函数调用
          this._recordNetworkRequest({
            id: requestId,
            url: `cloud.function:${options.name}`,
            method: 'POST',
            startTime,
            endTime,
            duration,
            success: false,
            error: error.message,
            type: 'cloud_function'
          })

          throw error
        }
      }
    }
  }

  /**
   * 设置页面监控
   * @private
   */
  _setupPageMonitoring() {
    // 不重写全局Page对象，而是提供一个监控函数供页面调用
    // 页面可以通过调用performanceMonitor.monitorPage(this)来监控页面生命周期
    this.monitorPage = function(pageInstance) {
      
      // 监控页面加载
      const originalOnLoad = pageInstance.onLoad
      pageInstance.onLoad = function(options) {
        this.__loadStartTime = Date.now()


        if (originalOnLoad) {
          originalOnLoad.call(this, options)
        }
      }

      // 监控页面显示
      const originalOnShow = pageInstance.onShow
      pageInstance.onShow = function() {
        this.__showStartTime = Date.now()


        if (originalOnShow) {
          originalOnShow.call(this)
        }
      }

      // 监控页面就绪
      const originalOnReady = pageInstance.onReady
      pageInstance.onReady = function() {
        const loadTime = Date.now() - (this.__loadStartTime || Date.now())
        
        // 记录页面加载时间
        this.__pageLoadTime = loadTime


        if (originalOnReady) {
          originalOnReady.call(this)
        }
      }
      
      return pageInstance
    }
  }

  /**
   * 记录网络请求
   * @private
   * @param {object} request - 请求信息
   */
  _recordNetworkRequest(request) {
    if (!this.isMonitoring) {
      return
    }

    this.networkRequests.push(request)

    // 限制请求记录数量
    if (this.networkRequests.length > this.MAX_REQUEST_RECORDS) {
      this.networkRequests = this.networkRequests.slice(-this.MAX_REQUEST_RECORDS)
    }

    // 更新网络请求指标
    this._updateNetworkMetrics()
  }

  /**
   * 更新网络请求指标
   * @private
   */
  _updateNetworkMetrics() {
    const requests = this.networkRequests
    const totalRequests = requests.length
    const successfulRequests = requests.filter(r => r.success).length
    const failedRequests = totalRequests - successfulRequests
    const totalDuration = requests.reduce((sum, r) => sum + r.duration, 0)
    const averageDuration = totalRequests > 0 ? totalDuration / totalRequests : 0

    this.metrics.network = {
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      totalDuration,
      averageDuration,
      lastUpdated: Date.now()
    }
  }

  /**
   * 记录性能标记
   * @param {string} name - 标记名称
   */
  mark(name) {
    this.markers[name] = Date.now()
  }

  /**
   * 计算两个标记之间的时间差
   * @param {string} startMark - 开始标记名称
   * @param {string} endMark - 结束标记名称
   * @returns {number|null} 时间差（毫秒）或null
   */
  measure(startMark, endMark) {
    if (!this.markers[startMark] || !this.markers[endMark]) {
      return null
    }
    return this.markers[endMark] - this.markers[startMark]
  }

  /**
   * 记录指标
   * @param {string} name - 指标名称
   * @param {any} value - 指标值
   */
  setMetric(name, value) {
    this.metrics[name] = {
      value,
      timestamp: Date.now()
    }
  }

  /**
   * 获取指标
   * @param {string} [name] - 指标名称，不提供则获取所有指标
   * @returns {any} 指标值或指标对象
   */
  getMetric(name) {
    if (name) {
      return this.metrics[name]
    }
    return this.metrics
  }

  /**
   * 获取网络请求记录
   * @param {number} [limit] - 返回记录数量限制
   * @returns {array} 网络请求记录
   */
  getNetworkRequests(limit) {
    if (limit) {
      return this.networkRequests.slice(-limit)
    }
    return this.networkRequests
  }

  /**
   * 获取页面加载时间
   * @returns {object} 页面加载时间
   */
  getPageLoadTimes() {
    return this.pageLoadTimes
  }

  /**
   * 清除所有数据
   */
  clear() {
    this.metrics = {}
    this.markers = {}
    this.networkRequests = []
    this.pageLoadTimes = {}
  }

  /**
   * 导出性能报告
   * @returns {object} 性能报告
   */
  exportReport() {
    return {
      timestamp: Date.now(),
      metrics: this.metrics,
      networkRequests: this.networkRequests,
      pageLoadTimes: this.pageLoadTimes,
      markers: this.markers
    }
  }

  /**
   * 打印性能报告
   */
  printReport() {
    // 性能报告已导出，可通过exportReport()方法获取详细数据
  }

  /**
   * 监控函数执行时间
   * @param {string} name - 函数名称
   * @param {function} fn - 要执行的函数
   * @returns {any} 函数执行结果
   */
  monitorFunction(name, fn) {
    const startTime = Date.now()
    const result = fn()
    const endTime = Date.now()
    const duration = endTime - startTime


    this.setMetric(`function_${name}`, duration)

    return result
  }

  /**
   * 监控异步函数执行时间
   * @param {string} name - 函数名称
   * @param {function} fn - 要执行的异步函数
   * @returns {Promise<any>} 函数执行结果
   */
  async monitorAsyncFunction(name, fn) {
    const startTime = Date.now()
    const result = await fn()
    const endTime = Date.now()
    const duration = endTime - startTime


    this.setMetric(`async_function_${name}`, duration)

    return result
  }
}

// 导出单例实例
const performanceMonitor = new PerformanceMonitor()

module.exports = {
  PerformanceMonitor,
  performanceMonitor
}