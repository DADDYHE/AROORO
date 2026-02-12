/**
 * 缓存工具类
 * 用于管理小程序本地缓存，提供数据缓存、读取、删除等功能
 */

class CacheUtil {
  /**
   * 设置缓存
   * @param {string} key - 缓存键名
   * @param {any} value - 缓存值
   * @param {number} expire - 过期时间（秒），默认7天
   */
  static set(key, value, expire = 60 * 60 * 24 * 7) {
    try {
      const data = {
        value,
        expire: Date.now() + expire * 1000
      }
      wx.setStorageSync(key, data)
      return true
    } catch (error) {
      console.error('设置缓存失败:', error)
      return false
    }
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键名
   * @param {any} defaultValue - 默认值，当缓存不存在或过期时返回
   * @returns {any} 缓存值或默认值
   */
  static get(key, defaultValue = null) {
    try {
      const data = wx.getStorageSync(key)
      if (!data) {
        return defaultValue
      }
      
      // 检查是否过期
      if (Date.now() > data.expire) {
        this.remove(key)
        return defaultValue
      }
      
      return data.value
    } catch (error) {
      console.error('获取缓存失败:', error)
      return defaultValue
    }
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键名
   * @returns {boolean} 是否删除成功
   */
  static remove(key) {
    try {
      wx.removeStorageSync(key)
      return true
    } catch (error) {
      console.error('删除缓存失败:', error)
      return false
    }
  }

  /**
   * 清空所有缓存
   * @returns {boolean} 是否清空成功
   */
  static clear() {
    try {
      wx.clearStorageSync()
      return true
    } catch (error) {
      console.error('清空缓存失败:', error)
      return false
    }
  }

  /**
   * 检查缓存是否存在且未过期
   * @param {string} key - 缓存键名
   * @returns {boolean} 是否存在且未过期
   */
  static has(key) {
    try {
      const data = wx.getStorageSync(key)
      if (!data) {
        return false
      }
      return Date.now() <= data.expire
    } catch (error) {
      console.error('检查缓存失败:', error)
      return false
    }
  }
}

module.exports = CacheUtil