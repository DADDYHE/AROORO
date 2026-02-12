/**
 * 请求缓存管理器
 * 用于缓存网络请求结果，减少重复请求，提升性能
 */

class RequestCacheManager {
  constructor() {
    this.cache = new Map() // 请求缓存
    this.pendingRequests = new Map() // 正在进行的请求
    this.CACHE_EXPIRY = 5 * 60 * 1000 // 缓存过期时间（5分钟）
    this.MAX_CACHE_SIZE = 100 // 最大缓存数量
  }

  /**
   * 生成请求缓存键
   * @param {string} url - 请求URL
   * @param {object} params - 请求参数
   * @returns {string} 缓存键
   */
  generateCacheKey(url, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((obj, key) => {
        obj[key] = params[key]
        return obj
      }, {})
    return `${url}_${JSON.stringify(sortedParams)}`
  }

  /**
   * 缓存请求结果
   * @param {string} key - 缓存键
   * @param {any} data - 请求结果
   * @param {number} [customExpiry] - 自定义过期时间（毫秒）
   */
  setCache(key, data, customExpiry) {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // 缓存达到上限，移除最早的缓存
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + (customExpiry || this.CACHE_EXPIRY)
    })
  }

  /**
   * 获取缓存结果
   * @param {string} key - 缓存键
   * @returns {any|null} 缓存结果或null
   */
  getCache(key) {
    const cached = this.cache.get(key)
    if (!cached) {
      return null
    }

    // 检查缓存是否过期
    if (Date.now() > cached.expiry) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  /**
   * 清除缓存
   * @param {string} [key] - 缓存键，不提供则清除所有缓存
   */
  clearCache(key) {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }

  /**
   * 执行缓存请求
   * @param {string} url - 请求URL
   * @param {object} options - 请求选项
   * @param {boolean} [useCache=true] - 是否使用缓存
   * @returns {Promise<any>} 请求结果
   */
  async request(url, options = {}, useCache = true) {
    const cacheKey = this.generateCacheKey(url, options.params || {})

    // 检查是否有缓存
    if (useCache) {
      const cachedData = this.getCache(cacheKey)
      if (cachedData) {
        console.log('使用缓存数据:', cacheKey)
        return cachedData
      }
    }

    // 检查是否有相同的请求正在进行
    if (this.pendingRequests.has(cacheKey)) {
      console.log('等待正在进行的请求:', cacheKey)
      return this.pendingRequests.get(cacheKey)
    }

    // 创建新的请求
    const requestPromise = this._performRequest(url, options)
      .then(data => {
        // 缓存请求结果
        if (useCache) {
          this.setCache(cacheKey, data)
        }
        return data
      })
      .finally(() => {
        // 请求完成后从pending中移除
        this.pendingRequests.delete(cacheKey)
      })

    // 记录正在进行的请求
    this.pendingRequests.set(cacheKey, requestPromise)

    return requestPromise
  }

  /**
   * 执行实际的网络请求
   * @private
   * @param {string} url - 请求URL
   * @param {object} options - 请求选项
   * @returns {Promise<any>} 请求结果
   */
  async _performRequest(url, options = {}) {
    console.log('执行网络请求:', url)
    
    // 这里可以根据实际情况实现不同的请求方式
    // 例如：wx.request、wx.cloud.callFunction等
    
    if (url.startsWith('cloud://')) {
      // 云存储请求
      return this._performCloudStorageRequest(url, options)
    } else if (url.includes('cloud.function:')) {
      // 云函数请求
      const functionName = url.replace('cloud.function:', '')
      return this._performCloudFunctionRequest(functionName, options)
    } else {
      // 普通HTTP请求
      return this._performHttpRequest(url, options)
    }
  }

  /**
   * 执行HTTP请求
   * @private
   * @param {string} url - 请求URL
   * @param {object} options - 请求选项
   * @returns {Promise<any>} 请求结果
   */
  async _performHttpRequest(url, options = {}) {
    // 获取本地存储的token
    const token = wx.getStorageSync('token')
    
    // 创建请求头
    const header = {
      ...options.header || {},
      'Content-Type': 'application/json'
    }
    
    // 如果有token，添加到请求头
    if (token) {
      header['Authorization'] = `Bearer ${token}`
    }

    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method: options.method || 'GET',
        data: options.data || options.params || {},
        header: header,
        success: res => {
          if (res.statusCode === 200) {
            resolve(res.data)
          } else {
            reject(new Error(`HTTP error ${res.statusCode}: ${res.errMsg}`))
          }
        },
        fail: error => {
          reject(error)
        }
      })
    })
  }

  /**
   * 执行云函数请求
   * @private
   * @param {string} functionName - 云函数名称
   * @param {object} options - 请求选项
   * @returns {Promise<any>} 请求结果
   */
  async _performCloudFunctionRequest(functionName, options = {}) {
    // 获取本地存储的token
    const token = wx.getStorageSync('token')
    
    // 创建请求数据
    const data = {
      ...options.data || options.params || {},
    }
    
    // 如果有token，添加到请求数据中
    if (token) {
      data.token = token
    }

    const res = await wx.cloud.callFunction({
      name: functionName,
      data: data
    })
    return res.result
  }

  /**
   * 执行云存储请求
   * @private
   * @param {string} fileID - 云存储文件ID
   * @returns {Promise<any>} 请求结果
   */
  async _performCloudStorageRequest(fileID) {
    // 这里可以根据实际需求实现云存储请求
    // 例如：下载文件、获取文件信息等
    return fileID
  }

  /**
   * 批量请求
   * @param {array} requests - 请求配置数组
   * @param {boolean} [useCache=true] - 是否使用缓存
   * @returns {Promise<array>} 请求结果数组
   */
  async batchRequest(requests, useCache = true) {
    const promises = requests.map(({ url, options }) => 
      this.request(url, options, useCache)
    )
    return Promise.all(promises)
  }

  /**
   * 设置缓存过期时间
   * @param {number} expiry - 过期时间（毫秒）
   */
  setCacheExpiry(expiry) {
    this.CACHE_EXPIRY = expiry
  }

  /**
   * 设置最大缓存大小
   * @param {number} size - 最大缓存数量
   */
  setMaxCacheSize(size) {
    this.MAX_CACHE_SIZE = size
  }

  /**
   * 获取缓存状态
   * @returns {object} 缓存状态
   */
  getCacheStatus() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      maxCacheSize: this.MAX_CACHE_SIZE,
      cacheExpiry: this.CACHE_EXPIRY
    }
  }
}

// 导出单例实例
const requestCacheManager = new RequestCacheManager()

module.exports = {
  RequestCacheManager,
  requestCacheManager
}