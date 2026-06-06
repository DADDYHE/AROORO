const { STORAGE_KEYS } = require('../config/storageKeys')

class AppStartupOptimizer {
  constructor() {
    this.phaseMetrics = {}
    this.initializedPhases = new Set()
    this.deferredTasks = []
    this.lazyModules = new Map()
  }

  _recordPhase(phaseName, startTime, endTime) {
    const duration = endTime - startTime
    this.phaseMetrics[phaseName] = {
      duration,
      startTime,
      endTime
    }
    console.log(`[StartupOptimizer] 阶段 ${phaseName} 完成，耗时: ${duration}ms`)
  }

  async executeCriticalPhase(app) {
    if (this.initializedPhases.has('critical')) {
      return
    }

    const startTime = Date.now()
    console.log('[StartupOptimizer] 开始阶段一：关键启动')

    try {
      await this._initializeMinimalCoreModules(app)
      this._fastRestoreUserInfo(app)

      this.initializedPhases.add('critical')
      this._recordPhase('critical', startTime, Date.now())
      
      console.log('[StartupOptimizer] 阶段一完成，首页可以显示了')
    } catch (error) {
      console.error('[StartupOptimizer] 阶段一初始化失败:', error)
      throw error
    }
  }

  async executeBackgroundPhase(app) {
    if (this.initializedPhases.has('background')) {
      return
    }

    const startTime = Date.now()
    console.log('[StartupOptimizer] 开始阶段二：后台初始化')

    try {
      await Promise.all([
        this._initializeStateManager(app),
        this._initializeOtherManagers(app)
      ])

      this.initializedPhases.add('background')
      this._recordPhase('background', startTime, Date.now())
      
      console.log('[StartupOptimizer] 阶段二完成')
    } catch (error) {
      console.error('[StartupOptimizer] 阶段二初始化失败:', error)
    }
  }

  registerLazyModule(moduleName, initializer) {
    this.lazyModules.set(moduleName, {
      initializer,
      initialized: false
    })
  }

  async initializeLazyModule(moduleName, app) {
    const module = this.lazyModules.get(moduleName)
    if (!module) {
      console.warn(`[StartupOptimizer] 懒加载模块 ${moduleName} 未注册`)
      return null
    }

    if (module.initialized) {
      console.log(`[StartupOptimizer] 懒加载模块 ${moduleName} 已初始化`)
      return module.instance
    }

    console.log(`[StartupOptimizer] 开始初始化懒加载模块: ${moduleName}`)
    const startTime = Date.now()

    try {
      const instance = await module.initializer(app)
      module.instance = instance
      module.initialized = true

      this._recordPhase(`lazy:${moduleName}`, startTime, Date.now())
      console.log(`[StartupOptimizer] 懒加载模块 ${moduleName} 初始化完成`)
      
      return instance
    } catch (error) {
      console.error(`[StartupOptimizer] 懒加载模块 ${moduleName} 初始化失败:`, error)
      throw error
    }
  }

  deferTask(task, delay = 0, group = 'default') {
    this.deferredTasks.push({ task, delay, group })
  }

  async executeDeferredTasks(strategy = 'parallel') {
    console.log(`[StartupOptimizer] 开始执行延迟任务（策略: ${strategy}）`)
    
    const groups = {}
    this.deferredTasks.forEach(item => {
      if (!groups[item.group]) groups[item.group] = []
      groups[item.group].push(item)
    })

    for (const [, tasks] of Object.entries(groups)) {
      if (strategy === 'parallel') {
        const promises = tasks.map(({ task, delay }) => {
          return new Promise(resolve => {
            setTimeout(() => {
              task().catch(error => {
                console.error('[StartupOptimizer] 延迟任务执行失败:', error)
              }).finally(resolve)
            }, delay)
          })
        })
        await Promise.all(promises)
      } else {
        for (const { task, delay } of tasks) {
          await new Promise(resolve => setTimeout(resolve, delay))
          try {
            await task()
          } catch (error) {
            console.error('[StartupOptimizer] 延迟任务执行失败:', error)
          }
        }
      }
    }
    
    this.deferredTasks.length = 0
    console.log('[StartupOptimizer] 延迟任务执行完成')
  }

  async _initializeMinimalCoreModules(app) {
    // TODO: 根据实际业务需求补充核心模块初始化逻辑
    // 例如：初始化日志服务、错误上报服务、监控服务等
    console.log('[StartupOptimizer] 最小化核心模块初始化')
  }

  _fastRestoreUserInfo(app) {
    try {
      const { AUTH: authKeys } = STORAGE_KEYS
      const isLogout = wx.getStorageSync(authKeys.IS_LOGOUT)
      if (isLogout) {
        app.globalData.isLogout = true
        console.log('[StartupOptimizer] 检测到退出登录标记，不恢复用户信息')
        return
      }

      const loginExpiry = wx.getStorageSync(authKeys.LOGIN_EXPIRY)
      if (!loginExpiry || Date.now() >= loginExpiry) {
        console.log('[StartupOptimizer] 登录态已过期，不恢复用户信息')
        wx.removeStorageSync(authKeys.USER_INFO)
        wx.removeStorageSync(authKeys.LOGIN_EXPIRY)
        return
      }

      const cachedUserInfo = wx.getStorageSync(authKeys.USER_INFO)
      if (cachedUserInfo && cachedUserInfo.openid) {
        app.globalData.userInfo = cachedUserInfo
        app.globalData.isLoggedIn = true
        console.log('[StartupOptimizer] 从本地缓存快速恢复用户信息成功')
      } else {
        console.log('[StartupOptimizer] 无有效缓存用户信息')
      }
    } catch (error) {
      console.warn('[StartupOptimizer] 用户信息检查失败:', error)
    }
  }

  async _initializeStateManager(app) {
    // TODO: 初始化状态管理器（当前已由 globalErrorManager 统一管理）
    console.log('[StartupOptimizer] 状态管理器由 globalErrorManager 统一管理，跳过独立初始化')
  }

  async _initializeOtherManagers(app) {
    // TODO: 初始化其他非关键管理器（如推送等）
    console.log('[StartupOptimizer] 其他管理器已由 app.js 初始化，跳过重复初始化')
  }

  getPerformanceReport() {
    const totalDuration = Object.values(this.phaseMetrics).reduce(
      (sum, phase) => sum + phase.duration,
      0
    )

    return {
      phases: this.phaseMetrics,
      totalDuration,
      initializedPhases: Array.from(this.initializedPhases),
      lazyModules: Array.from(this.lazyModules.keys()).map(name => ({
        name,
        initialized: this.lazyModules.get(name).initialized
      }))
    }
  }

  printPerformanceReport() {
    const report = this.getPerformanceReport()
    console.log('[StartupOptimizer] 性能报告:', JSON.stringify(report, null, 2))
  }
}

const appStartupOptimizer = new AppStartupOptimizer()

module.exports = {
  appStartupOptimizer
}
