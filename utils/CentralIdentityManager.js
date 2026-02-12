/**
 * 集中式身份管理器
 * 系统内唯一权威的身份数据源
 *
 * 核心原则：
 * 1. 所有身份数据必须通过此管理器获取
 * 2. 禁止从本地存储、缓存、globalData等其他渠道获取或存储身份数据
 * 3. 身份变更时自动同步所有相关页面
 * 4. 提供完整的访问日志和权限控制机制
 */

let app
try {
  app = getApp()
} catch (error) {
  app = global.app || { globalData: {} }
}

// 身份事件类型
const IDENTITY_EVENTS = {
  ROLE_CHANGED: 'central:roleChanged',
  IDENTITY_UPDATED: 'central:identityUpdated',
  LOGIN_STATE_CHANGED: 'central:loginStateChanged',
  PERMISSION_UPDATED: 'central:permissionUpdated'
}

// 角色类型定义
const ROLE_TYPES = {
  OWNER: 'owner', // 宠物主人
  HOST: 'host',   // 寄养家庭
  GUEST: 'guest'  // 访客
}

// 权限定义
const PERMISSIONS = {
  // 基础权限
  VIEW_OWN_PROFILE: 'viewOwnProfile',
  EDIT_OWN_PROFILE: 'editOwnProfile',
  VIEW_MESSAGES: 'viewMessages',
  SEND_MESSAGES: 'sendMessages',

  // 宠物主人权限
  BOOK_SERVICES: 'bookServices',
  VIEW_HOST_PROFILES: 'viewHostProfiles',
  CREATE_PET_PROFILES: 'createPetProfiles',
  VIEW_PET_PROFILES: 'viewPetProfiles',
  EDIT_PET_PROFILES: 'editPetProfiles',

  // 寄养家庭权限
  MANAGE_HOST_PROFILE: 'manageHostProfile',
  ACCEPT_BOOKINGS: 'acceptBookings',
  VIEW_BOOKINGS: 'viewBookings',
  MANAGE_BOOKINGS: 'manageBookings'
}

// 访问日志记录
class AccessLogger {
  constructor() {
    this.logs = []
    this.maxLogSize = 500 // 最多保留500条日志
  }

  /**
   * 记录访问日志
   * @param {string} operation - 操作类型
   * @param {object} details - 详细信息
   */
  log(operation, details = {}) {
    const logEntry = {
      timestamp: Date.now(),
      operation,
      role: this.getCurrentRole(),
      page: this.getCurrentPage(),
      ...details
    }

    this.logs.push(logEntry)

    // 限制日志大小
    if (this.logs.length > this.maxLogSize) {
      this.logs = this.logs.slice(-this.maxLogSize)
    }

    // 输出日志（生产环境可以关闭）
    console.log(`[IdentityAccess] ${operation}`, {
      role: logEntry.role,
      page: logEntry.page,
      ...details
    })
  }

  /**
   * 获取当前页面
   * @private
   * @returns {string} 当前页面路径
   */
  getCurrentPage() {
    try {
      const pages = getCurrentPages()
      if (pages && pages.length > 0) {
        return pages[pages.length - 1].route
      }
    } catch (error) {
      console.warn('[AccessLogger] 获取当前页面失败:', error)
    }
    return 'unknown'
  }

  /**
   * 获取当前角色
   * @private
   * @returns {string} 当前角色
   */
  getCurrentRole() {
    try {
      return app.globalData.centralIdentityManager?.getCurrentRole() || 'unknown'
    } catch (error) {
      return 'unknown'
    }
  }

  /**
   * 获取访问日志
   * @param {object} filters - 过滤条件
   * @returns {array} 过滤后的日志
   */
  getLogs(filters = {}) {
    let filteredLogs = [...this.logs]

    // 按时间范围过滤
    if (filters.startTime) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.startTime)
    }
    if (filters.endTime) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= filters.endTime)
    }

    // 按操作类型过滤
    if (filters.operation) {
      filteredLogs = filteredLogs.filter(log => log.operation === filters.operation)
    }

    // 按角色过滤
    if (filters.role) {
      filteredLogs = filteredLogs.filter(log => log.role === filters.role)
    }

    // 按页面过滤
    if (filters.page) {
      filteredLogs = filteredLogs.filter(log => log.page === filters.page)
    }

    return filteredLogs
  }

  /**
   * 清除日志
   */
  clearLogs() {
    this.logs = []
    console.log('[AccessLogger] 日志已清除')
  }
}

// 权限管理器
class PermissionManager {
  /**
   * 获取角色的默认权限
   * @param {string} role - 角色类型
   * @returns {object} 权限对象
   */
  getDefaultPermissions(role) {
    const basePermissions = {
      [PERMISSIONS.VIEW_OWN_PROFILE]: true,
      [PERMISSIONS.EDIT_OWN_PROFILE]: true,
      [PERMISSIONS.VIEW_MESSAGES]: true,
      [PERMISSIONS.SEND_MESSAGES]: true
    }

    if (role === ROLE_TYPES.OWNER) {
      return {
        ...basePermissions,
        [PERMISSIONS.BOOK_SERVICES]: true,
        [PERMISSIONS.VIEW_HOST_PROFILES]: true,
        [PERMISSIONS.CREATE_PET_PROFILES]: true,
        [PERMISSIONS.VIEW_PET_PROFILES]: true,
        [PERMISSIONS.EDIT_PET_PROFILES]: true
      }
    } else if (role === ROLE_TYPES.HOST) {
      return {
        ...basePermissions,
        [PERMISSIONS.MANAGE_HOST_PROFILE]: true,
        [PERMISSIONS.ACCEPT_BOOKINGS]: true,
        [PERMISSIONS.VIEW_BOOKINGS]: true,
        [PERMISSIONS.MANAGE_BOOKINGS]: true
      }
    }

    return basePermissions
  }

  /**
   * 检查权限
   * @param {string} permission - 权限名称
   * @param {string} role - 角色类型（可选，默认为当前角色）
   * @returns {boolean} 是否有权限
   */
  hasPermission(permission, role = null) {
    const targetRole = role || app.globalData.centralIdentityManager?.getCurrentRole()

    if (!targetRole) {
      console.warn('[PermissionManager] 检查权限失败：未设置当前角色')
      return false
    }

    const permissions = this.getDefaultPermissions(targetRole)
    const hasPermission = permissions[permission] || false

    // 记录权限检查日志
    app.globalData.centralIdentityManager?.accessLogger?.log('checkPermission', {
      permission,
      hasPermission,
      role: targetRole
    })

    return hasPermission
  }

  /**
   * 批量检查权限
   * @param {array} permissionList - 权限列表
   * @param {string} role - 角色类型（可选）
   * @returns {object} 权限检查结果
   */
  checkPermissions(permissionList, role = null) {
    const results = {}
    permissionList.forEach(permission => {
      results[permission] = this.hasPermission(permission, role)
    })

    return results
  }
}

// 集中式身份管理器
class CentralIdentityManager {
  constructor() {
    this.accessLogger = new AccessLogger()
    this.permissionManager = new PermissionManager()
    this.eventListeners = {}
    this.isInitialized = false

    // 身份数据存储
    this.identityStore = {
      currentRole: null,
      defaultRole: ROLE_TYPES.OWNER,
      isLoggedIn: false,
      identities: {
        [ROLE_TYPES.OWNER]: null,
        [ROLE_TYPES.HOST]: null,
        [ROLE_TYPES.GUEST]: null
      },
      commonData: {
        openid: null,
        userId: null,
        token: null,
        loginTime: null,
        expiryTime: null
      }
    }
  }

  /**
   * 初始化身份管理器
   * @param {object} options - 初始化选项
   */
  init(options = {}) {
    if (this.isInitialized) {
      console.warn('[CentralIdentityManager] 已初始化，跳过重复初始化')
      return
    }

    console.log('[CentralIdentityManager] 初始化集中式身份管理器')

    // 从本地存储恢复数据（仅用于初始化，后续禁止直接访问）
    this._loadFromStorage()

    // 标记为已初始化
    this.isInitialized = true

    // 启动定期同步
    if (options.enableAutoSync !== false) {
      this._startAutoSync()
    }

    this.accessLogger.log('init', { timestamp: Date.now() })

    console.log('[CentralIdentityManager] 初始化完成')
  }

  /**
   * 从本地存储加载数据
   * @private
   */
  _loadFromStorage() {
    try {
      const storedRole = wx.getStorageSync('central:userRole')
      const storedIdentities = wx.getStorageSync('central:identities')
      const storedCommonData = wx.getStorageSync('central:commonData')

      if (storedRole) {
        this.identityStore.currentRole = storedRole
      }

      if (storedIdentities) {
        this.identityStore.identities = {
          ...this.identityStore.identities,
          ...storedIdentities
        }
      }

      if (storedCommonData) {
        this.identityStore.commonData = {
          ...this.identityStore.commonData,
          ...storedCommonData
        }
      }

      // 更新登录状态
      this.identityStore.isLoggedIn = !!this.identityStore.currentRole &&
        !!this.identityStore.identities[this.identityStore.currentRole]

      this.accessLogger.log('loadFromStorage', {
        currentRole: this.identityStore.currentRole,
        isLoggedIn: this.identityStore.isLoggedIn
      })

      console.log('[CentralIdentityManager] 从本地存储恢复数据')
    } catch (error) {
      console.error('[CentralIdentityManager] 从本地存储加载数据失败:', error)
    }
  }

  /**
   * 保存到本地存储
   * @private
   */
  _saveToStorage() {
    try {
      wx.setStorageSync('central:userRole', this.identityStore.currentRole)
      wx.setStorageSync('central:identities', this.identityStore.identities)
      wx.setStorageSync('central:commonData', this.identityStore.commonData)

      this.accessLogger.log('saveToStorage', {
        currentRole: this.identityStore.currentRole,
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('[CentralIdentityManager] 保存到本地存储失败:', error)
    }
  }

  /**
   * 启动自动同步
   * @private
   */
  _startAutoSync() {
    setInterval(() => {
      this._saveToStorage()
    }, 30000) // 每30秒同步一次
  }

  /**
   * 获取当前角色
   * @returns {string|null} 当前角色
   */
  getCurrentRole() {
    return this.identityStore.currentRole
  }

  /**
   * 获取当前身份信息
   * @returns {object} 当前身份信息
   */
  getCurrentIdentity() {
    const currentRole = this.identityStore.currentRole

    if (!currentRole) {
      this.accessLogger.log('getCurrentIdentity', {
        success: false,
        reason: 'noCurrentRole'
      })

      return null
    }

    const identity = this.identityStore.identities[currentRole]

    this.accessLogger.log('getCurrentIdentity', {
      role: currentRole,
      hasIdentity: !!identity
    })

    return {
      role: currentRole,
      ...identity,
      commonData: this.identityStore.commonData
    }
  }

  /**
   * 获取指定角色的身份信息
   * @param {string} role - 角色类型
   * @returns {object|null} 身份信息
   */
  getIdentity(role) {
    if (!Object.values(ROLE_TYPES).includes(role)) {
      console.error('[CentralIdentityManager] 无效的角色类型:', role)
      return null
    }

    const identity = this.identityStore.identities[role]

    this.accessLogger.log('getIdentity', {
      role,
      hasIdentity: !!identity
    })

    return identity
  }

  /**
   * 获取所有身份信息
   * @returns {object} 所有身份信息
   */
  getAllIdentities() {
    this.accessLogger.log('getAllIdentities')

    return {
      ...this.identityStore.identities,
      currentRole: this.identityStore.currentRole,
      isLoggedIn: this.identityStore.isLoggedIn
    }
  }

  /**
   * 设置身份信息
   * @param {string} role - 角色类型
   * @param {object} identity - 身份信息
   * @returns {boolean} 是否设置成功
   */
  setIdentity(role, identity) {
    if (!Object.values(ROLE_TYPES).includes(role)) {
      console.error('[CentralIdentityManager] 无效的角色类型:', role)
      return false
    }

    // 验证必需字段
    if (!identity || !identity._id || !identity.openid) {
      console.error('[CentralIdentityManager] 身份信息缺少必需字段:', identity)
      return false
    }

    // 保存身份信息
    this.identityStore.identities[role] = {
      ...identity,
      role,
      updatedAt: Date.now()
    }

    // 更新公共数据
    if (identity.openid) {
      this.identityStore.commonData.openid = identity.openid
    }
    if (identity._id) {
      this.identityStore.commonData.userId = identity._id
    }
    if (identity.token) {
      this.identityStore.commonData.token = identity.token
    }
    if (identity.expiryTime) {
      this.identityStore.commonData.expiryTime = identity.expiryTime
    }

    // 如果没有当前角色，设置为当前角色
    if (!this.identityStore.currentRole) {
      this.identityStore.currentRole = role
      this.identityStore.isLoggedIn = true
    }

    // 保存到本地存储
    this._saveToStorage()

    // 触发事件
    this._emitEvent(IDENTITY_EVENTS.IDENTITY_UPDATED, {
      role,
      identity,
      timestamp: Date.now()
    })

    this.accessLogger.log('setIdentity', {
      role,
      userId: identity._id,
      timestamp: Date.now()
    })

    console.log('[CentralIdentityManager] 设置身份信息成功:', role)

    return true
  }

  /**
   * 切换当前角色
   * @param {string} role - 目标角色
   * @returns {boolean} 是否切换成功
   */
  switchRole(role) {
    if (!Object.values(ROLE_TYPES).includes(role)) {
      console.error('[CentralIdentityManager] 无效的角色类型:', role)
      return false
    }

    if (!this.identityStore.identities[role]) {
      console.error('[CentralIdentityManager] 目标角色不存在:', role)
      return false
    }

    const previousRole = this.identityStore.currentRole

    // 切换角色
    this.identityStore.currentRole = role

    // 保存到本地存储
    this._saveToStorage()

    // 触发事件
    this._emitEvent(IDENTITY_EVENTS.ROLE_CHANGED, {
      previousRole,
      currentRole: role,
      timestamp: Date.now()
    })

    this._emitEvent(IDENTITY_EVENTS.IDENTITY_UPDATED, {
      role,
      identity: this.identityStore.identities[role],
      timestamp: Date.now()
    })

    this.accessLogger.log('switchRole', {
      previousRole,
      currentRole: role
    })

    console.log('[CentralIdentityManager] 角色切换成功:', previousRole, '->', role)

    return true
  }

  /**
   * 检查是否登录
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    const isLoggedIn = this.identityStore.isLoggedIn &&
      !!this.identityStore.currentRole &&
      !!this.identityStore.identities[this.identityStore.currentRole]

    this.accessLogger.log('isLoggedIn', { isLoggedIn })

    return isLoggedIn
  }

  /**
   * 检查登录状态是否过期
   * @returns {boolean} 是否过期
   */
  isLoginExpired() {
    if (!this.identityStore.commonData.expiryTime) {
      return false // 没有设置过期时间，默认不过期
    }

    const isExpired = this.identityStore.commonData.expiryTime < Date.now()

    this.accessLogger.log('isLoginExpired', {
      expiryTime: this.identityStore.commonData.expiryTime,
      currentTime: Date.now(),
      isExpired
    })

    return isExpired
  }

  /**
   * 登录
   * @param {object} loginData - 登录数据
   * @returns {boolean} 是否登录成功
   */
  login(loginData) {
    const { role, userInfo, token, expiryTime } = loginData

    if (!role || !userInfo) {
      console.error('[CentralIdentityManager] 登录数据不完整:', loginData)
      return false
    }

    if (!Object.values(ROLE_TYPES).includes(role)) {
      console.error('[CentralIdentityManager] 无效的角色类型:', role)
      return false
    }

    // 设置身份信息
    this.identityStore.identities[role] = {
      ...userInfo,
      role,
      updatedAt: Date.now()
    }

    // 更新公共数据
    this.identityStore.commonData.openid = userInfo.openid
    this.identityStore.commonData.userId = userInfo._id
    this.identityStore.commonData.token = token || userInfo.token
    this.identityStore.commonData.expiryTime = expiryTime || userInfo.expiryTime
    this.identityStore.commonData.loginTime = Date.now()

    // 设置当前角色
    this.identityStore.currentRole = role
    this.identityStore.isLoggedIn = true

    // 保存到本地存储
    this._saveToStorage()

    // 触发事件
    this._emitEvent(IDENTITY_EVENTS.LOGIN_STATE_CHANGED, {
      isLoggedIn: true,
      role,
      timestamp: Date.now()
    })

    this._emitEvent(IDENTITY_EVENTS.IDENTITY_UPDATED, {
      role,
      identity: this.identityStore.identities[role],
      timestamp: Date.now()
    })

    this.accessLogger.log('login', {
      role,
      userId: userInfo._id,
      openid: userInfo.openid
    })

    console.log('[CentralIdentityManager] 登录成功:', role)

    return true
  }

  /**
   * 退出登录
   * @returns {boolean} 是否退出成功
   */
  logout() {
    const previousRole = this.identityStore.currentRole

    // 清除登录状态
    this.identityStore.isLoggedIn = false
    this.identityStore.currentRole = null

    // 清除公共数据
    this.identityStore.commonData = {
      openid: null,
      userId: null,
      token: null,
      loginTime: null,
      expiryTime: null
    }

    // 清除本地存储
    try {
      wx.removeStorageSync('central:userRole')
      wx.removeStorageSync('central:identities')
      wx.removeStorageSync('central:commonData')
    } catch (error) {
      console.error('[CentralIdentityManager] 清除本地存储失败:', error)
    }

    // 触发事件
    this._emitEvent(IDENTITY_EVENTS.LOGIN_STATE_CHANGED, {
      isLoggedIn: false,
      previousRole,
      timestamp: Date.now()
    })

    this.accessLogger.log('logout', { previousRole })

    console.log('[CentralIdentityManager] 退出登录成功')

    return true
  }

  /**
   * 检查权限
   * @param {string} permission - 权限名称
   * @returns {boolean} 是否有权限
   */
  hasPermission(permission) {
    return this.permissionManager.hasPermission(permission)
  }

  /**
   * 批量检查权限
   * @param {array} permissionList - 权限列表
   * @returns {object} 权限检查结果
   */
  checkPermissions(permissionList) {
    return this.permissionManager.checkPermissions(permissionList)
  }

  /**
   * 注册事件监听器
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = []
    }

    this.eventListeners[eventName].push(callback)

    this.accessLogger.log('addEventListener', {
      eventName,
      listenerCount: this.eventListeners[eventName].length
    })

    console.log('[CentralIdentityManager] 注册事件监听器:', eventName)
  }

  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  off(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      return
    }

    this.eventListeners[eventName] = this.eventListeners[eventName].filter(cb => cb !== callback)

    this.accessLogger.log('removeEventListener', {
      eventName,
      listenerCount: this.eventListeners[eventName].length
    })

    console.log('[CentralIdentityManager] 移除事件监听器:', eventName)
  }

  /**
   * 触发事件
   * @private
   * @param {string} eventName - 事件名称
   * @param {object} data - 事件数据
   */
  _emitEvent(eventName, data) {
    if (!this.eventListeners[eventName]) {
      return
    }

    this.eventListeners[eventName].forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error('[CentralIdentityManager] 事件回调执行失败:', error)
      }
    })

    console.log('[CentralIdentityManager] 触发事件:', eventName, data)
  }

  /**
   * 获取访问日志
   * @param {object} filters - 过滤条件
   * @returns {array} 访问日志
   */
  getAccessLogs(filters = {}) {
    return this.accessLogger.getLogs(filters)
  }

  /**
   * 清除访问日志
   */
  clearAccessLogs() {
    this.accessLogger.clearLogs()
  }

  /**
   * 导出身份数据
   * @returns {object} 身份数据
   */
  exportData() {
    this.accessLogger.log('exportData')

    return {
      ...this.identityStore,
      exportedAt: Date.now()
    }
  }

  /**
   * 导入身份数据
   * @param {object} data - 身份数据
   * @returns {boolean} 是否导入成功
   */
  importData(data) {
    if (!data || typeof data !== 'object') {
      console.error('[CentralIdentityManager] 导入数据无效')
      return false
    }

    this.identityStore = {
      ...this.identityStore,
      ...data
    }

    // 保存到本地存储
    this._saveToStorage()

    // 触发事件
    this._emitEvent(IDENTITY_EVENTS.IDENTITY_UPDATED, {
      role: this.identityStore.currentRole,
      identity: this.identityStore.identities[this.identityStore.currentRole],
      timestamp: Date.now()
    })

    this.accessLogger.log('importData', {
      currentRole: this.identityStore.currentRole,
      timestamp: Date.now()
    })

    console.log('[CentralIdentityManager] 导入数据成功')

    return true
  }
}

// 创建单例实例
const centralIdentityManager = new CentralIdentityManager()

module.exports = {
  CentralIdentityManager,
  centralIdentityManager,
  ROLE_TYPES,
  PERMISSIONS,
  IDENTITY_EVENTS
}
