/**
 * 存储管理器
 * 用于管理不同身份的存储空间，实现数据存储隔离
 */
// 导入加密管理器
const { cryptoManager } = require('./cryptoManager')

class StorageManager {
  /**
   * 构造函数
   * @param {object} identityContextManager - 身份上下文管理器
   */
  constructor(identityContextManager) {
    this.identityContextManager = identityContextManager
    this.cryptoManager = cryptoManager // 加密管理器
    this.sensitiveKeys = ['userInfo', 'userSig', 'token', 'password', 'phone', 'email'] // 敏感键列表
    this.defaultPrefix = 'default_' // 默认存储前缀
  }

  /**
   * 获取当前身份的存储前缀
   * @returns {string} 存储前缀
   */
  getCurrentStoragePrefix() {
    const currentContext = this.identityContextManager.getCurrentContext()
    if (currentContext) {
      return currentContext.storageInfo.prefix
    }
    return this.defaultPrefix
  }

  /**
   * 获取特定身份的存储前缀
   * @param {string} roleType - 身份类型
   * @returns {string} 存储前缀
   */
  getStoragePrefix(roleType) {
    const context = this.identityContextManager.getContext(roleType)
    if (context) {
      return context.storageInfo.prefix
    }
    return `${roleType}_`
  }

  /**
   * 构建带前缀的存储键
   * @param {string} key - 原始存储键
   * @param {string} [prefix] - 存储前缀（可选，默认使用当前身份的前缀）
   * @returns {string} 带前缀的存储键
   */
  buildStorageKey(key, prefix = null) {
    if (!key) {
      console.error('构建存储键失败：键名无效')
      return null
    }

    const storagePrefix = prefix || this.getCurrentStoragePrefix()
    return `${storagePrefix}${key}`
  }

  /**
   * 检查键是否为敏感键
   * @private
   * @param {string} key - 存储键
   * @returns {boolean} 是否为敏感键
   */
  _isSensitiveKey(key) {
    return this.sensitiveKeys.some(sensitiveKey => key.includes(sensitiveKey))
  }

  /**
   * 同步存储数据
   * @param {string} key - 存储键
   * @param {any} value - 存储值
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @param {boolean} [encrypt] - 是否加密存储（可选，默认根据键名判断）
   * @returns {boolean} 是否存储成功
   */
  setStorageSync(key, value, roleType = null, encrypt = null) {
    if (!key) {
      console.error('存储数据失败：键名无效')
      return false
    }

    try {
      const prefix = roleType ? this.getStoragePrefix(roleType) : null
      const storageKey = this.buildStorageKey(key, prefix)
      
      if (!storageKey) {
        return false
      }

      // 决定是否加密存储
      const shouldEncrypt = encrypt !== null ? encrypt : this._isSensitiveKey(key)
      
      // 加密敏感数据
      let storageValue = value
      if (shouldEncrypt) {
        storageValue = this.cryptoManager.encrypt(value)
        if (storageValue === null) {
          console.error('加密数据失败：', key)
          return false
        }
      }

      wx.setStorageSync(storageKey, storageValue)
      return true
    } catch (error) {
      console.error('同步存储数据失败：', error)
      return false
    }
  }

  /**
   * 异步存储数据
   * @param {string} key - 存储键
   * @param {any} value - 存储值
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @param {boolean} [encrypt] - 是否加密存储（可选，默认根据键名判断）
   * @returns {Promise<boolean>} 是否存储成功
   */
  setStorage(key, value, roleType = null, encrypt = null) {
    return new Promise((resolve) => {
      if (!key) {
        console.error('存储数据失败：键名无效')
        resolve(false)
        return
      }

      try {
        const prefix = roleType ? this.getStoragePrefix(roleType) : null
        const storageKey = this.buildStorageKey(key, prefix)
        
        if (!storageKey) {
          resolve(false)
          return
        }

        // 决定是否加密存储
        const shouldEncrypt = encrypt !== null ? encrypt : this._isSensitiveKey(key)
        
        // 加密敏感数据
        let storageValue = value
        if (shouldEncrypt) {
          storageValue = this.cryptoManager.encrypt(value)
          if (storageValue === null) {
            console.error('加密数据失败：', key)
            resolve(false)
            return
          }
        }

        wx.setStorage({
          key: storageKey,
          data: storageValue,
          success: () => resolve(true),
          fail: (error) => {
            console.error('异步存储数据失败：', error)
            resolve(false)
          }
        })
      } catch (error) {
        console.error('异步存储数据失败：', error)
        resolve(false)
      }
    })
  }

  /**
   * 同步获取数据
   * @param {string} key - 存储键
   * @param {any} [defaultValue] - 默认值（可选）
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @param {boolean} [decrypt] - 是否解密数据（可选，默认根据键名判断）
   * @returns {any} 存储值或默认值
   */
  getStorageSync(key, defaultValue = null, roleType = null, decrypt = null) {
    if (!key) {
      console.error('获取数据失败：键名无效')
      return defaultValue
    }

    try {
      const prefix = roleType ? this.getStoragePrefix(roleType) : null
      const storageKey = this.buildStorageKey(key, prefix)
      
      if (!storageKey) {
        return defaultValue
      }

      const value = wx.getStorageSync(storageKey)
      if (value === undefined || value === '') {
        return defaultValue
      }

      // 决定是否解密数据
      const shouldDecrypt = decrypt !== null ? decrypt : this._isSensitiveKey(key)
      
      // 解密敏感数据
      if (shouldDecrypt) {
        const decryptedValue = this.cryptoManager.decrypt(value)
        return decryptedValue !== null ? decryptedValue : defaultValue
      }

      return value
    } catch (error) {
      console.error('同步获取数据失败：', error)
      return defaultValue
    }
  }

  /**
   * 异步获取数据
   * @param {string} key - 存储键
   * @param {any} [defaultValue] - 默认值（可选）
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @param {boolean} [decrypt] - 是否解密数据（可选，默认根据键名判断）
   * @returns {Promise<any>} 存储值或默认值
   */
  getStorage(key, defaultValue = null, roleType = null, decrypt = null) {
    return new Promise((resolve) => {
      if (!key) {
        console.error('获取数据失败：键名无效')
        resolve(defaultValue)
        return
      }

      try {
        const prefix = roleType ? this.getStoragePrefix(roleType) : null
        const storageKey = this.buildStorageKey(key, prefix)
        
        if (!storageKey) {
          resolve(defaultValue)
          return
        }

        wx.getStorage({
          key: storageKey,
          success: (res) => {
            const value = res.data
            if (value === undefined || value === '') {
              resolve(defaultValue)
              return
            }

            // 决定是否解密数据
            const shouldDecrypt = decrypt !== null ? decrypt : this._isSensitiveKey(key)
            
            // 解密敏感数据
            if (shouldDecrypt) {
              const decryptedValue = this.cryptoManager.decrypt(value)
              resolve(decryptedValue !== null ? decryptedValue : defaultValue)
              return
            }

            resolve(value)
          },
          fail: () => {
            resolve(defaultValue)
          }
        })
      } catch (error) {
        console.error('异步获取数据失败：', error)
        resolve(defaultValue)
      }
    })
  }

  /**
   * 同步删除数据
   * @param {string} key - 存储键
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @returns {boolean} 是否删除成功
   */
  removeStorageSync(key, roleType = null) {
    if (!key) {
      console.error('删除数据失败：键名无效')
      return false
    }

    try {
      const prefix = roleType ? this.getStoragePrefix(roleType) : null
      const storageKey = this.buildStorageKey(key, prefix)
      
      if (!storageKey) {
        return false
      }

      wx.removeStorageSync(storageKey)
      return true
    } catch (error) {
      console.error('同步删除数据失败：', error)
      return false
    }
  }

  /**
   * 异步删除数据
   * @param {string} key - 存储键
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @returns {Promise<boolean>} 是否删除成功
   */
  removeStorage(key, roleType = null) {
    return new Promise((resolve) => {
      if (!key) {
        console.error('删除数据失败：键名无效')
        resolve(false)
        return
      }

      try {
        const prefix = roleType ? this.getStoragePrefix(roleType) : null
        const storageKey = this.buildStorageKey(key, prefix)
        
        if (!storageKey) {
          resolve(false)
          return
        }

        wx.removeStorage({
          key: storageKey,
          success: () => resolve(true),
          fail: (error) => {
            console.error('异步删除数据失败：', error)
            resolve(false)
          }
        })
      } catch (error) {
        console.error('异步删除数据失败：', error)
        resolve(false)
      }
    })
  }

  /**
   * 清除当前身份的所有存储数据
   * @returns {boolean} 是否清除成功
   */
  clearStorageSync() {
    const currentPrefix = this.getCurrentStoragePrefix()
    return this.clearStorageByPrefixSync(currentPrefix)
  }

  /**
   * 清除特定身份的所有存储数据
   * @param {string} roleType - 身份类型
   * @returns {boolean} 是否清除成功
   */
  clearStorageByRoleSync(roleType) {
    const prefix = this.getStoragePrefix(roleType)
    return this.clearStorageByPrefixSync(prefix)
  }

  /**
   * 根据前缀清除存储数据
   * @param {string} prefix - 存储前缀
   * @returns {boolean} 是否清除成功
   */
  clearStorageByPrefixSync(prefix) {
    try {
      const keys = wx.getStorageInfoSync().keys
      keys.forEach(key => {
        if (key.startsWith(prefix)) {
          wx.removeStorageSync(key)
        }
      })
      return true
    } catch (error) {
      console.error('清除存储数据失败：', error)
      return false
    }
  }

  /**
   * 获取当前身份的所有存储键
   * @returns {array} 存储键数组
   */
  getCurrentStorageKeys() {
    const currentPrefix = this.getCurrentStoragePrefix()
    return this.getStorageKeysByPrefix(currentPrefix)
  }

  /**
   * 获取特定身份的所有存储键
   * @param {string} roleType - 身份类型
   * @returns {array} 存储键数组
   */
  getStorageKeysByRole(roleType) {
    const prefix = this.getStoragePrefix(roleType)
    return this.getStorageKeysByPrefix(prefix)
  }

  /**
   * 根据前缀获取存储键
   * @param {string} prefix - 存储前缀
   * @returns {array} 存储键数组
   */
  getStorageKeysByPrefix(prefix) {
    try {
      const keys = wx.getStorageInfoSync().keys
      return keys
        .filter(key => key.startsWith(prefix))
        .map(key => key.substring(prefix.length)) // 移除前缀
    } catch (error) {
      console.error('获取存储键失败：', error)
      return []
    }
  }

  /**
   * 批量存储数据
   * @param {object} keyValuePairs - 键值对对象
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @returns {boolean} 是否存储成功
   */
  batchSetStorageSync(keyValuePairs, roleType = null) {
    if (!keyValuePairs || typeof keyValuePairs !== 'object') {
      console.error('批量存储数据失败：参数无效')
      return false
    }

    let successCount = 0
    const totalCount = Object.keys(keyValuePairs).length

    Object.entries(keyValuePairs).forEach(([key, value]) => {
      if (this.setStorageSync(key, value, roleType)) {
        successCount++
      }
    })

    return successCount === totalCount
  }

  /**
   * 批量获取数据
   * @param {array} keys - 存储键数组
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @returns {object} 键值对对象
   */
  batchGetStorageSync(keys, roleType = null) {
    if (!Array.isArray(keys)) {
      console.error('批量获取数据失败：参数无效')
      return {}
    }

    const result = {}
    keys.forEach(key => {
      result[key] = this.getStorageSync(key, undefined, roleType)
    })

    return result
  }

  /**
   * 批量删除数据
   * @param {array} keys - 存储键数组
   * @param {string} [roleType] - 身份类型（可选，默认使用当前身份）
   * @returns {boolean} 是否删除成功
   */
  batchRemoveStorageSync(keys, roleType = null) {
    if (!Array.isArray(keys)) {
      console.error('批量删除数据失败：参数无效')
      return false
    }

    let successCount = 0
    const totalCount = keys.length

    keys.forEach(key => {
      if (this.removeStorageSync(key, roleType)) {
        successCount++
      }
    })

    return successCount === totalCount
  }

  /**
   * 检查存储是否可用
   * @returns {boolean} 存储是否可用
   */
  isStorageAvailable() {
    try {
      const testKey = `test_${Date.now()}`
      wx.setStorageSync(testKey, 'test')
      wx.removeStorageSync(testKey)
      return true
    } catch (error) {
      console.error('存储不可用：', error)
      return false
    }
  }

  /**
   * 获取存储使用情况
   * @returns {object} 存储使用情况
   */
  getStorageInfoSync() {
    try {
      const info = wx.getStorageInfoSync()
      const currentPrefix = this.getCurrentStoragePrefix()
      const currentKeys = this.getStorageKeysByPrefix(currentPrefix)
      
      return {
        ...info,
        currentPrefix,
        currentKeysCount: currentKeys.length,
        currentKeys
      }
    } catch (error) {
      console.error('获取存储使用情况失败：', error)
      return null
    }
  }
}

// 导出模块
module.exports = StorageManager
