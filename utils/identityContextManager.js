/**
 * 身份上下文管理器
 * 用于管理不同身份的上下文，实现身份隔离
 *
 * 参考文档：
 * - 微信小程序官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/
 * - 微信云开发官方文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
 * - 腾讯云IM官方文档：https://cloud.tencent.com/document/product/269/1502
 */

// 导入统一ID生成模块
const { generateIMUserId } = require('./idGenerator')

class IdentityContextManager {
  constructor() {
    this.contexts = {} // 存储所有身份的上下文
    this.currentRoleType = null // 当前身份类型
    this.defaultRoleType = null // 默认身份类型
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
    if (!['owner', 'host'].includes(roleType)) {
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
    const defaultPermissions = this._getDefaultPermissions(roleType)

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
    this.contexts[roleType] = fullContext

    // 如果是第一个添加的身份，设置为默认身份
    if (!this.defaultRoleType) {
      this.defaultRoleType = roleType
    }

    return true
  }

  /**
   * 获取默认权限
   * @private
   * @param {string} roleType - 身份类型
   * @returns {object} 默认权限
   */
  _getDefaultPermissions(roleType) {
    const basePermissions = {
      viewOwnProfile: true,
      editOwnProfile: true,
      viewMessages: true,
      sendMessages: true,
    }

    if (roleType === 'owner') {
      return {
        ...basePermissions,
        bookServices: true,
        viewHostProfiles: true,
        createPetProfiles: true,
        viewPetProfiles: true,
        editPetProfiles: true,
      }
    } else if (roleType === 'host') {
      return {
        ...basePermissions,
        manageHostProfile: true,
        acceptBookings: true,
        viewBookings: true,
        manageBookings: true,
      }
    }

    return basePermissions
  }

  /**
   * 检查权限
   * @param {string} permission - 权限名称
   * @param {string} [roleType] - 身份类型（可选，默认为当前身份）
   * @returns {boolean} 是否有权限
   */
  checkPermission(permission, roleType = null) {
    const targetRoleType = roleType || this.currentRoleType
    if (!targetRoleType) {
      console.error('检查权限失败：未指定身份类型且未设置当前身份')
      return false
    }

    const context = this.getContext(targetRoleType)
    if (!context || !context.permissions) {
      console.warn(`检查权限：身份 ${targetRoleType} 不存在或无权限设置`)
      return false
    }

    return context.permissions[permission] || false
  }

  /**
   * 批量检查权限
   * @param {array} permissions - 权限名称数组
   * @param {string} [roleType] - 身份类型（可选，默认为当前身份）
   * @returns {object} 权限检查结果
   */
  checkPermissions(permissions, roleType = null) {
    const result = {}
    permissions.forEach(permission => {
      result[permission] = this.checkPermission(permission, roleType)
    })
    return result
  }

  /**
   * 更新权限
   * @param {object} permissions - 权限对象
   * @param {string} [roleType] - 身份类型（可选，默认为当前身份）
   * @returns {boolean} 是否更新成功
   */
  updatePermissions(permissions, roleType = null) {
    const targetRoleType = roleType || this.currentRoleType
    if (!targetRoleType) {
      console.error('更新权限失败：未指定身份类型且未设置当前身份')
      return false
    }

    const context = this.getContext(targetRoleType)
    if (!context) {
      console.error(`更新权限失败：身份 ${targetRoleType} 不存在`)
      return false
    }

    if (!context.permissions) {
      context.permissions = this._getDefaultPermissions(targetRoleType)
    }

    context.permissions = {
      ...context.permissions,
      ...permissions,
    }

    context.updatedAt = Date.now()
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
    if (!this.currentRoleType) {
      console.warn('获取当前身份上下文失败：未设置当前身份')
      return null
    }

    const context = this.contexts[this.currentRoleType]
    if (!context) {
      console.error(`获取当前身份上下文失败：身份 ${this.currentRoleType} 不存在`)
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

    const context = this.contexts[roleType]
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
      return this.contexts[roleType]
    }

    return context
  }

  /**
   * 获取所有身份上下文
   * @returns {object} 所有身份上下文
   */
  getAllContexts() {
    return this.contexts
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
    if (!this.contexts[roleType]) {
      console.warn(`更新连接状态：身份 ${roleType} 不存在，创建默认身份上下文`)
      // 使用默认值创建身份上下文
      this.addContext(roleType, {
        profile: {
          openid: '',
          userId: `temp_${roleType}_${Date.now()}`
        }
      })
    }

    const context = this.contexts[roleType]
    context.imUserInfo.connectionStatus = status
    context.updatedAt = Date.now()

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
    if (!this.contexts[roleType]) {
      console.warn(`设置登录状态：身份 ${roleType} 不存在，创建默认身份上下文`)
      // 使用默认值创建身份上下文
      this.addContext(roleType, {
        profile: {
          openid: '',
          userId: `temp_${roleType}_${Date.now()}`
        }
      })
    }

    const context = this.contexts[roleType]
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
   * 切换身份
   * @param {string} roleType - 目标身份类型
   * @param {object} [options] - 切换选项
   * @returns {boolean} 是否切换成功
   */
  switchContext(roleType, options = {}) {
    if (!roleType) {
      console.error('切换身份失败：参数无效')
      return false
    }

    if (!this.contexts[roleType]) {
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
    this.currentRoleType = roleType

    // 更新上下文的最后使用时间
    this.contexts[roleType].updatedAt = Date.now()

    return true
  }

  /**
   * 切换到默认身份
   * @returns {boolean} 是否切换成功
   */
  switchToDefaultContext() {
    if (!this.defaultRoleType) {
      console.error('切换到默认身份失败：未设置默认身份')
      return false
    }

    return this.switchContext(this.defaultRoleType)
  }

  /**
   * 设置默认身份
   * @param {string} roleType - 身份类型
   * @returns {boolean} 是否设置成功
   */
  setDefaultContext(roleType) {
    if (!roleType || !this.contexts[roleType]) {
      console.error(`设置默认身份失败：身份 ${roleType} 不存在`)
      return false
    }

    this.defaultRoleType = roleType
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

    const context = this.contexts[roleType]
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
    if (!this.currentRoleType) {
      console.error('更新当前身份上下文失败：未设置当前身份')
      return false
    }

    return this.updateContext(this.currentRoleType, updates)
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

    const context = this.contexts[roleType]
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
    if (!this.currentRoleType) {
      console.error('更新当前身份IM用户信息失败：未设置当前身份')
      return false
    }

    return this.updateIMUserInfo(this.currentRoleType, imUserInfo)
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

    if (!this.contexts[roleType]) {
      console.error(`清除身份上下文失败：身份 ${roleType} 不存在`)
      return false
    }

    // 删除身份上下文
    delete this.contexts[roleType]

    // 如果删除的是当前身份，切换到默认身份
    if (this.currentRoleType === roleType) {
      this.switchToDefaultContext()
    }

    // 如果删除的是默认身份，重新设置默认身份
    if (this.defaultRoleType === roleType && Object.keys(this.contexts).length > 0) {
      this.defaultRoleType = Object.keys(this.contexts)[0]
    }

    return true
  }

  /**
   * 清除所有身份上下文
   */
  clearAllContexts() {
    this.contexts = {}
    this.currentRoleType = null
    this.defaultRoleType = null
  }

  /**
   * 检查身份是否存在
   * @param {string} roleType - 身份类型
   * @returns {boolean} 是否存在
   */
  hasContext(roleType) {
    return !!this.contexts[roleType]
  }

  /**
   * 获取当前身份类型
   * @returns {string|null} 当前身份类型
   */
  getCurrentRoleType() {
    return this.currentRoleType
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
    if (!['owner', 'host'].includes(roleType)) {
      console.error('设置当前身份失败：无效的身份类型')
      return false
    }

    console.log(`IdentityContextManager.setCurrentRoleType - 切换当前身份: ${this.currentRoleType} -> ${roleType}`)

    this.currentRoleType = roleType
    this.updatedAt = Date.now()

    return true
  }

  /**
   * 获取默认身份类型
   * @returns {string|null} 默认身份类型
   */
  getDefaultRoleType() {
    return this.defaultRoleType
  }

  /**
   * 获取身份数量
   * @returns {number} 身份数量
   */
  getContextCount() {
    return Object.keys(this.contexts).length
  }

  /**
   * 导出身份上下文
   * @returns {object} 导出的身份上下文
   */
  exportContexts() {
    return JSON.parse(JSON.stringify(this.contexts))
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
}

// 导出单例实例
const identityContextManager = new IdentityContextManager()

module.exports = {
  IdentityContextManager,
  identityContextManager,
}
