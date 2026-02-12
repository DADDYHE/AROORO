/**
 * 身份访问中间件
 * 拦截所有身份数据访问，确保唯一权威数据源
 *
 * 功能：
 * 1. 拦截直接访问本地存储、globalData 等行为
 * 2. 强制使用 centralIdentityManager 获取身份数据
 * 3. 提供访问日志和权限验证
 * 4. 在开发环境发出警告
 */

// 违规访问模式
const PROHIBITED_PATTERNS = [
  {
    pattern: /wx\.getStorageSync\s*\(\s*['"]userRole['"]\s*\)/g,
    description: '直接从本地存储获取 userRole',
    correctUsage: 'centralIdentityManager.getCurrentRole()'
  },
  {
    pattern: /wx\.getStorageSync\s*\(\s*['"]userInfo['"]\s*\)/g,
    description: '直接从本地存储获取 userInfo',
    correctUsage: 'centralIdentityManager.getCurrentIdentity()'
  },
  {
    pattern: /wx\.getStorageSync\s*\(\s*['"]hostInfo['"]\s*\)/g,
    description: '直接从本地存储获取 hostInfo',
    correctUsage: 'centralIdentityManager.getIdentity("host")'
  },
  {
    pattern: /wx\.getStorageSync\s*\(\s*['"]ownerInfo['"]\s*\)/g,
    description: '直接从本地存储获取 ownerInfo',
    correctUsage: 'centralIdentityManager.getIdentity("owner")'
  },
  {
    pattern: /app\.globalData\.userRole\s*=/g,
    description: '直接设置 app.globalData.userRole',
    correctUsage: 'centralIdentityManager.switchRole(role)'
  },
  {
    pattern: /app\.globalData\.userInfo\s*=/g,
    description: '直接设置 app.globalData.userInfo',
    correctUsage: 'centralIdentityManager.setIdentity(role, userInfo)'
  },
  {
    pattern: /app\.globalData\.userRole\b/g,
    description: '直接读取 app.globalData.userRole',
    correctUsage: 'centralIdentityManager.getCurrentRole()'
  },
  {
    pattern: /app\.globalData\.userInfo\b/g,
    description: '直接读取 app.globalData.userInfo',
    correctUsage: 'centralIdentityManager.getCurrentIdentity()'
  }
]

// 访问日志记录
class AccessInterceptor {
  constructor() {
    this.violations = []
    this.warnings = []
    this.interceptionEnabled = true
  }

  /**
   * 检查代码中的违规访问
   * @param {string} code - 代码内容
   * @param {string} filePath - 文件路径
   * @returns {array} 违规列表
   */
  checkViolations(code, filePath) {
    const violations = []

    PROHIBITED_PATTERNS.forEach(({ pattern, description, correctUsage }) => {
      let match
      const regex = new RegExp(pattern.source, pattern.flags)

      while ((match = regex.exec(code)) !== null) {
        violations.push({
          pattern: description,
          match: match[0],
          line: this._getLineNumber(code, match.index),
          column: match.index,
          filePath,
          correctUsage,
          timestamp: Date.now()
        })
      }
    })

    return violations
  }

  /**
   * 获取行号
   * @private
   * @param {string} code - 代码内容
   * @param {number} index - 字符索引
   * @returns {number} 行号
   */
  _getLineNumber(code, index) {
    const beforeMatch = code.substring(0, index)
    return beforeMatch.split('\n').length
  }

  /**
   * 记录违规
   * @param {object} violation - 违规信息
   */
  logViolation(violation) {
    this.violations.push(violation)

    // 输出警告
    console.warn(`[IdentityAccessViolation] 检测到违规访问:`)
    console.warn(`  文件: ${violation.filePath}`)
    console.warn(`  行号: ${violation.line}`)
    console.warn(`  问题: ${violation.pattern}`)
    console.warn(`  违规代码: ${violation.match}`)
    console.warn(`  正确用法: ${violation.correctUsage}`)
    console.warn(`----------------------------------------`)
  }

  /**
   * 获取所有违规记录
   * @returns {array} 违规列表
   */
  getViolations() {
    return this.violations
  }

  /**
   * 清除违规记录
   */
  clearViolations() {
    this.violations = []
    console.log('[IdentityAccessInterceptor] 违规记录已清除')
  }

  /**
   * 生成违规报告
   * @returns {object} 违规报告
   */
  generateReport() {
    const report = {
      totalViolations: this.violations.length,
      violationsByType: {},
      violationsByFile: {},
      timestamp: Date.now()
    }

    // 按类型分组
    this.violations.forEach(violation => {
      if (!report.violationsByType[violation.pattern]) {
        report.violationsByType[violation.pattern] = []
      }
      report.violationsByType[violation.pattern].push(violation)
    })

    // 按文件分组
    this.violations.forEach(violation => {
      if (!report.violationsByFile[violation.filePath]) {
        report.violationsByFile[violation.filePath] = []
      }
      report.violationsByFile[violation.filePath].push(violation)
    })

    return report
  }
}

// 创建拦截器实例
const accessInterceptor = new AccessInterceptor()

/**
 * 启用访问拦截（开发环境）
 */
function enableInterception() {
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    accessInterceptor.interceptionEnabled = true
    console.log('[IdentityAccessInterceptor] 访问拦截已启用')
  }
}

/**
 * 禁用访问拦截（生产环境）
 */
function disableInterception() {
  accessInterceptor.interceptionEnabled = false
  console.log('[IdentityAccessInterceptor] 访问拦截已禁用')
}

/**
 * 验证文件中的身份访问
 * @param {string} filePath - 文件路径
 * @param {string} code - 代码内容
 * @returns {object} 验证结果
 */
function validateIdentityAccess(filePath, code) {
  if (!accessInterceptor.interceptionEnabled) {
    return { isValid: true, violations: [] }
  }

  const violations = accessInterceptor.checkViolations(code, filePath)

  violations.forEach(violation => {
    accessInterceptor.logViolation(violation)
  })

  return {
    isValid: violations.length === 0,
    violations
  }
}

/**
 * 创建代理对象，拦截 globalData 访问
 * @param {object} globalData - 原始 globalData 对象
 * @returns {object} 代理后的 globalData 对象
 */
function createGlobalDataProxy(globalData) {
  if (typeof Proxy === 'undefined') {
    // 微信小程序不支持 Proxy，返回原始对象
    return globalData
  }

  const proxyHandler = {
    get(target, prop) {
      // 检查是否访问身份相关字段
      if (['userRole', 'userInfo', 'hostInfo', 'ownerInfo'].includes(prop)) {
        console.warn(`[IdentityAccessInterceptor] 检测到直接访问 app.globalData.${prop}`)
        console.warn(`  正确用法：使用 centralIdentityManager 的对应方法`)
        console.warn(`  - userRole -> centralIdentityManager.getCurrentRole()`)
        console.warn(`  - userInfo -> centralIdentityManager.getCurrentIdentity()`)
        console.warn(`  - hostInfo -> centralIdentityManager.getIdentity("host")`)
        console.warn(`  - ownerInfo -> centralIdentityManager.getIdentity("owner")`)
      }

      return target[prop]
    },

    set(target, prop, value) {
      // 检查是否设置身份相关字段
      if (['userRole', 'userInfo', 'hostInfo', 'ownerInfo'].includes(prop)) {
        console.warn(`[IdentityAccessInterceptor] 检测到直接设置 app.globalData.${prop}`)
        console.warn(`  正确用法：使用 centralIdentityManager 的对应方法`)
        console.warn(`  - userRole -> centralIdentityManager.switchRole(role)`)
        console.warn(`  - userInfo -> centralIdentityManager.setIdentity(role, userInfo)`)
      }

      target[prop] = value
      return true
    }
  }

  return new Proxy(globalData, proxyHandler)
}

/**
 * 拦截 wx.getStorageSync 调用
 * @param {function} originalGetStorageSync - 原始函数
 * @returns {function} 拦截后的函数
 */
function interceptGetStorageSync(originalGetStorageSync) {
  return function (key) {
    // 检查是否访问身份相关存储
    if (['userRole', 'userInfo', 'hostInfo', 'ownerInfo'].includes(key)) {
      console.warn(`[IdentityAccessInterceptor] 检测到直接访问本地存储: ${key}`)
      console.warn(`  正确用法：使用 centralIdentityManager 的对应方法`)
      console.warn(`  - userRole -> centralIdentityManager.getCurrentRole()`)
      console.warn(`  - userInfo -> centralIdentityManager.getCurrentIdentity()`)
      console.warn(`  - hostInfo -> centralIdentityManager.getIdentity("host")`)
      console.warn(`  - ownerInfo -> centralIdentityManager.getIdentity("owner")`)
    }

    return originalGetStorageSync.call(this, key)
  }
}

/**
 * 拦截 wx.setStorageSync 调用
 * @param {function} originalSetStorageSync - 原始函数
 * @returns {function} 拦截后的函数
 */
function interceptSetStorageSync(originalSetStorageSync) {
  return function (key, data) {
    // 检查是否设置身份相关存储
    if (['userRole', 'userInfo', 'hostInfo', 'ownerInfo'].includes(key)) {
      console.warn(`[IdentityAccessInterceptor] 检测到直接设置本地存储: ${key}`)
      console.warn(`  正确用法：使用 centralIdentityManager 的对应方法`)
      console.warn(`  - userRole -> centralIdentityManager.switchRole(role)`)
      console.warn(`  - userInfo -> centralIdentityManager.setIdentity(role, userInfo)`)
    }

    return originalSetStorageSync.call(this, key, data)
  }
}

/**
 * 应用所有拦截器
 */
function applyInterceptors() {
  if (typeof Proxy === 'undefined') {
    console.warn('[IdentityAccessInterceptor] 当前环境不支持 Proxy，无法应用拦截器')
    return
  }

  try {
    const app = getApp()
    if (app && app.globalData) {
      app.globalData = createGlobalDataProxy(app.globalData)
      console.log('[IdentityAccessInterceptor] globalData 代理已应用')
    }

    // 注意：微信小程序不允许拦截 wx API，这部分仅作为示例
    // 实际使用中，通过代码扫描工具来检测违规
  } catch (error) {
    console.error('[IdentityAccessInterceptor] 应用拦截器失败:', error)
  }
}

module.exports = {
  accessInterceptor,
  enableInterception,
  disableInterception,
  validateIdentityAccess,
  applyInterceptors,
  PROHIBITED_PATTERNS
}
