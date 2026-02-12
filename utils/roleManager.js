// utils/roleManager.js
// 角色管理工具，处理角色切换和通知

const app = getApp()

class RoleManager {
  constructor() {
    this.roleChangeCallbacks = []
  }

  /**
   * 切换角色
   * @param {string} newRole - 新角色 (owner/host)
   * @returns {Promise} - 返回切换结果
   */
  async switchRole(newRole) {
    try {
      console.log('RoleManager.switchRole - 切换角色:', newRole)

      // 更新全局角色
      app.globalData.userRole = newRole

      // 保存到本地存储
      wx.setStorageSync('userRole', newRole)

      // 同步更新 identityContextManager 的当前角色
      if (app.globalData.identityContextManager) {
        app.globalData.identityContextManager.setCurrentRoleType(newRole)
        console.log('RoleManager.switchRole - 已更新 identityContextManager.currentRoleType:', newRole)
      } else {
        console.warn('RoleManager.switchRole - identityContextManager 未初始化，跳过更新')
      }

      // 通知所有注册的回调
      this.notifyRoleChange(newRole)

      console.log(`角色切换成功: ${newRole}`)

      return {
        code: 0,
        message: `角色切换到${newRole === 'owner' ? '宠物主人' : '寄养家庭'}成功`
      }
    } catch (error) {
      console.error('角色切换失败:', error)
      return {
        code: -1,
        message: '角色切换失败',
        error: error.message
      }
    }
  }

  /**
   * 注册角色切换回调
   * @param {Function} callback - 回调函数
   * @returns {number} - 回调ID，用于后续移除
   */
  registerRoleChangeCallback(callback) {
    if (typeof callback === 'function') {
      const callbackId = Date.now() + Math.random()
      this.roleChangeCallbacks.push({
        id: callbackId,
        callback: callback
      })
      console.log('角色切换回调已注册，ID:', callbackId)
      return callbackId
    }
    return null
  }

  /**
   * 移除角色切换回调
   * @param {number} callbackId - 回调ID
   */
  removeRoleChangeCallback(callbackId) {
    const initialLength = this.roleChangeCallbacks.length
    this.roleChangeCallbacks = this.roleChangeCallbacks.filter(item => item.id !== callbackId)
    if (this.roleChangeCallbacks.length < initialLength) {
      console.log('角色切换回调已移除，ID:', callbackId)
    }
  }

  /**
   * 通知角色切换
   * @param {string} newRole - 新角色
   */
  notifyRoleChange(newRole) {
    console.log(`通知角色切换到: ${newRole}`)
    
    this.roleChangeCallbacks.forEach(item => {
      try {
        item.callback(newRole)
      } catch (error) {
        console.error('执行角色切换回调时出错:', error)
      }
    })
  }

  /**
   * 获取当前角色
   * @returns {string} - 当前角色
   */
  getCurrentRole() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
    return app.globalData.userRole || (userInfo && userInfo.role) || wx.getStorageSync('userRole') || 'owner'
  }

  /**
   * 检查角色是否有效
   * @param {string} role - 角色
   * @returns {boolean} - 是否有效
   */
  isValidRole(role) {
    return ['owner', 'host'].includes(role)
  }
}

// 导出单例
export default new RoleManager()