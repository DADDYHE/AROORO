/**
 * 身份管理工具函数
 * 提供统一的身份获取和验证方法，确保所有页面使用一致的方式获取当前身份
 */

/**
 * 获取当前身份类型
 * @param {object} app - 应用实例
 * @returns {string} 当前身份类型 ('owner' 或 'host')
 */
function getCurrentRoleType(app) {
  // 优先使用身份上下文管理器获取当前身份
  if (app.globalData.identityContextManager) {
    const roleType = app.globalData.identityContextManager.getCurrentRoleType()
    if (roleType) {
      return roleType
    }
  }
  
  // 其次使用 currentRole.roleType
  if (app.globalData.currentRole && app.globalData.currentRole.roleType) {
    return app.globalData.currentRole.roleType
  }
  
  // 再次使用 userRole (保持向后兼容)
  if (app.globalData.userRole) {
    return app.globalData.userRole
  }
  
  // 默认返回 owner
  return 'owner'
}

/**
 * 获取当前身份信息
 * @param {object} app - 应用实例
 * @returns {object} 当前身份信息对象
 */
function getCurrentIdentity(app) {
  const roleType = getCurrentRoleType(app)
  
  // 优先使用身份上下文管理器获取当前身份上下文
  if (app.globalData.identityContextManager) {
    const context = app.globalData.identityContextManager.getCurrentContext()
    if (context) {
      return {
        roleType: context.roleType,
        profile: context.profile,
        imUserInfo: context.imUserInfo,
        permissions: context.permissions
      }
    }
  }
  
  // 其次使用全局变量
  return {
    roleType: roleType,
    profile: app.globalData.currentProfile || {},
    imUserInfo: null,
    permissions: null
  }
}

/**
 * 验证身份是否一致
 * @param {object} app - 应用实例
 * @returns {boolean} 身份是否一致
 */
function isIdentityConsistent(app) {
  const roleTypeFromContextManager = app.globalData.identityContextManager ? 
    app.globalData.identityContextManager.getCurrentRoleType() : null
  
  const roleTypeFromCurrentRole = app.globalData.currentRole ? 
    app.globalData.currentRole.roleType : null
  
  const roleTypeFromUserRole = app.globalData.userRole
  
  // 检查所有非空的身份类型是否一致
  const roleTypes = [
    roleTypeFromContextManager,
    roleTypeFromCurrentRole,
    roleTypeFromUserRole
  ].filter(Boolean)
  
  if (roleTypes.length === 0) {
    return true // 没有身份信息，视为一致
  }
  
  const firstRoleType = roleTypes[0]
  return roleTypes.every(roleType => roleType === firstRoleType)
}

/**
 * 修复身份不一致问题
 * @param {object} app - 应用实例
 * @returns {string} 修复后的身份类型
 */
function fixIdentityInconsistency(app) {
  const roleTypeFromContextManager = app.globalData.identityContextManager ? 
    app.globalData.identityContextManager.getCurrentRoleType() : null
  
  const roleTypeFromCurrentRole = app.globalData.currentRole ? 
    app.globalData.currentRole.roleType : null
  
  const roleTypeFromUserRole = app.globalData.userRole
  
  // 优先级：身份上下文管理器 > currentRole > userRole > owner
  const correctRole = roleTypeFromContextManager || 
    roleTypeFromCurrentRole || 
    roleTypeFromUserRole || 
    'owner'
  
  // 更新所有相关的全局变量，确保一致性
  if (app.globalData.identityContextManager) {
    app.globalData.identityContextManager.switchContext(correctRole)
  }
  
  if (app.globalData.currentRole) {
    app.globalData.currentRole.roleType = correctRole
  }
  
  app.globalData.userRole = correctRole
  
  console.log('修复身份不一致问题:', {
    before: {
      roleTypeFromContextManager,
      roleTypeFromCurrentRole,
      roleTypeFromUserRole
    },
    after: correctRole
  })
  
  return correctRole
}

/**
 * 检查身份是否已登录
 * @param {object} app - 应用实例
 * @param {string} [roleType] - 身份类型（可选，默认为当前身份）
 * @returns {boolean} 是否已登录
 */
function isIdentityLoggedIn(app, roleType = null) {
  const targetRoleType = roleType || getCurrentRoleType(app)
  
  if (app.globalData.identityContextManager) {
    const context = app.globalData.identityContextManager.getContext(targetRoleType)
    if (context && context.imUserInfo) {
      return context.imUserInfo.isLoggedIn
    }
  }
  
  return false
}

/**
 * 获取身份显示名称
 * @param {string} roleType - 身份类型
 * @returns {string} 身份显示名称
 */
function getRoleDisplayName(roleType) {
  const roleNames = {
    'owner': '宠物主人',
    'host': '寄养家庭'
  }
  
  return roleNames[roleType] || '用户'
}

/**
 * 检查是否有权限执行操作
 * @param {object} app - 应用实例
 * @param {string} permission - 权限名称
 * @param {string} [roleType] - 身份类型（可选，默认为当前身份）
 * @returns {boolean} 是否有权限
 */
function hasPermission(app, permission, roleType = null) {
  const targetRoleType = roleType || getCurrentRoleType(app)
  
  if (app.globalData.identityContextManager) {
    return app.globalData.identityContextManager.checkPermission(permission, targetRoleType)
  }
  
  // 默认返回 true (保持向后兼容)
  return true
}

module.exports = {
  getCurrentRoleType,
  getCurrentIdentity,
  isIdentityConsistent,
  fixIdentityInconsistency,
  isIdentityLoggedIn,
  getRoleDisplayName,
  hasPermission
}
