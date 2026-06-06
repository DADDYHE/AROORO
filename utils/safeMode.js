/**
 * SafeMode - 安全模式工具
 * 仅用于开发调试环境，生产环境强制禁用。
 * 配置仅存储在内存中，不持久化到用户可篡改的 Storage。
 */

const ENV = require('../config/env')

const DEFAULT_CONFIG = {
  enabled: false,
  disabledServices: {
    userService: [],
    hostService: [],
    petService: [],
    orderService: [],
    activityService: [],
    adminService: [],
    utilityService: [],
    couponService: [],
    mallService: [],
    feedingService: [],
    favoriteService: [],
    tuanService: [],
  },
  excludedFunctions: [],
}

let currentConfig = { ...DEFAULT_CONFIG }

function loadConfig() {
  // 生产环境强制禁用安全模式，不读取 Storage
  if (ENV.currentEnv === 'production') {
    currentConfig = { ...DEFAULT_CONFIG, enabled: false }
    return currentConfig
  }
  return currentConfig
}

function getConfig() {
  if (!currentConfig) loadConfig()
  return currentConfig
}

function isEnabled() {
  // 生产环境始终返回 false
  if (ENV.currentEnv === 'production') return false
  return getConfig().enabled
}

function enable() {
  if (ENV.currentEnv === 'production') {
    console.warn('[SafeMode] 生产环境不允许启用安全模式')
    return
  }
  const config = getConfig()
  config.enabled = true
  currentConfig = config
  console.log('[SafeMode] 安全模式已启用（仅内存，不持久化）')
}

function disable() {
  const config = getConfig()
  config.enabled = false
  currentConfig = config
  console.log('[SafeMode] 安全模式已关闭')
}

function isServiceDisabled(functionName, action) {
  if (!isEnabled()) return false

  const config = getConfig()
  if (config.excludedFunctions.includes(functionName)) return false

  const disabled = config.disabledServices[functionName]
  if (!disabled) return false

  if (disabled.length === 0) return true
  return disabled.includes(action)
}

function disableService(functionName, action) {
  if (ENV.currentEnv === 'production') return
  const config = getConfig()
  if (!config.disabledServices[functionName]) {
    config.disabledServices[functionName] = []
  }
  if (action && !config.disabledServices[functionName].includes(action)) {
    config.disabledServices[functionName].push(action)
  }
  currentConfig = config
  console.log(`[SafeMode] 禁用 ${functionName}.${action || '*'}`)
}

function enableService(functionName, action) {
  const config = getConfig()
  if (!config.disabledServices[functionName]) return
  if (action) {
    config.disabledServices[functionName] = config.disabledServices[functionName].filter(a => a !== action)
  } else {
    config.disabledServices[functionName] = []
  }
  currentConfig = config
  console.log(`[SafeMode] 恢复 ${functionName}.${action || '*'}`)
}

function excludeFunction(functionName) {
  const config = getConfig()
  if (!config.excludedFunctions.includes(functionName)) {
    config.excludedFunctions.push(functionName)
    currentConfig = config
    console.log(`[SafeMode] ${functionName} 已从安全模式排除（始终允许）`)
  }
}

function reset() {
  currentConfig = { ...DEFAULT_CONFIG }
  console.log('[SafeMode] 已重置为默认配置')
}

function checkCall(functionName, action) {
  if (isServiceDisabled(functionName, action)) {
    console.log(`[SafeMode] 拦截: ${functionName}.${action}`)
    return { blocked: true, reason: 'safe_mode' }
  }
  return { blocked: false }
}

module.exports = {
  loadConfig,
  getConfig,
  isEnabled,
  enable,
  disable,
  isServiceDisabled,
  disableService,
  enableService,
  excludeFunction,
  reset,
  checkCall,
}
