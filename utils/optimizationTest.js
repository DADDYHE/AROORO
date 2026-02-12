/**
 * 优化效果测试脚本
 * 用于测试登录状态管理系统的优化效果，记录关键指标对比
 */

class OptimizationTest {
  constructor() {
    this.testResults = []
    this.startTime = 0
    this.endTime = 0
  }

  /**
   * 开始测试
   * @param {string} testName - 测试名称
   */
  startTest(testName) {
    this.startTime = Date.now()
    console.log(`=== 开始测试: ${testName} ===`)
  }

  /**
   * 结束测试
   * @param {string} testName - 测试名称
   * @param {object} [additionalData] - 附加测试数据
   */
  endTest(testName, additionalData = {}) {
    this.endTime = Date.now()
    const duration = this.endTime - this.startTime
    
    const result = {
      testName,
      duration,
      timestamp: Date.now(),
      ...additionalData
    }

    this.testResults.push(result)
    console.log(`=== 测试完成: ${testName} ===`)
    console.log(`耗时: ${duration}ms`)
    console.log('测试数据:', additionalData)
    console.log('')
  }

  /**
   * 测试登录流程
   */
  async testLoginFlow() {
    this.startTest('登录流程测试')

    try {
      const appInstance = getApp()
      
      // 测试登录方法
      const loginResult = await appInstance.login()
      
      // 测试登录状态验证
      const loginStatusValid = appInstance.checkLoginStatusValid()
      
      // 测试登录过期处理
      const expiryHandled = await appInstance.handleLoginExpiry()

      this.endTest('登录流程测试', {
        loginSuccess: loginResult.success,
        loginStatusValid,
        expiryHandled
      })
    } catch (error) {
      console.error('登录流程测试失败:', error)
      this.endTest('登录流程测试', {
        error: error.message
      })
    }
  }

  /**
   * 测试状态管理性能
   */
  testStateManagement() {
    this.startTest('状态管理性能测试')

    try {
      const appInstance = getApp()
      const stateManager = appInstance.globalData.stateManager
      
      // 测试状态注册
      const registerStartTime = Date.now()
      stateManager.registerPage('test_page', { count: 0, name: 'test' })
      const registerDuration = Date.now() - registerStartTime

      // 测试状态更新
      const updateStartTime = Date.now()
      stateManager.setState('test_page', { count: 1, name: 'updated' })
      const updateDuration = Date.now() - updateStartTime

      // 测试状态获取
      const getStartTime = Date.now()
      const state = stateManager.getState('test_page')
      const getDuration = Date.now() - getStartTime

      // 测试全局状态
      stateManager.setGlobalState({ globalCount: 1 })
      const globalState = stateManager.getGlobalState()

      this.endTest('状态管理性能测试', {
        registerDuration,
        updateDuration,
        getDuration,
        state,
        globalState
      })
    } catch (error) {
      console.error('状态管理测试失败:', error)
      this.endTest('状态管理性能测试', {
        error: error.message
      })
    }
  }

  /**
   * 测试网络请求缓存
   */
  async testNetworkCache() {
    this.startTest('网络请求缓存测试')

    try {
      const appInstance = getApp()
      const requestCacheManager = appInstance.globalData.requestCacheManager
      
      // 测试缓存键生成
      const cacheKey = requestCacheManager.generateCacheKey('test_url', { param1: 'value1', param2: 'value2' })

      // 测试缓存设置和获取
      requestCacheManager.setCache(cacheKey, { data: 'test_data' })
      const cachedData = requestCacheManager.getCache(cacheKey)

      // 测试模拟网络请求
      const mockRequest = async () => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({ success: true, data: 'mock_response' })
          }, 100)
        })
      }

      // 测试首次请求
      const firstRequestStart = Date.now()
      await mockRequest()
      const firstRequestDuration = Date.now() - firstRequestStart

      // 测试缓存请求
      const cachedRequestStart = Date.now()
      const cachedResponse = requestCacheManager.getCache(cacheKey)
      const cachedRequestDuration = Date.now() - cachedRequestStart

      // 测试批量请求处理
      const batchRequestStart = Date.now()
      const batchRequests = [
        { url: 'test_url_1', options: { params: { id: 1 } } },
        { url: 'test_url_2', options: { params: { id: 2 } } },
        { url: 'test_url_3', options: { params: { id: 3 } } }
      ]
      
      // 由于是模拟请求，我们使用Promise.all来模拟批量请求
      const batchResults = await Promise.all(
        batchRequests.map(({ url }) => {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({ url, data: 'mock_data' })
            }, 50)
          })
        })
      )
      const batchRequestDuration = Date.now() - batchRequestStart

      this.endTest('网络请求缓存测试', {
        cacheKey,
        cachedData,
        firstRequestDuration,
        cachedRequestDuration,
        cacheHit: !!cachedResponse,
        batchRequestDuration,
        batchRequestCount: batchResults.length,
        batchRequestSuccess: batchResults.length === batchRequests.length
      })
    } catch (error) {
      console.error('网络请求缓存测试失败:', error)
      this.endTest('网络请求缓存测试', {
        error: error.message
      })
    }
  }

  /**
   * 测试跨页面状态同步
   */
  testCrossPageStateSync() {
    this.startTest('跨页面状态同步测试')

    try {
      const appInstance = getApp()
      const stateManager = appInstance.globalData.stateManager
      
      // 注册两个测试页面
      stateManager.registerPage('test_page_1', { count: 0, name: 'page1' })
      stateManager.registerPage('test_page_2', { count: 0, name: 'page2' })

      // 注册页面间状态依赖关系
      stateManager.registerStateDependency('test_page_2', 'test_page_1', ['count'])

      // 测试状态更新和自动同步
      const updateStart = Date.now()
      stateManager.setState('test_page_1', { count: 5, name: 'updated_page1' })
      const updateDuration = Date.now() - updateStart

      // 验证状态是否同步
      const page1State = stateManager.getState('test_page_1')
      const page2State = stateManager.getState('test_page_2')

      // 测试事件总线
      let eventReceived = false
      let eventData = null
      
      const unsubscribe = stateManager.subscribe('test_event', (data) => {
        eventReceived = true
        eventData = data
      })

      // 发布事件
      stateManager.publish('test_event', { message: 'test_message' })

      // 取消订阅
      unsubscribe()

      // 测试全局状态广播
      let globalEventReceived = false
      
      const unsubscribeGlobal = stateManager.subscribe('globalStateChanged', () => {
        globalEventReceived = true
      })

      // 更新全局状态
      stateManager.setGlobalState({ globalCount: 10 })

      // 取消全局事件订阅
      unsubscribeGlobal()

      this.endTest('跨页面状态同步测试', {
        updateDuration,
        page1State,
        page2State,
        stateSyncTest: page1State.count === page2State.count,
        eventTest: eventReceived && eventData && eventData.message === 'test_message',
        globalEventTest: globalEventReceived
      })
    } catch (error) {
      console.error('跨页面状态同步测试失败:', error)
      this.endTest('跨页面状态同步测试', {
        error: error.message
      })
    }
  }

  /**
   * 测试安全性增强
   */
  testSecurityEnhancement() {
    this.startTest('安全性增强测试')

    try {
      const appInstance = getApp()
      const securityManager = appInstance.globalData.securityManager
      
      // 测试数据加密和解密
      const originalData = 'test_secure_data'
      const encryptedData = securityManager.encryptData(originalData)
      const decryptedData = securityManager.decryptData(encryptedData)

      // 测试安全存储
      securityManager.secureStorageSet('test_key', { secure: 'data' })
      const secureData = securityManager.secureStorageGet('test_key')

      // 测试UserSig验证
      const mockUserSig = 'mock_valid_user_sig_1234567890'
      const userSigValid = securityManager.validateUserSig(mockUserSig)

      this.endTest('安全性增强测试', {
        encryptionTest: originalData === decryptedData,
        secureStorageTest: !!secureData,
        userSigValidation: userSigValid
      })
    } catch (error) {
      console.error('安全性增强测试失败:', error)
      this.endTest('安全性增强测试', {
        error: error.message
      })
    }
  }

  /**
   * 测试性能监控
   */
  testPerformanceMonitoring() {
    this.startTest('性能监控测试')

    try {
      const appInstance = getApp()
      const performanceMonitor = appInstance.globalData.performanceMonitor
      
      // 测试性能标记
      performanceMonitor.mark('test_start')
      
      // 模拟一些操作
      for (let i = 0; i < 100000; i++) {
        Math.sqrt(i)
      }
      
      performanceMonitor.mark('test_end')
      const operationDuration = performanceMonitor.measure('test_start', 'test_end')

      // 测试性能报告导出
      const report = performanceMonitor.exportReport()

      this.endTest('性能监控测试', {
        operationDuration,
        reportGenerated: !!report
      })
    } catch (error) {
      console.error('性能监控测试失败:', error)
      this.endTest('性能监控测试', {
        error: error.message
      })
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('========================================')
    console.log('开始执行优化效果测试套件')
    console.log('========================================')
    console.log('')

    // 运行各个测试
    await this.testLoginFlow()
    this.testStateManagement()
    await this.testNetworkCache()
    this.testCrossPageStateSync()
    this.testSecurityEnhancement()
    this.testPerformanceMonitoring()

    // 生成测试报告
    this.generateTestReport()
  }

  /**
   * 生成测试报告
   */
  generateTestReport() {
    console.log('========================================')
    console.log('优化效果测试报告')
    console.log('========================================')
    console.log('')

    console.log('测试结果汇总:')
    console.log('----------------------------------------')

    let totalDuration = 0
    this.testResults.forEach(result => {
      console.log(`${result.testName}: ${result.duration}ms`)
      totalDuration += result.duration
    })

    console.log('----------------------------------------')
    console.log(`总耗时: ${totalDuration}ms`)
    console.log('')

    console.log('详细测试数据:')
    console.log('----------------------------------------')
    console.log(JSON.stringify(this.testResults, null, 2))
    console.log('')

    console.log('========================================')
    console.log('测试报告结束')
    console.log('========================================')

    // 保存测试结果到本地存储
    try {
      wx.setStorageSync('optimization_test_results', this.testResults)
      console.log('测试结果已保存到本地存储')
    } catch (error) {
      console.error('保存测试结果失败:', error)
    }
  }

  /**
   * 获取历史测试结果
   * @returns {array} 历史测试结果
   */
  getHistoricalResults() {
    try {
      return wx.getStorageSync('optimization_test_results') || []
    } catch (error) {
      console.error('获取历史测试结果失败:', error)
      return []
    }
  }

  /**
   * 对比测试结果
   * @param {array} previousResults - 之前的测试结果
   */
  compareResults(previousResults) {
    console.log('========================================')
    console.log('测试结果对比分析')
    console.log('========================================')
    console.log('')

    if (!previousResults || previousResults.length === 0) {
      console.log('没有历史测试结果可对比')
      return
    }

    console.log('对比分析:')
    console.log('----------------------------------------')

    this.testResults.forEach((currentResult, index) => {
      const previousResult = previousResults.find(r => r.testName === currentResult.testName)
      
      if (previousResult) {
        const timeDiff = currentResult.duration - previousResult.duration
        const percentageChange = ((timeDiff / previousResult.duration) * 100).toFixed(2)
        const status = timeDiff < 0 ? '优化' : '劣化'
        
        console.log(`${currentResult.testName}:`)
        console.log(`  当前: ${currentResult.duration}ms`)
        console.log(`  之前: ${previousResult.duration}ms`)
        console.log(`  变化: ${Math.abs(timeDiff)}ms (${percentageChange}%) - ${status}`)
        console.log('')
      }
    })

    console.log('========================================')
    console.log('对比分析结束')
    console.log('========================================')
  }
}

// 导出测试类
module.exports = {
  OptimizationTest
}

// 运行测试
if (typeof wx !== 'undefined') {
  // 在小程序环境中运行
  wx.optimizationTest = function() {
    const test = new OptimizationTest()
    test.runAllTests()
  }
} else {
  // 在其他环境中运行
  console.log('优化测试脚本已加载')
}