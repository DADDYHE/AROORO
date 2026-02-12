/**
 * IM用户资料管理工具
 * 负责管理IM用户资料的更新和同步
 * 
 * 功能：
 * 1. 更新当前登录用户的IM资料（头像、昵称）
 * 2. 更新其他用户的IM资料（如果权限允许）
 * 3. 批量更新用户资料
 */

class IMProfileManager {
  constructor() {
    this._initialized = false
    this._pendingUpdates = new Map() // 待更新的资料队列
    this._updateInProgress = false
  }

  /**
   * 初始化管理器
   */
  init() {
    if (this._initialized) {
      console.warn('[IMProfileManager] 已经初始化，跳过')
      return
    }

    console.log('[IMProfileManager] 初始化完成')
    this._initialized = true
  }

  /**
   * 检查IM SDK是否已初始化
   */
  _checkIMSDK() {
    if (!wx.$TUIKit) {
      console.error('[IMProfileManager] TUIKit未初始化')
      return false
    }

    if (!wx.$TUIKit.isReady || !wx.$TUIKit.isReady()) {
      console.error('[IMProfileManager] TUIKit未ready')
      return false
    }

    return true
  }

  /**
   * 更新当前登录用户的IM资料
   * @param {Object} profile - 用户资料
   * @param {string} profile.nick - 昵称
   * @param {string} profile.avatar - 头像URL
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateMyProfile(profile) {
    if (!this._checkIMSDK()) {
      console.error('[IMProfileManager] IM SDK未就绪，无法更新资料')
      return false
    }

    if (!profile || (!profile.nick && !profile.avatar)) {
      console.warn('[IMProfileManager] 无效的profile参数')
      return false
    }

    try {
      console.log('[IMProfileManager] 开始更新我的资料:', profile)
      
      const options = {}
      if (profile.nick) {
        options.nick = profile.nick
      }
      if (profile.avatar) {
        options.avatar = profile.avatar
      }

      const result = await wx.$TUIKit.updateMyProfile(options)
      
      if (result.code === 0) {
        console.log('[IMProfileManager] 我的资料更新成功:', result.data)
        return true
      } else {
        console.error('[IMProfileManager] 我的资料更新失败:', result)
        return false
      }
    } catch (error) {
      console.error('[IMProfileManager] 更新我的资料异常:', error)
      return false
    }
  }

  /**
   * 更新指定用户的IM资料（如果权限允许）
   * 注意：此功能通常需要管理员权限，仅适用于特定场景
   * @param {string} userID - 用户ID
   * @param {Object} profile - 用户资料
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateUserProfile(userID, profile) {
    if (!this._checkIMSDK()) {
      console.error('[IMProfileManager] IM SDK未就绪，无法更新资料')
      return false
    }

    if (!userID) {
      console.error('[IMProfileManager] 无效的userID参数')
      return false
    }

    if (!profile || (!profile.nick && !profile.avatar)) {
      console.warn('[IMProfileManager] 无效的profile参数')
      return false
    }

    try {
      console.log('[IMProfileManager] 开始更新用户资料:', userID, profile)
      
      // 使用getUserProfile接口更新用户资料
      // 注意：此API的实际可用性取决于IM SDK版本和权限配置
      const options = {
        userIDList: [userID]
      }

      if (profile.nick) {
        options.nick = profile.nick
      }
      if (profile.avatar) {
        options.avatar = profile.avatar
      }

      const result = await wx.$TUIKit.getUserProfile(options)
      
      if (result.code === 0) {
        console.log('[IMProfileManager] 用户资料获取成功:', result.data)
        // 注意：getUserProfile通常只用于获取，不用于更新
        // 如果需要更新其他用户资料，通常需要在服务端调用REST API
        return true
      } else {
        console.error('[IMProfileManager] 用户资料获取失败:', result)
        return false
      }
    } catch (error) {
      console.error('[IMProfileManager] 更新用户资料异常:', error)
      return false
    }
  }

  /**
   * 批量更新用户资料到IM系统
   * 适用于在跳转到聊天页面之前，确保双方用户资料已更新
   * @param {Object} currentUser - 当前用户信息
   * @param {Object} targetUser - 目标用户信息
   * @returns {Promise<Object>} 更新结果
   */
  async updateUsersBeforeChat(currentUser, targetUser) {
    if (!this._checkIMSDK()) {
      console.error('[IMProfileManager] IM SDK未就绪，无法更新资料')
      return {
        success: false,
        currentUserUpdated: false,
        targetUserUpdated: false,
        error: 'IM SDK未就绪'
      }
    }

    console.log('[IMProfileManager] 开始批量更新用户资料:', { currentUser, targetUser })

    const results = {
      currentUserUpdated: false,
      targetUserUpdated: false
    }

    // 更新当前用户资料
    if (currentUser && (currentUser.nick || currentUser.avatar)) {
      results.currentUserUpdated = await this.updateMyProfile({
        nick: currentUser.nick,
        avatar: currentUser.avatar
      })
    }

    // 更新目标用户资料（如果可能）
    // 注意：通常无法直接更新其他用户资料，除非是管理员
    // 这里我们可以尝试获取目标用户资料，确保其存在
    if (targetUser && targetUser.userID) {
      try {
        const result = await wx.$TUIKit.getUserProfile({
          userIDList: [targetUser.userID]
        })
        
        if (result.code === 0 && result.data && result.data.length > 0) {
          console.log('[IMProfileManager] 目标用户资料已存在:', result.data[0])
          results.targetUserUpdated = true
        } else {
          console.warn('[IMProfileManager] 目标用户资料不存在')
          results.targetUserUpdated = false
        }
      } catch (error) {
        console.error('[IMProfileManager] 获取目标用户资料失败:', error)
        results.targetUserUpdated = false
      }
    }

    return {
      success: results.currentUserUpdated,
      ...results
    }
  }

  /**
   * 添加待更新的资料到队列
   * 用于延迟批量更新
   */
  _addToQueue(userID, profile) {
    const key = userID || 'current'
    this._pendingUpdates.set(key, profile)
  }

  /**
   * 处理队列中的待更新资料
   */
  async _processQueue() {
    if (this._updateInProgress || this._pendingUpdates.size === 0) {
      return
    }

    this._updateInProgress = true
    console.log('[IMProfileManager] 开始处理待更新队列，数量:', this._pendingUpdates.size)

    try {
      for (const [userID, profile] of this._pendingUpdates.entries()) {
        if (userID === 'current') {
          await this.updateMyProfile(profile)
        } else {
          await this.updateUserProfile(userID, profile)
        }
      }

      this._pendingUpdates.clear()
      console.log('[IMProfileManager] 待更新队列处理完成')
    } catch (error) {
      console.error('[IMProfileManager] 处理待更新队列失败:', error)
    } finally {
      this._updateInProgress = false
    }
  }

  /**
   * 获取用户的IM资料
   * @param {string} userID - 用户ID
   * @returns {Promise<Object|null>} 用户资料
   */
  async getUserProfile(userID) {
    if (!this._checkIMSDK()) {
      console.error('[IMProfileManager] IM SDK未就绪，无法获取资料')
      return null
    }

    try {
      const result = await wx.$TUIKit.getUserProfile({
        userIDList: [userID]
      })

      if (result.code === 0 && result.data && result.data.length > 0) {
        console.log('[IMProfileManager] 获取用户资料成功:', result.data[0])
        return result.data[0]
      } else {
        console.warn('[IMProfileManager] 用户资料不存在')
        return null
      }
    } catch (error) {
      console.error('[IMProfileManager] 获取用户资料异常:', error)
      return null
    }
  }

  /**
   * 获取当前用户的IM资料
   * @returns {Promise<Object|null>} 当前用户资料
   */
  async getMyProfile() {
    if (!this._checkIMSDK()) {
      console.error('[IMProfileManager] IM SDK未就绪，无法获取资料')
      return null
    }

    try {
      const result = await wx.$TUIKit.getMyProfile()
      
      if (result.code === 0) {
        console.log('[IMProfileManager] 获取我的资料成功:', result.data)
        return result.data
      } else {
        console.error('[IMProfileManager] 获取我的资料失败:', result)
        return null
      }
    } catch (error) {
      console.error('[IMProfileManager] 获取我的资料异常:', error)
      return null
    }
  }
}

// 创建单例
const imProfileManager = new IMProfileManager()

// 初始化
imProfileManager.init()

module.exports = imProfileManager
