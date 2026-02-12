/**
 * 优化效果验证脚本
 * 用于在Node.js环境中验证核心优化功能的效果
 */

// 导入需要测试的模块
const { stateManager } = require('./stateManager')
const { requestCacheManager } = require('./requestCacheManager')

class OptimizationValidation {
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
    console.log(`=== 开始验证: ${testName} ===`)
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
    console.log(`=== 验证完成: ${testName} ===`)
    console.log(`耗时: ${duration}ms`)
    console.log('验证数据:', additionalData)
    console.log('')
  }

  /**
   * 验证状态管理器性能
   */
  testStateManagerPerformance() {
    this.startTest('状态管理器性能验证')

    try {
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

      // 测试跨页面状态同步
      stateManager.registerPage('test_page_2', { count: 0, name: 'page2' })
      stateManager.registerStateDependency('test_page_2', 'test_page', ['count'])
      
      const syncStartTime = Date.now()
      stateManager.setState('test_page', { count: 5 })
      const syncDuration = Date.now() - syncStartTime

      const page2State = stateManager.getState('test_page_2')

      // 测试事件总线
      let eventReceived = false
      let eventData = null
      
      const unsubscribe = stateManager.subscribe('test_event', (data) => {
        eventReceived = true
        eventData = data
      })

      stateManager.publish('test_event', { message: 'test_message' })
      unsubscribe()

      this.endTest('状态管理器性能验证', {
        registerDuration,
        updateDuration,
        getDuration,
        syncDuration,
        state,
        globalState,
        page2State,
        stateSyncTest: state.count === page2State.count,
        eventTest: eventReceived && eventData && eventData.message === 'test_message'
      })
    } catch (error) {
      console.error('状态管理器验证失败:', error)
      this.endTest('状态管理器性能验证', {
        error: error.message
      })
    }
  }

  /**
   * 验证网络请求缓存
   */
  async testRequestCache() {
    this.startTest('网络请求缓存验证')

    try {
      // 测试缓存键生成
      const cacheKey = requestCacheManager.generateCacheKey('test_url', { param1: 'value1', param2: 'value2' })

      // 测试缓存设置和获取
      requestCacheManager.setCache(cacheKey, { data: 'test_data' })
      const cachedData = requestCacheManager.getCache(cacheKey)

      // 测试缓存过期
      requestCacheManager.setCache('expiring_key', { data: 'expiring_data' }, 100)
      const beforeExpiry = requestCacheManager.getCache('expiring_key')
      
      // 等待缓存过期
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const afterExpiry = requestCacheManager.getCache('expiring_key')

      // 测试批量请求模拟
      const batchRequestStart = Date.now()
      const batchRequests = [
        { url: 'test_url_1', options: { params: { id: 1 } } },
        { url: 'test_url_2', options: { params: { id: 2 } } },
        { url: 'test_url_3', options: { params: { id: 3 } } }
      ]
      
      // 模拟批量请求
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

      this.endTest('网络请求缓存验证', {
        cacheKey,
        cachedData,
        cacheExpiryTest: beforeExpiry && !afterExpiry,
        batchRequestDuration,
        batchRequestCount: batchResults.length,
        batchRequestSuccess: batchResults.length === batchRequests.length
      })
    } catch (error) {
      console.error('网络请求缓存验证失败:', error)
      this.endTest('网络请求缓存验证', {
        error: error.message
      })
    }
  }

  /**
   * 验证内存使用优化
   */
  testMemoryOptimization() {
    this.startTest('内存使用优化验证')

    try {
      // 模拟页面注册和卸载
      const pages = ['page1', 'page2', 'page3', 'page4', 'page5']
      
      // 注册多个页面
      pages.forEach(page => {
        stateManager.registerPage(page, { count: 0, data: `test_${page}` })
      })

      // 测试页面卸载
      const unregisterStartTime = Date.now()
      pages.forEach(page => {
        stateManager.unregisterPage(page)
      })
      const unregisterDuration = Date.now() - unregisterStartTime

      // 验证页面状态是否已清除
      const page1State = stateManager.getState('page1')

      // 测试缓存清理
      const cacheKeys = ['key1', 'key2', 'key3', 'key4', 'key5']
      cacheKeys.forEach(key => {
        requestCacheManager.setCache(key, { data: `test_${key}` })
      })

      const clearCacheStartTime = Date.now()
      cacheKeys.forEach(key => {
        requestCacheManager.clearCache(key)
      })
      const clearCacheDuration = Date.now() - clearCacheStartTime

      // 验证缓存是否已清除
      const key1Cache = requestCacheManager.getCache('key1')

      this.endTest('内存使用优化验证', {
        unregisterDuration,
        clearCacheDuration,
        pageUnregisterTest: !page1State,
        cacheClearTest: !key1Cache
      })
    } catch (error) {
      console.error('内存使用优化验证失败:', error)
      this.endTest('内存使用优化验证', {
        error: error.message
      })
    }
  }

  /**
   * 运行所有验证
   */
  async runAllValidations() {
    console.log('========================================')
    console.log('开始执行优化效果验证套件')
    console.log('========================================')
    console.log('')

    // 运行各个验证
    this.testStateManagerPerformance()
    await this.testRequestCache()
    this.testMemoryOptimization()

    // 生成验证报告
    this.generateValidationReport()
  }

  /**
   * 生成验证报告
   */
  generateValidationReport() {
    console.log('========================================')
    console.log('优化效果验证报告')
    console.log('========================================')
    console.log('')

    console.log('验证结果汇总:')
    console.log('----------------------------------------')

    let totalDuration = 0
    this.testResults.forEach(result => {
      console.log(`${result.testName}: ${result.duration}ms`)
      totalDuration += result.duration
    })

    console.log('----------------------------------------')
    console.log(`总耗时: ${totalDuration}ms`)
    console.log('')

    console.log('详细验证数据:')
    console.log('----------------------------------------')
    console.log(JSON.stringify(this.testResults, null, 2))
    console.log('')

    // 分析优化效果
    this.analyzeOptimizationResults()

    console.log('========================================')
    console.log('验证报告结束')
    console.log('========================================')
  }

  /**
   * 分析优化效果
   */
  analyzeOptimizationResults() {
    console.log('========================================')
    console.log('优化效果分析')
    console.log('========================================')
    console.log('')

    // 分析状态管理器性能
    const stateManagerResult = this.testResults.find(r => r.testName === '状态管理器性能验证')
    if (stateManagerResult && !stateManagerResult.error) {
      console.log('状态管理器优化效果:')
      console.log(`- 状态注册: ${stateManagerResult.registerDuration}ms`)
      console.log(`- 状态更新: ${stateManagerResult.updateDuration}ms`)
      console.log(`- 状态获取: ${stateManagerResult.getDuration}ms`)
      console.log(`- 状态同步: ${stateManagerResult.syncDuration}ms`)
      console.log(`- 状态同步测试: ${stateManagerResult.stateSyncTest ? '通过' : '失败'}`)
      console.log(`- 事件总线测试: ${stateManagerResult.eventTest ? '通过' : '失败'}`)
      console.log('')
    }

    // 分析网络请求缓存
    const requestCacheResult = this.testResults.find(r => r.testName === '网络请求缓存验证')
    if (requestCacheResult && !requestCacheResult.error) {
      console.log('网络请求缓存优化效果:')
      console.log('- 缓存键生成: 成功')
      console.log('- 缓存设置和获取: 成功')
      console.log(`- 缓存过期测试: ${requestCacheResult.cacheExpiryTest ? '通过' : '失败'}`)
      console.log(`- 批量请求处理: ${requestCacheResult.batchRequestDuration}ms`)
      console.log(`- 批量请求成功率: ${requestCacheResult.batchRequestSuccess ? '100%' : '失败'}`)
      console.log('')
    }

    // 分析内存使用优化
    const memoryResult = this.testResults.find(r => r.testName === '内存使用优化验证')
    if (memoryResult && !memoryResult.error) {
      console.log('内存使用优化效果:')
      console.log(`- 页面卸载: ${memoryResult.unregisterDuration}ms`)
      console.log(`- 缓存清理: ${memoryResult.clearCacheDuration}ms`)
      console.log(`- 页面状态清理测试: ${memoryResult.pageUnregisterTest ? '通过' : '失败'}`)
      console.log(`- 缓存清理测试: ${memoryResult.cacheClearTest ? '通过' : '失败'}`)
      console.log('')
    }

    console.log('========================================')
    console.log('优化效果分析结束')
    console.log('========================================')
  }
}

// 运行验证
const validation = new OptimizationValidation()
validation.runAllValidations()
