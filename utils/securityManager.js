/**
 * 安全管理器
 * 用于处理UserSig管理、数据加密和保护、安全验证等
 */

class SecurityManager {
  constructor() {
    this.userSigCache = new Map() // UserSig缓存
    this.ENCRYPTION_KEY = 'zuoyou_secure_key_2026' // 加密密钥
    this.USER_SIG_EXPIRY = 24 * 60 * 60 * 1000 // UserSig过期时间（24小时）
    this.SECURE_STORAGE_PREFIX = 'secure_' // 安全存储前缀
  }

  /**
   * 生成安全的缓存键
   * @param {string} roleType - 身份类型
   * @param {string} openid - 用户openid
   * @returns {string} 缓存键
   */
  generateUserSigCacheKey(roleType, openid) {
    return `${roleType}_${openid}_${Date.now()}`
  }

  /**
   * 缓存UserSig
   * @param {string} roleType - 身份类型
   * @param {string} openid - 用户openid
   * @param {string} userSig - 用户签名
   */
  cacheUserSig(roleType, openid, userSig) {
    if (!userSig || userSig === 'testuser123' || userSig.length < 10) {

      return
    }

    const cacheKey = this.generateUserSigCacheKey(roleType, openid)
    this.userSigCache.set(cacheKey, {
      userSig,
      roleType,
      openid,
      timestamp: Date.now(),
      expiry: Date.now() + this.USER_SIG_EXPIRY
    })


  }

  /**
   * 获取缓存的UserSig
   * @param {string} roleType - 身份类型
   * @param {string} openid - 用户openid
   * @returns {string|null} UserSig或null
   */
  getCachedUserSig(roleType, openid) {
    // 遍历缓存查找匹配的UserSig
    for (const [key, value] of this.userSigCache.entries()) {
      if (value.roleType === roleType && value.openid === openid) {
        // 检查是否过期
        if (Date.now() > value.expiry) {
          this.userSigCache.delete(key)
          return null
        }

        // 验证UserSig
        if (!this.validateUserSig(value.userSig)) {
          this.userSigCache.delete(key)
          return null
        }

        return value.userSig
      }
    }

    return null
  }

  /**
   * 验证UserSig的有效性
   * @param {string} userSig - 用户签名
   * @returns {boolean} 是否有效
   */
  validateUserSig(userSig) {
    if (!userSig || typeof userSig !== 'string') {
      return false
    }

    // 检查UserSig长度
    if (userSig.length < 10) {
      return false
    }

    // 检查是否为测试UserSig
    if (userSig === 'testuser123') {
      return false
    }

    // 这里可以添加更复杂的验证逻辑
    // 例如：解析UserSig并验证其结构和签名

    return true
  }

  /**
   * 清除UserSig缓存
   * @param {string} [roleType] - 身份类型，不提供则清除所有缓存
   * @param {string} [openid] - 用户openid，不提供则清除指定身份类型的所有缓存
   */
  clearUserSigCache(roleType, openid) {
    if (!roleType) {
      // 清除所有缓存
      this.userSigCache.clear()

      return
    }

    if (!openid) {
      // 清除指定身份类型的所有缓存
      for (const [key, value] of this.userSigCache.entries()) {
        if (value.roleType === roleType) {
          this.userSigCache.delete(key)
        }
      }

      return
    }

    // 清除指定身份和openid的缓存
    for (const [key, value] of this.userSigCache.entries()) {
      if (value.roleType === roleType && value.openid === openid) {
        this.userSigCache.delete(key)
      }
    }

  }

  /**
   * 加密数据
   * @param {string} data - 要加密的数据
   * @returns {string} 加密后的数据
   */
  encryptData(data) {
    try {
      // 这里使用简单的加密方法，实际项目中应该使用更安全的加密算法
      // 例如：AES-256-CBC加密
      let encrypted = ''
      for (let i = 0; i < data.length; i++) {
        const charCode = data.charCodeAt(i) ^ this.ENCRYPTION_KEY.charCodeAt(i % this.ENCRYPTION_KEY.length)
        encrypted += String.fromCharCode(charCode)
      }
      return btoa(encrypted)
    } catch (error) {
      return data
    }
  }

  /**
   * 解密数据
   * @param {string} encryptedData - 加密后的数据
   * @returns {string} 解密后的数据
   */
  decryptData(encryptedData) {
    try {
      // 这里使用简单的解密方法，与加密方法对应
      const encrypted = atob(encryptedData)
      let decrypted = ''
      for (let i = 0; i < encrypted.length; i++) {
        const charCode = encrypted.charCodeAt(i) ^ this.ENCRYPTION_KEY.charCodeAt(i % this.ENCRYPTION_KEY.length)
        decrypted += String.fromCharCode(charCode)
      }
      return decrypted
    } catch (error) {
      return encryptedData
    }
  }

  /**
   * 安全存储数据
   * @param {string} key - 存储键
   * @param {any} data - 要存储的数据
   */
  secureStorageSet(key, data) {
    try {
      const secureKey = `${this.SECURE_STORAGE_PREFIX}${key}`
      const jsonData = JSON.stringify(data)
      const encryptedData = this.encryptData(jsonData)
      wx.setStorageSync(secureKey, encryptedData)
  
    } catch (error) {
      // 安全存储失败，忽略错误
    }
  }

  /**
   * 安全获取数据
   * @param {string} key - 存储键
   * @returns {any|null} 存储的数据或null
   */
  secureStorageGet(key) {
    try {
      const secureKey = `${this.SECURE_STORAGE_PREFIX}${key}`
      const encryptedData = wx.getStorageSync(secureKey)
      if (!encryptedData) {
        return null
      }
      const decryptedData = this.decryptData(encryptedData)
      return JSON.parse(decryptedData)
    } catch (error) {
      return null
    }
  }

  /**
   * 安全删除数据
   * @param {string} key - 存储键
   */
  secureStorageRemove(key) {
    try {
      const secureKey = `${this.SECURE_STORAGE_PREFIX}${key}`
      wx.removeStorageSync(secureKey)
  
    } catch (error) {
      // 安全删除失败，忽略错误
    }
  }

  /**
   * 生成安全的随机字符串
   * @param {number} length - 字符串长度
   * @returns {string} 随机字符串
   */
  generateRandomString(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * 验证数据完整性
   * @param {object} data - 要验证的数据
   * @param {array} requiredFields - 必需字段
   * @returns {boolean} 数据是否完整
   */
  validateDataIntegrity(data, requiredFields) {
    if (!data || typeof data !== 'object') {
      return false
    }

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        return false
      }
    }

    return true
  }

  /**
   * 验证UserSig是否即将过期
   * @param {string} userSig - 用户签名
   * @param {number} threshold - 阈值（毫秒）
   * @returns {boolean} 是否即将过期
   */
  isUserSigExpiring(userSig, threshold = 60 * 60 * 1000) {
    // 这里简化处理，实际项目中应该解析UserSig获取过期时间
    // 这里假设UserSig缓存中有过期时间信息
    for (const [, value] of this.userSigCache.entries()) {
      if (value.userSig === userSig) {
        const timeUntilExpiry = value.expiry - Date.now()
        return timeUntilExpiry < threshold
      }
    }
    return true
  }

  /**
   * 清理过期的UserSig缓存
   */
  cleanupExpiredUserSigCache() {
    const now = Date.now()
    let removedCount = 0

    for (const [key, value] of this.userSigCache.entries()) {
      if (now > value.expiry) {
        this.userSigCache.delete(key)
        removedCount++
      }
    }

    if (removedCount > 0) {
      // 已清理过期的UserSig缓存
    }
  }

  /**
   * 获取安全管理器状态
   * @returns {object} 状态信息
   */
  getStatus() {
    this.cleanupExpiredUserSigCache() // 清理过期缓存

    return {
      userSigCacheSize: this.userSigCache.size,
      encryptionKeySet: !!this.ENCRYPTION_KEY,
      userSigExpiry: this.USER_SIG_EXPIRY,
      secureStoragePrefix: this.SECURE_STORAGE_PREFIX
    }
  }

  /**
   * 清除所有安全相关的缓存和存储
   */
  clearAll() {
    this.userSigCache.clear()
    
    // 清除安全存储
    try {
      const keys = wx.getStorageInfoSync().keys
      for (const key of keys) {
        if (key.startsWith(this.SECURE_STORAGE_PREFIX)) {
          wx.removeStorageSync(key)
        }
      }
    } catch (error) {
      // 清除安全存储失败，忽略错误
    }


  }

  /**
   * 验证请求的安全性
   * @param {object} request - 请求信息
   * @returns {boolean} 请求是否安全
   */
  validateRequestSecurity(request) {
    // 检查请求来源
    if (!request || !request.url) {
      return false
    }

    // 检查请求时间戳，防止重放攻击
    if (request.timestamp) {
      const timeDiff = Date.now() - request.timestamp
      if (Math.abs(timeDiff) > 5 * 60 * 1000) { // 5分钟内有效
        return false
      }
    }

    // 检查请求签名
    if (request.signature) {
      const expectedSignature = this.generateRequestSignature(request)
      if (request.signature !== expectedSignature) {
        return false
      }
    }

    return true
  }

  /**
   * 生成请求签名
   * @param {object} request - 请求信息
   * @returns {string} 请求签名
   */
  generateRequestSignature(request) {
    const { url, method, data, timestamp } = request
    const signatureData = `${url}_${method}_${JSON.stringify(data)}_${timestamp}_${this.ENCRYPTION_KEY}`
    return this.hashString(signatureData)
  }

  /**
   * 对字符串进行哈希处理
   * @param {string} str - 输入字符串
   * @returns {string} 哈希值
   */
  hashString(str) {
    // 简单的哈希方法，实际项目中应该使用更安全的哈希算法
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(16)
  }

  /**
   * 安全的JSON解析
   * @param {string} jsonString - JSON字符串
   * @param {any} defaultValue - 默认值
   * @returns {any} 解析结果或默认值
   */
  safeJsonParse(jsonString, defaultValue = null) {
    try {
      return JSON.parse(jsonString)
    } catch (error) {

      return defaultValue
    }
  }

  /**
   * 安全的本地存储操作
   * @param {string} operation - 操作类型：set, get, remove
   * @param {string} key - 存储键
   * @param {any} [value] - 存储值
   * @returns {any} 操作结果
   */
  safeStorageOperation(operation, key, value) {
    try {
      switch (operation) {
      case 'set':
        wx.setStorageSync(key, value)
        return true
      case 'get':
        return wx.getStorageSync(key)
      case 'remove':
        wx.removeStorageSync(key)
        return true
      default:
        return false
      }
    } catch (error) {

      return operation === 'get' ? null : false
    }
  }
}

// 导出单例实例
const securityManager = new SecurityManager()

module.exports = {
  SecurityManager,
  securityManager
}