/**
 * 权限管理器
 * 用于实现更细粒度的访问控制，确保数据安全
 * 
 * 参考文档：
 * - 微信小程序官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/
 */

class PermissionManager {
  constructor() {
    this.logger = console
    this.permissions = this._initPermissions()
  }

  /**
   * 初始化权限配置
   * @private
   * @returns {object} 权限配置
   */
  _initPermissions() {
    return {
      // 宠物主人权限
      owner: {
        // 基本权限
        basic: {
          view: true,
          edit: true
        },
        // 宠物相关权限
        pet: {
          view: true,
          add: true,
          edit: true,
          delete: true,
          list: true
        },
        // 寄养订单权限
        order: {
          view: true,
          create: true,
          cancel: true,
          list: true
        },
        // 消息权限
        message: {
          send: true,
          receive: true,
          list: true
        },
        // 个人资料权限
        profile: {
          view: true,
          edit: true
        },
        // 寄养家庭权限
        host: {
          view: true,
          list: true,
          favorite: true
        }
      },
      // 寄养家庭权限
      host: {
        // 基本权限
        basic: {
          view: true,
          edit: true
        },
        // 宠物相关权限
        pet: {
          view: true,
          list: true
        },
        // 寄养订单权限
        order: {
          view: true,
          accept: true,
          reject: true,
          complete: true,
          list: true
        },
        // 消息权限
        message: {
          send: true,
          receive: true,
          list: true
        },
        // 个人资料权限
        profile: {
          view: true,
          edit: true
        },
        // 寄养家庭权限
        host: {
          manage: true
        }
      }
    }
  }

  /**
   * 检查权限
   * @param {string} roleType - 身份类型
   * @param {string} resource - 资源类型
   * @param {string} action - 操作类型
   * @returns {boolean} 是否有权限
   */
  checkPermission(roleType, resource, action) {
    if (!roleType || !resource || !action) {
      this.logger.error('检查权限失败：参数无效')
      return false
    }

    // 检查身份类型是否存在
    if (!this.permissions[roleType]) {
      this.logger.error(`检查权限失败：身份类型 ${roleType} 不存在`)
      return false
    }

    // 检查资源类型是否存在
    if (!this.permissions[roleType][resource]) {
      this.logger.error(`检查权限失败：资源类型 ${resource} 不存在`)
      return false
    }

    // 检查操作类型是否存在
    if (!this.permissions[roleType][resource][action]) {
      this.logger.debug(`权限检查失败：身份 ${roleType} 对资源 ${resource} 没有 ${action} 权限`)
      return false
    }

    this.logger.debug(`权限检查通过：身份 ${roleType} 对资源 ${resource} 有 ${action} 权限`)
    return true
  }

  /**
   * 批量检查权限
   * @param {string} roleType - 身份类型
   * @param {array} permissions - 权限数组，每个元素格式为 { resource, action }
   * @returns {object} 权限检查结果，格式为 { resource: { action: boolean } }
   */
  checkPermissions(roleType, permissions) {
    if (!roleType || !Array.isArray(permissions)) {
      this.logger.error('批量检查权限失败：参数无效')
      return {}
    }

    const result = {}
    
    permissions.forEach(permission => {
      const { resource, action } = permission
      if (resource && action) {
        if (!result[resource]) {
          result[resource] = {}
        }
        result[resource][action] = this.checkPermission(roleType, resource, action)
      }
    })

    return result
  }

  /**
   * 获取身份的所有权限
   * @param {string} roleType - 身份类型
   * @returns {object|null} 权限配置或null
   */
  getRolePermissions(roleType) {
    if (!roleType) {
      this.logger.error('获取身份权限失败：参数无效')
      return null
    }

    if (!this.permissions[roleType]) {
      this.logger.error(`获取身份权限失败：身份类型 ${roleType} 不存在`)
      return null
    }

    return this.permissions[roleType]
  }

  /**
   * 获取资源的所有操作权限
   * @param {string} roleType - 身份类型
   * @param {string} resource - 资源类型
   * @returns {object|null} 操作权限配置或null
   */
  getResourcePermissions(roleType, resource) {
    if (!roleType || !resource) {
      this.logger.error('获取资源权限失败：参数无效')
      return null
    }

    const rolePermissions = this.getRolePermissions(roleType)
    if (!rolePermissions) {
      return null
    }

    if (!rolePermissions[resource]) {
      this.logger.error(`获取资源权限失败：资源类型 ${resource} 不存在`)
      return null
    }

    return rolePermissions[resource]
  }

  /**
   * 检查是否有权限访问特定数据
   * @param {string} roleType - 身份类型
   * @param {string} dataType - 数据类型
   * @param {object} data - 数据对象
   * @returns {boolean} 是否有权限
   */
  checkDataAccess(roleType, dataType, data) {
    if (!roleType || !dataType) {
      this.logger.error('检查数据访问权限失败：参数无效')
      return false
    }

    // 根据数据类型和身份类型检查权限
    switch (dataType) {
    case 'pet':
      return this.checkPermission(roleType, 'pet', 'view')
    case 'order':
      return this.checkOrderAccess(roleType, data)
    case 'profile':
      return this.checkProfileAccess(roleType, data)
    case 'message':
      return this.checkPermission(roleType, 'message', 'view')
    default:
      this.logger.error(`检查数据访问权限失败：数据类型 ${dataType} 不存在`)
      return false
    }
  }

  /**
   * 检查订单访问权限
   * @private
   * @param {string} roleType - 身份类型
   * @param {object} order - 订单对象
   * @returns {boolean} 是否有权限
   */
  checkOrderAccess(roleType, order) {
    if (!order) {
      return this.checkPermission(roleType, 'order', 'view')
    }

    // 检查订单是否属于当前身份
    if (roleType === 'owner' && order.ownerId === this._getCurrentUserId()) {
      return true
    }

    if (roleType === 'host' && order.hostId === this._getCurrentUserId()) {
      return true
    }

    this.logger.warn(`订单访问权限检查失败：身份 ${roleType} 无权访问订单 ${order.id}`)
    return false
  }

  /**
   * 检查个人资料访问权限
   * @private
   * @param {string} roleType - 身份类型
   * @param {object} profile - 个人资料对象
   * @returns {boolean} 是否有权限
   */
  checkProfileAccess(roleType, profile) {
    if (!profile) {
      return this.checkPermission(roleType, 'profile', 'view')
    }

    // 检查个人资料是否属于当前身份
    if (profile.roleType === roleType && profile.userId === this._getCurrentUserId()) {
      return true
    }

    this.logger.warn(`个人资料访问权限检查失败：身份 ${roleType} 无权访问个人资料`)
    return false
  }

  /**
   * 获取当前用户ID
   * @private
   * @returns {string} 用户ID
   */
  _getCurrentUserId() {
    // 实际项目中，应该从全局状态或身份上下文管理器中获取
    // 这里为了演示，返回一个模拟的用户ID
    try {
      const app = getApp()
      return (app.globalData && app.globalData.userInfo && app.globalData.userInfo.openid) || 'mock_user_id'
    } catch (error) {
      return 'mock_user_id'
    }
  }

  /**
   * 添加自定义权限
   * @param {string} roleType - 身份类型
   * @param {string} resource - 资源类型
   * @param {string} action - 操作类型
   * @param {boolean} allowed - 是否允许
   * @returns {boolean} 是否添加成功
   */
  addPermission(roleType, resource, action, allowed) {
    if (!roleType || !resource || !action) {
      this.logger.error('添加权限失败：参数无效')
      return false
    }

    // 如果身份类型不存在，创建它
    if (!this.permissions[roleType]) {
      this.permissions[roleType] = {}
    }

    // 如果资源类型不存在，创建它
    if (!this.permissions[roleType][resource]) {
      this.permissions[roleType][resource] = {}
    }

    // 添加权限
    this.permissions[roleType][resource][action] = allowed
    this.logger.log(`添加权限成功：身份 ${roleType} 对资源 ${resource} 的 ${action} 权限设置为 ${allowed}`)
    return true
  }

  /**
   * 移除权限
   * @param {string} roleType - 身份类型
   * @param {string} resource - 资源类型
   * @param {string} action - 操作类型
   * @returns {boolean} 是否移除成功
   */
  removePermission(roleType, resource, action) {
    if (!roleType || !resource || !action) {
      this.logger.error('移除权限失败：参数无效')
      return false
    }

    // 检查身份类型是否存在
    if (!this.permissions[roleType]) {
      this.logger.error(`移除权限失败：身份类型 ${roleType} 不存在`)
      return false
    }

    // 检查资源类型是否存在
    if (!this.permissions[roleType][resource]) {
      this.logger.error(`移除权限失败：资源类型 ${resource} 不存在`)
      return false
    }

    // 检查操作类型是否存在
    if (!this.permissions[roleType][resource][action]) {
      this.logger.error(`移除权限失败：操作类型 ${action} 不存在`)
      return false
    }

    // 移除权限
    delete this.permissions[roleType][resource][action]
    this.logger.log(`移除权限成功：身份 ${roleType} 对资源 ${resource} 的 ${action} 权限`)
    return true
  }

  /**
   * 导出权限配置
   * @returns {object} 权限配置
   */
  exportPermissions() {
    return JSON.parse(JSON.stringify(this.permissions))
  }

  /**
   * 导入权限配置
   * @param {object} permissions - 权限配置
   * @returns {boolean} 是否导入成功
   */
  importPermissions(permissions) {
    if (!permissions || typeof permissions !== 'object') {
      this.logger.error('导入权限失败：参数无效')
      return false
    }

    this.permissions = permissions
    this.logger.log('导入权限成功')
    return true
  }

  /**
   * 验证操作权限
   * @param {string} roleType - 身份类型
   * @param {string} action - 操作类型
   * @returns {boolean} 是否有权限
   */
  validateAction(roleType, action) {
    if (!roleType || !action) {
      this.logger.error('验证操作权限失败：参数无效')
      return false
    }

    // 解析操作类型，格式为 "resource:action"
    const [resource, actionType] = action.split(':')
    if (!resource || !actionType) {
      this.logger.error('验证操作权限失败：操作类型格式错误')
      return false
    }

    // 检查权限
    return this.checkPermission(roleType, resource, actionType)
  }

  /**
   * 获取权限检查结果的详细信息
   * @param {string} roleType - 身份类型
   * @param {string} resource - 资源类型
   * @param {string} action - 操作类型
   * @returns {object} 权限检查结果
   */
  getPermissionInfo(roleType, resource, action) {
    const hasPermission = this.checkPermission(roleType, resource, action)
    
    return {
      roleType,
      resource,
      action,
      hasPermission,
      timestamp: Date.now(),
      message: hasPermission 
        ? `身份 ${roleType} 对资源 ${resource} 有 ${action} 权限` 
        : `身份 ${roleType} 对资源 ${resource} 没有 ${action} 权限`
    }
  }
}

// 导出单例实例
const permissionManager = new PermissionManager()

module.exports = {
  PermissionManager,
  permissionManager
}
