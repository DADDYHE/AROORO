// utils/authMiddleware.js

/**
 * 身份验证中间件
 * 用于验证用户的身份和权限
 */

class AuthMiddleware {
  /**
   * 获取登录状态管理器（返回 centralIdentityManager）
   * @returns {object} 登录状态管理器实例
   */
  static getLoginStateManager() {
    const app = getApp()
    return app?.globalData?.loginStateManager || app?.globalData?.centralIdentityManager
  }

  /**
   * 检查用户是否已登录
   * @returns {boolean} 是否已登录
   */
  static isLoggedIn() {
    // 检查是否是用户主动退出登录
    const loginStateManager = this.getLoginStateManager()
    const isLogout = loginStateManager ? loginStateManager.get('isLogout') : false
    if (isLogout) {
      return false
    }
    
    return loginStateManager ? loginStateManager.isLoggedIn() : false
  }

  /**
   * 获取当前用户信息
   * @returns {object|null} 用户信息
   */
  static getUserInfo() {
    const loginStateManager = this.getLoginStateManager()
    return loginStateManager ? loginStateManager.getUserInfo() : null
  }

  /**
   * 获取当前用户角色
   * @returns {string} 用户角色
   */
  static getUserRole() {
    const loginStateManager = this.getLoginStateManager()
    return loginStateManager ? loginStateManager.getCurrentRole() : 'owner'
  }

  /**
   * 检查用户是否拥有指定角色
   * @param {string} roleType - 角色类型
   * @returns {boolean} 是否拥有指定角色
   */
  static hasRole(roleType) {
    const currentRole = this.getUserRole()
    return currentRole === roleType
  }

  /**
   * 检查用户是否有权限执行操作
   * @param {string} requiredRole - 所需角色
   * @returns {boolean} 是否有权限
   */
  static hasPermission(requiredRole) {
    if (requiredRole === 'any') {
      return this.isLoggedIn()
    }
    return this.isLoggedIn() && this.hasRole(requiredRole)
  }

  /**
   * 验证用户身份并跳转到登录页面（如果未登录）
   * @param {string} requiredRole - 所需角色
   * @returns {boolean} 是否验证通过
   */
  static validateAuth(requiredRole = 'any') {
    if (!this.isLoggedIn()) {
      wx.showModal({
        title: '请登录',
        content: '您需要登录后才能执行此操作',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            // 跳转到登录页面
            wx.navigateTo({
              url: '/pages/login/login'
            })
          }
        }
      })
      return false
    }

    if (requiredRole !== 'any' && !this.hasRole(requiredRole)) {
      wx.showToast({
        title: '您没有权限执行此操作',
        icon: 'none'
      })
      return false
    }

    return true
  }

  /**
   * 生成签名（用于API请求）
   * @param {object} data - 数据
   * @returns {string} 签名
   */
  static generateSignature(data) {
    // 这里可以实现签名生成逻辑
    // 例如：使用密钥对数据进行加密生成签名
    return 'signature'
  }

  /**
   * 验证签名（用于API请求）
   * @param {object} data - 数据
   * @param {string} signature - 签名
   * @returns {boolean} 签名是否有效
   */
  static verifySignature(data, signature) {
    // 这里可以实现签名验证逻辑
    // 例如：使用密钥对数据进行加密并与签名比较
    return true
  }
}

module.exports = AuthMiddleware