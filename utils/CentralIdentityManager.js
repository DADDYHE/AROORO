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

// 导入统一ID生成模块
const { generateIMUserId } = require('./idGenerator')

// 导入权限管理器
const { permissionManager } = require('./permissionManager')

let app
try {
  app = getApp()
} catch (error) {
  app = global.app || { globalData: {} }
}

// 统一事件系统
const AUTH_EVENTS = {
  // 登录相关事件
  LOGIN_SUCCESS: 'auth:loginSuccess',
  LOGIN_FAILURE: 'auth:loginFailure',
  LOGOUT_SUCCESS: 'auth:logoutSuccess',
  LOGOUT_FAILURE: 'auth:logoutFailure',
  LOGIN_STATE_CHANGED: 'auth:loginStateChanged',
  
  // 身份相关事件
  ROLE_CHANGED: 'auth:roleChanged',
  IDENTITY_UPDATED: 'auth:identityUpdated',
  USER_INFO_UPDATED: 'auth:userInfoUpdated',
  
  // 权限相关事件
  PERMISSION_UPDATED: 'auth:permissionUpdated',
  
  // 连接状态相关事件
  CONNECTION_STATUS_CHANGED: 'auth:connectionStatusChanged',
  
  // 状态变更事件
  STATE_CHANGED: 'auth:stateChanged'
}

// 兼容旧的事件名称
const IDENTITY_EVENTS = AUTH_EVENTS

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

// 使用外部权限管理器
const PermissionManager = require('./permissionManager').PermissionManager

// 集中式身份管理器
class CentralIdentityManager {
  constructor() {
    this.accessLogger = new AccessLogger()
    this.permissionManager = permissionManager
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

    // 身份上下文存储（用于IM相关功能）
    this.contextStore = {
      contexts: {}, // 存储所有身份的上下文
      currentRoleType: null, // 当前身份类型
      defaultRoleType: null // 默认身份类型
    }
  }

  /**
   * 设置角色列表
   * @param {Array} roles - 角色列表
   */
  setRoles(roles) {
    roles = roles || []
    
    // 清空现有的身份
    this.identityStore.identities = {
      [ROLE_TYPES.OWNER]: null,
      [ROLE_TYPES.HOST]: null,
      [ROLE_TYPES.GUEST]: null
    }
    
    // 逐个添加角色
    roles.forEach(role => {
      if (role.roleType && role.profile) {
        this.setIdentity(role.roleType, role.profile)
      }
    })
    
    this.accessLogger.log('setRoles', { roleCount: roles.length })
  }

  /**
   * 获取角色列表
   * @returns {Array} 角色列表
   */
  getRoles() {
    const roles = []
    Object.keys(this.identityStore.identities).forEach(roleType => {
      const identity = this.identityStore.identities[roleType]
      if (identity) {
        roles.push({
          roleType,
          profile: identity,
          isActive: roleType === this.identityStore.currentRole
        })
      }
    })
    
    this.accessLogger.log('getRoles', { roleCount: roles.length })
    return roles
  }

  /**
   * 获取角色数量
   * @returns {number} 角色数量
   */
  getRoleCount() {
    const roles = this.getRoles()
    return roles.length
  }

  /**
   * 获取指定类型的角色
   * @param {string} roleType - 角色类型
   * @returns {Object|null} 角色信息
   */
  getRoleByType(roleType) {
    const identity = this.getIdentity(roleType)
    if (!identity) {
      return null
    }
    
    return {
      roleType,
      profile: identity,
      isActive: roleType === this.identityStore.currentRole
    }
  }

  /**
   * 检查是否有指定类型的角色
   * @param {string} roleType - 角色类型
   * @returns {boolean} 是否有指定类型的角色
   */
  hasRole(roleType) {
    return this.getIdentity(roleType) !== null
  }

  /**
   * 获取当前活跃角色
   * @returns {Object|null} 当前活跃角色
   */
  getActiveRole() {
    const currentRole = this.identityStore.currentRole
    if (!currentRole) {
      return null
    }
    
    return this.getRoleByType(currentRole)
  }

  /**
   * 获取当前活跃角色类型
   * @returns {string} 当前活跃角色类型
   */
  getActiveRoleType() {
    return this.getCurrentRole()
  }

  /**
   * 创建角色
   * @param {string} roleType - 角色类型
   * @param {Object} roleInfo - 角色信息
   * @returns {Promise<boolean>} 是否创建成功
   */
  async createRole(roleType, roleInfo) {
    try {
      console.log('创建角色:', roleType, roleInfo)
      
      // 检查角色类型是否有效
      if (!Object.values(ROLE_TYPES).includes(roleType)) {
        console.error('创建角色失败: 无效的角色类型')
        return false
      }
      
      // 检查角色是否已存在
      if (this.hasRole(roleType)) {
        console.error('创建角色失败: 角色已存在')
        return false
      }
      
      // 调用云函数创建角色
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: {
          createRole: true,
          roleType,
          roleInfo
        }
      })
      
      if (result.result.code === 0) {
        // 更新角色列表
        this.setRoles(result.result.data.roles || [])
        
        // 设置为当前角色
        this.switchRole(roleType)
        
        console.log('角色创建成功:', roleType)
        return true
      } else {
        console.error('创建角色失败:', result.result.message)
        return false
      }
    } catch (error) {
      console.error('创建角色失败:', error)
      return false
    }
  }

  /**
   * 删除角色
   * @param {string} roleType - 角色类型
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteRole(roleType) {
    try {
      console.log('删除角色:', roleType)
      
      // 检查角色是否存在
      if (!this.hasRole(roleType)) {
        console.error('删除角色失败: 角色不存在')
        return false
      }
      
      // 检查是否是最后一个角色
      if (this.getRoleCount() === 1) {
        console.error('删除角色失败: 不能删除最后一个角色')
        return false
      }
      
      // 调用云函数删除角色
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: {
          deleteRole: true,
          roleType
        }
      })
      
      if (result.result.code === 0) {
        // 更新角色列表
        this.setRoles(result.result.data.roles || [])
        console.log('角色删除成功:', roleType)
        return true
      } else {
        console.error('删除角色失败:', result.result.message)
        return false
      }
    } catch (error) {
      console.error('删除角色失败:', error)
      return false
    }
  }

  /**
   * 更新角色信息
   * @param {string} roleType - 角色类型
   * @param {Object} roleInfo - 角色信息
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateRole(roleType, roleInfo) {
    try {
      console.log('更新角色:', roleType, roleInfo)
      
      // 检查角色是否存在
      if (!this.hasRole(roleType)) {
        console.error('更新角色失败: 角色不存在')
        return false
      }
      
      // 调用云函数更新角色
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: {
          updateRole: true,
          roleType,
          roleInfo
        }
      })
      
      if (result.result.code === 0) {
        // 更新角色列表
        this.setRoles(result.result.data.roles || [])
        console.log('角色更新成功:', roleType)
        return true
      } else {
        console.error('更新角色失败:', result.result.message)
        return false
      }
    } catch (error) {
      console.error('更新角色失败:', error)
      return false
    }
  }

  /**
   * 检查是否需要显示身份选择表单
   * @returns {boolean} 是否需要显示身份选择表单
   */
  needShowIdentitySelection() {
    return this.getRoleCount() > 1
  }

  /**
   * 添加身份上下文
   * @param {string} roleType - 身份类型 ('owner' 或 'host')
   * @param {object} context - 身份上下文
   */
  addContext(roleType, context) {
    if (!roleType || !context) {
      console.error('添加身份上下文失败：参数无效')
      return false
    }

    // 验证身份类型
    if (!Object.values(ROLE_TYPES).includes(roleType)) {
      console.error('添加身份上下文失败：无效的身份类型')
      return false
    }

    // 构建完整的IM用户信息，使用角色+openid的格式
    const openid = (context.profile && context.profile.openid) || context.openid || ''
    let imUserID = (context.imUserInfo && context.imUserInfo.userID) || ''
    
    if (!imUserID && openid) {
      imUserID = generateIMUserId(roleType, openid)
    }

    // 构建默认权限
    const defaultPermissions = this.permissionManager.getRolePermissions(roleType) || {}

    // 构建完整的身份上下文
    const fullContext = {
      roleType,
      roleId: context.roleId || `role_${Date.now()}`,
      profile: context.profile || {},
      openid: openid,
      imUserInfo: {
        userID: imUserID,
        userSig: (context.imUserInfo && context.imUserInfo.userSig) || '',
        isLoggedIn: (context.imUserInfo && context.imUserInfo.isLoggedIn) || false,
        lastLoginTime: null,
        loginCount: 0,
        lastError: null,
        connectionStatus: 'disconnected', // connected, disconnected, connecting, reconnecting
        userSigExpiry: null, // UserSig过期时间
      },
      permissions: {
        ...defaultPermissions,
        ...(context.permissions || {}),
      },
      storageInfo: {
        prefix: (context.storageInfo && context.storageInfo.prefix) || `${roleType}_`,
        keys: (context.storageInfo && context.storageInfo.keys) || {},
      },
      metadata: context.metadata || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // 存储身份上下文
    this.contextStore.contexts[roleType] = fullContext

    // 如果是第一个添加的身份，设置为默认身份
    if (!this.contextStore.defaultRoleType) {
      this.contextStore.defaultRoleType = roleType
    }

    return true
  }

  /**
   * 批量添加身份上下文
   * @param {array} contexts - 身份上下文数组
   */
  addContexts(contexts) {
    if (!Array.isArray(contexts)) {
      console.error('批量添加身份上下文失败：参数无效')
      return false
    }

    let successCount = 0
    contexts.forEach(context => {
      if (context.roleType) {
        if (this.addContext(context.roleType, context)) {
          successCount++
        }
      }
    })

    return successCount > 0
  }

  /**
   * 获取当前身份上下文
   * @returns {object|null} 当前身份上下文
   */
  getCurrentContext() {
    const currentRoleType = this.contextStore.currentRoleType || this.identityStore.currentRole
    if (!currentRoleType) {
      console.warn('获取当前身份上下文失败：未设置当前身份')
      return null
    }

    const context = this.getContext(currentRoleType)
    if (!context) {
      console.error(`获取当前身份上下文失败：身份 ${currentRoleType} 不存在`)
      return null
    }

    return context
  }

  /**
   * 获取特定身份上下文
   * @param {string} roleType - 身份类型
   * @returns {object|null} 身份上下文
   */
  getContext(roleType) {
    if (!roleType) {
      console.error('获取身份上下文失败：参数无效')
      return null
    }

    const context = this.contextStore.contexts[roleType]
    if (!context) {
      console.log(`获取身份上下文：身份 ${roleType} 不存在，创建默认身份上下文`)
      // 使用默认值创建身份上下文
      this.addContext(roleType, {
        profile: {
          openid: '',
          userId: `temp_${roleType}_${Date.now()}`
        }
      })
      // 返回新创建的身份上下文
      return this.contextStore.contexts[roleType]
    }

    return context
  }

  /**
   * 获取所有身份上下文
   * @returns {object} 所有身份上下文
   */
  getAllContexts() {
    return this.contextStore.contexts
  }

  /**
   * 更新身份的连接状态
   * @param {string} roleType - 身份类型
   * @param {string} status - 连接状态：connected, disconnected, connecting, reconnecting
   * @returns {boolean} 更新结果
   */
  updateConnectionStatus(roleType, status) {
    if (!roleType) {
      console.error('更新连接状态失败：参数无效')
      return false
    }

    const validStatuses = ['connected', 'disconnected', 'connecting', 'reconnecting']
    if (!validStatuses.includes(status)) {
      console.error(`更新连接状态失败：无效的状态 ${status}`)
      return false
    }

    // 如果身份不存在，创建一个默认的身份上下文
    if (!this.contextStore.contexts[roleType]) {
      console.warn(`更新连接状态：身份 ${roleType} 不存在，创建默认身份上下文`)
      // 使用默认值创建身份上下文
      this.addContext(roleType, {
        profile: {
          openid: '',
          userId: `temp_${roleType}_${Date.now()}`
        }
      })
    }

    const context = this.contextStore.contexts[roleType]
    const previousStatus = context.imUserInfo.connectionStatus
    context.imUserInfo.connectionStatus = status
    context.updatedAt = Date.now()

    // 触发连接状态变更事件
    this._emitEvent(AUTH_EVENTS.CONNECTION_STATUS_CHANGED, {
      roleType,
      previousStatus,
      currentStatus: status,
      timestamp: Date.now()
    })

    // 触发统一的状态变更事件
    this._emitEvent(AUTH_EVENTS.STATE_CHANGED, {
      type: 'connectionStatusChanged',
      data: {
        roleType,
        previousStatus,
        currentStatus: status
      },
      timestamp: Date.now()
    })

    return true
  }

  /**
   * 设置身份的登录状态
   * @param {string} roleType - 身份类型
   * @param {boolean} isLoggedIn - 是否登录成功
   * @param {string} userSig - UserSig
   * @param {number} expiry - UserSig过期时间（毫秒）
   * @returns {boolean} 设置结果
   */
  setLoginStatus(roleType, isLoggedIn, userSig = null, expiry = null) {
    if (!roleType) {
      console.error('设置登录状态失败：参数无效')
      return false
    }

    // 如果身份不存在，创建一个默认的身份上下文
    if (!this.contextStore.contexts[roleType]) {
      console.warn(`设置登录状态：身份 ${roleType} 不存在，创建默认身份上下文`)
      // 使用默认值创建身份上下文
      this.addContext(roleType, {
        profile: {
          openid: '',
          userId: `temp_${roleType}_${Date.now()}`
        }
      })
    }

    const context = this.contextStore.contexts[roleType]
    const imUserInfo = context.imUserInfo

    imUserInfo.isLoggedIn = isLoggedIn
    imUserInfo.lastLoginTime = isLoggedIn ? Date.now() : null
    imUserInfo.loginCount = isLoggedIn ? imUserInfo.loginCount + 1 : imUserInfo.loginCount

    if (userSig) {
      imUserInfo.userSig = userSig
    }

    if (expiry) {
      imUserInfo.userSigExpiry = expiry
    }

    imUserInfo.lastError = isLoggedIn ? null : imUserInfo.lastError
    context.updatedAt = Date.now()

    return true
  }

  /**
   * 检查UserSig是否过期
   * @param {string} roleType - 身份类型
   * @returns {boolean} 是否过期
   */
  isUserSigExpired(roleType) {
    try {
      const context = this.getContext(roleType)
      if (!context) {
        return true
      }

      const { userSigExpiry } = context.imUserInfo
      if (!userSigExpiry) {
        // 没有设置过期时间，默认不过期
        return false
      }

      // 检查是否已过期（使用当前时间对比）
      const isExpired = userSigExpiry < Date.now()
      
      if (isExpired) {
        console.warn(`[IdentityContext] 身份 ${roleType} 的UserSig已过期，过期时间：${new Date(userSigExpiry).toLocaleString('zh-CN')}`)
      }

      return isExpired
    } catch (error) {
      console.error('[IdentityContext] 检查UserSig过期状态失败:', error)
      return true // 出错时默认认为已过期
    }
  }

  /**
   * 获取身份的IM凭证
   * @param {string} roleType - 身份类型
   * @returns {object|null} IM凭证：{ userID, userSig }
   */
  getIMCredentials(roleType) {
    const context = this.getContext(roleType)
    if (!context) {
      return null
    }

    const { userID, userSig } = context.imUserInfo
    if (!userID) {
      console.error(`获取IM凭证失败：身份 ${roleType} 的IM用户ID不完整`)
      return null
    }

    // 检查UserSig是否过期
    if (this.isUserSigExpired(roleType)) {
      console.warn(`身份 ${roleType} 的UserSig已过期或即将过期`)
    }

    return { userID, userSig }
  }

  /**
   * 切换身份上下文
   * @param {string} roleType - 目标身份类型
   * @param {object} [options] - 切换选项
   * @returns {boolean} 是否切换成功
   */
  switchContext(roleType, options = {}) {
    if (!roleType) {
      console.error('切换身份失败：参数无效')
      return false
    }

    if (!this.contextStore.contexts[roleType]) {
      console.error(`切换身份失败：身份 ${roleType} 不存在`)
      return false
    }

    // 验证回调（如果提供）
    if (options.verifyCallback && typeof options.verifyCallback === 'function') {
      const verifyResult = options.verifyCallback(roleType)
      if (!verifyResult) {
        console.error('切换身份失败：验证回调返回false')
        return false
      }
    }

    // 切换身份
    const previousRoleType = this.contextStore.currentRoleType
    this.contextStore.currentRoleType = roleType

    // 更新上下文的最后使用时间
    this.contextStore.contexts[roleType].updatedAt = Date.now()

    // 同时切换当前角色
    this.switchRole(roleType)

    return true
  }

  /**
   * 切换到默认身份
   * @returns {boolean} 是否切换成功
   */
  switchToDefaultContext() {
    if (!this.contextStore.defaultRoleType) {
      console.error('切换到默认身份失败：未设置默认身份')
      return false
    }

    return this.switchContext(this.contextStore.defaultRoleType)
  }

  /**
   * 设置默认身份
   * @param {string} roleType - 身份类型
   * @returns {boolean} 是否设置成功
   */
  setDefaultContext(roleType) {
    if (!roleType || !this.contextStore.contexts[roleType]) {
      console.error(`设置默认身份失败：身份 ${roleType} 不存在`)
      return false
    }

    this.contextStore.defaultRoleType = roleType
    return true
  }

  /**
   * 更新身份上下文
   * @param {string} roleType - 身份类型
   * @param {object} updates - 更新内容
   * @returns {boolean} 是否更新成功
   */
  updateContext(roleType, updates) {
    if (!roleType || !updates) {
      console.error('更新身份上下文失败：参数无效')
      return false
    }

    const context = this.contextStore.contexts[roleType]
    if (!context) {
      console.error(`更新身份上下文失败：身份 ${roleType} 不存在`)
      return false
    }

    // 递归更新上下文
    this._deepUpdate(context, updates)
    context.updatedAt = Date.now()

    return true
  }

  /**
   * 更新当前身份上下文
   * @param {object} updates - 更新内容
   * @returns {boolean} 是否更新成功
   */
  updateCurrentContext(updates) {
    const currentRoleType = this.contextStore.currentRoleType || this.identityStore.currentRole
    if (!currentRoleType) {
      console.error('更新当前身份上下文失败：未设置当前身份')
      return false
    }

    return this.updateContext(currentRoleType, updates)
  }

  /**
   * 更新身份的IM用户信息
   * @param {string} roleType - 身份类型
   * @param {object} imUserInfo - IM用户信息
   * @returns {boolean} 是否更新成功
   */
  updateIMUserInfo(roleType, imUserInfo) {
    if (!roleType || !imUserInfo) {
      console.error('更新IM用户信息失败：参数无效')
      return false
    }

    const context = this.contextStore.contexts[roleType]
    if (!context) {
      console.error(`更新IM用户信息失败：身份 ${roleType} 不存在`)
      return false
    }

    // 更新IM用户信息
    context.imUserInfo = {
      ...context.imUserInfo,
      ...imUserInfo,
      updatedAt: Date.now(),
    }

    // 如果是登录状态，记录登录时间
    if (imUserInfo.isLoggedIn) {
      context.imUserInfo.lastLoginTime = Date.now()
    }

    context.updatedAt = Date.now()
    return true
  }

  /**
   * 更新当前身份的IM用户信息
   * @param {object} imUserInfo - IM用户信息
   * @returns {boolean} 是否更新成功
   */
  updateCurrentIMUserInfo(imUserInfo) {
    const currentRoleType = this.contextStore.currentRoleType || this.identityStore.currentRole
    if (!currentRoleType) {
      console.error('更新当前身份IM用户信息失败：未设置当前身份')
      return false
    }

    return this.updateIMUserInfo(currentRoleType, imUserInfo)
  }

  /**
   * 清除身份上下文
   * @param {string} roleType - 身份类型
   * @returns {boolean} 是否清除成功
   */
  removeContext(roleType) {
    if (!roleType) {
      console.error('清除身份上下文失败：参数无效')
      return false
    }

    if (!this.contextStore.contexts[roleType]) {
      console.error(`清除身份上下文失败：身份 ${roleType} 不存在`)
      return false
    }

    // 删除身份上下文
    delete this.contextStore.contexts[roleType]

    // 如果删除的是当前身份，切换到默认身份
    if (this.contextStore.currentRoleType === roleType) {
      this.switchToDefaultContext()
    }

    // 如果删除的是默认身份，重新设置默认身份
    if (this.contextStore.defaultRoleType === roleType && Object.keys(this.contextStore.contexts).length > 0) {
      this.contextStore.defaultRoleType = Object.keys(this.contextStore.contexts)[0]
    }

    return true
  }

  /**
   * 清除所有身份上下文
   */
  clearAllContexts() {
    this.contextStore.contexts = {}
    this.contextStore.currentRoleType = null
    this.contextStore.defaultRoleType = null
  }

  /**
   * 检查身份是否存在
   * @param {string} roleType - 身份类型
   * @returns {boolean} 是否存在
   */
  hasContext(roleType) {
    return !!this.contextStore.contexts[roleType]
  }

  /**
   * 获取当前身份类型
   * @returns {string|null} 当前身份类型
   */
  getCurrentRoleType() {
    return this.contextStore.currentRoleType || this.identityStore.currentRole
  }

  /**
   * 设置当前身份类型
   * @param {string} roleType - 身份类型 ('owner' 或 'host')
   * @returns {boolean} 是否设置成功
   */
  setCurrentRoleType(roleType) {
    if (!roleType) {
      console.error('设置当前身份失败：参数无效')
      return false
    }

    // 验证身份类型
    if (!Object.values(ROLE_TYPES).includes(roleType)) {
      console.error('设置当前身份失败：无效的身份类型')
      return false
    }

    console.log(`CentralIdentityManager.setCurrentRoleType - 切换当前身份: ${this.contextStore.currentRoleType} -> ${roleType}`)

    this.contextStore.currentRoleType = roleType
    this.identityStore.currentRole = roleType

    return true
  }

  /**
   * 获取默认身份类型
   * @returns {string|null} 默认身份类型
   */
  getDefaultRoleType() {
    return this.contextStore.defaultRoleType || this.identityStore.defaultRole
  }

  /**
   * 获取身份数量
   * @returns {number} 身份数量
   */
  getContextCount() {
    return Object.keys(this.contextStore.contexts).length
  }

  /**
   * 导出身份上下文
   * @returns {object} 导出的身份上下文
   */
  exportContexts() {
    return JSON.parse(JSON.stringify(this.contextStore.contexts))
  }

  /**
   * 导入身份上下文
   * @param {object} contexts - 要导入的身份上下文
   * @returns {boolean} 是否导入成功
   */
  importContexts(contexts) {
    if (!contexts || typeof contexts !== 'object') {
      console.error('导入身份上下文失败：参数无效')
      return false
    }

    // 清除现有的身份上下文
    this.clearAllContexts()

    // 导入身份上下文
    let successCount = 0
    Object.keys(contexts).forEach(roleType => {
      if (this.addContext(roleType, contexts[roleType])) {
        successCount++
      }
    })

    return successCount > 0
  }

  /**
   * 深度更新对象
   * @private
   * @param {object} target - 目标对象
   * @param {object} source - 源对象
   */
  _deepUpdate(target, source) {
    if (!source || typeof source !== 'object') {
      return
    }

    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) {
          target[key] = {}
        }
        this._deepUpdate(target[key], source[key])
      } else {
        target[key] = source[key]
      }
    })
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
    this._emitEvent(AUTH_EVENTS.IDENTITY_UPDATED, {
      role,
      identity,
      timestamp: Date.now()
    })

    // 触发用户信息更新事件
    this._emitEvent(AUTH_EVENTS.USER_INFO_UPDATED, {
      userInfo: identity,
      timestamp: Date.now()
    })

    // 触发统一的状态变更事件
    this._emitEvent(AUTH_EVENTS.STATE_CHANGED, {
      type: 'identityUpdated',
      data: {
        role,
        identity
      },
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
    this._emitEvent(AUTH_EVENTS.ROLE_CHANGED, {
      previousRole,
      currentRole: role,
      timestamp: Date.now()
    })

    this._emitEvent(AUTH_EVENTS.IDENTITY_UPDATED, {
      role,
      identity: this.identityStore.identities[role],
      timestamp: Date.now()
    })

    // 触发统一的状态变更事件
    this._emitEvent(AUTH_EVENTS.STATE_CHANGED, {
      type: 'roleChanged',
      data: {
        previousRole,
        currentRole: role
      },
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
    this._emitEvent(AUTH_EVENTS.LOGIN_STATE_CHANGED, {
      isLoggedIn: true,
      role,
      timestamp: Date.now()
    })

    this._emitEvent(AUTH_EVENTS.IDENTITY_UPDATED, {
      role,
      identity: this.identityStore.identities[role],
      timestamp: Date.now()
    })

    // 触发统一的状态变更事件
    this._emitEvent(AUTH_EVENTS.STATE_CHANGED, {
      type: 'login',
      data: {
        isLoggedIn: true,
        role
      },
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
    this._emitEvent(AUTH_EVENTS.LOGIN_STATE_CHANGED, {
      isLoggedIn: false,
      previousRole,
      timestamp: Date.now()
    })

    // 触发统一的状态变更事件
    this._emitEvent(AUTH_EVENTS.STATE_CHANGED, {
      type: 'logout',
      data: {
        isLoggedIn: false,
        previousRole
      },
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

  /**
   * 批量更新身份信息
   * @param {object} identities - 身份信息对象，键为角色类型，值为身份信息
   * @returns {boolean} 是否更新成功
   */
  batchUpdateIdentities(identities) {
    if (!identities || typeof identities !== 'object') {
      console.error('[CentralIdentityManager] 批量更新身份信息失败：参数无效')
      return false
    }

    let success = true

    Object.keys(identities).forEach(roleType => {
      if (Object.values(ROLE_TYPES).includes(roleType)) {
        const identity = identities[roleType]
        if (identity && identity._id && identity.openid) {
          if (!this.setIdentity(roleType, identity)) {
            success = false
          }
        }
      }
    })

    return success
  }

  /**
   * 获取身份摘要信息
   * @returns {object} 身份摘要信息
   */
  getIdentitySummary() {
    return {
      isLoggedIn: this.isLoggedIn(),
      currentRole: this.getCurrentRole(),
      roleCount: this.getRoleCount(),
      roles: this.getRoles(),
      hasMultipleRoles: this.getRoleCount() > 1,
      needsIdentitySelection: this.needShowIdentitySelection(),
      isLoginExpired: this.isLoginExpired(),
      timestamp: Date.now()
    }
  }

  /**
   * 验证身份数据完整性
   * @returns {object} 验证结果
   */
  validateIdentityData() {
    const issues = []

    // 检查当前角色
    if (!this.identityStore.currentRole) {
      issues.push({ type: 'missingCurrentRole', message: '缺少当前角色' })
    } else {
      // 检查当前角色的身份信息
      const currentIdentity = this.identityStore.identities[this.identityStore.currentRole]
      if (!currentIdentity) {
        issues.push({ type: 'missingCurrentIdentity', message: `缺少当前角色 ${this.identityStore.currentRole} 的身份信息` })
      } else {
        // 检查必需字段
        if (!currentIdentity._id) {
          issues.push({ type: 'missingId', message: '身份信息缺少 _id 字段' })
        }
        if (!currentIdentity.openid) {
          issues.push({ type: 'missingOpenid', message: '身份信息缺少 openid 字段' })
        }
      }
    }

    // 检查公共数据
    if (!this.identityStore.commonData.openid) {
      issues.push({ type: 'missingCommonOpenid', message: '公共数据缺少 openid 字段' })
    }

    return {
      isValid: issues.length === 0,
      issues: issues,
      timestamp: Date.now()
    }
  }

  /**
   * 修复身份数据完整性问题
   * @returns {object} 修复结果
   */
  fixIdentityData() {
    const validation = this.validateIdentityData()
    const fixedIssues = []

    if (!validation.isValid) {
      validation.issues.forEach(issue => {
        switch (issue.type) {
          case 'missingCurrentRole':
            // 设置默认角色
            const roles = this.getRoles()
            if (roles.length > 0) {
              this.identityStore.currentRole = roles[0].roleType
              fixedIssues.push(issue)
            }
            break
          case 'missingCommonOpenid':
            // 尝试从身份信息中获取 openid
            const currentRole = this.identityStore.currentRole
            if (currentRole) {
              const identity = this.identityStore.identities[currentRole]
              if (identity && identity.openid) {
                this.identityStore.commonData.openid = identity.openid
                fixedIssues.push(issue)
              }
            }
            break
        }
      })

      if (fixedIssues.length > 0) {
        // 保存修复后的数据
        this._saveToStorage()
        
        // 触发事件
        this._emitEvent(IDENTITY_EVENTS.IDENTITY_UPDATED, {
          role: this.identityStore.currentRole,
          identity: this.identityStore.identities[this.identityStore.currentRole],
          fixedIssues: fixedIssues.length,
          timestamp: Date.now()
        })
      }
    }

    return {
      success: fixedIssues.length > 0,
      fixedIssues: fixedIssues,
      remainingIssues: validation.issues.filter(issue => !fixedIssues.includes(issue)),
      timestamp: Date.now()
    }
  }
}

// 创建单例实例
const centralIdentityManager = new CentralIdentityManager()

module.exports = {
  CentralIdentityManager,
  centralIdentityManager,
  ROLE_TYPES,
  PERMISSIONS,
  IDENTITY_EVENTS,
  AUTH_EVENTS
}
