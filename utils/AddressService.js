const CACHE_KEY = 'address_cache'
const CACHE_EXPIRY = 5 * 60 * 1000

const AddressService = {
  async call(action, data = {}) {
    const res = await wx.cloud.callFunction({
      name: 'userService',
      data: { action, ...data },
      timeout: 20000,
    })
    return res.result
  },

  _getCache() {
    try {
      const cached = wx.getStorageSync(CACHE_KEY)
      if (cached && cached.timestamp && Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return cached.data
      }
    } catch (e) {
      console.warn('[AddressService] _getCache failed:', e)
    }
    return null
  },

  _setCache(data) {
    try {
      wx.setStorageSync(CACHE_KEY, { data, timestamp: Date.now() })
    } catch (e) {
      console.warn('[AddressService] _setCache failed:', e)
    }
  },

  _clearCache() {
    try {
      wx.removeStorageSync(CACHE_KEY)
    } catch (e) {
      console.warn('[AddressService] _clearCache failed:', e)
    }
  },

  async getList(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this._getCache()
      if (cached) {return { code: 0, data: cached }}
    }

    try {
      const result = await this.call('addressList')
      if (result && result.code === 0) {
        this._setCache(result.data)
      }
      return result
    } catch (e) {
      const cached = this._getCache()
      if (cached) {return { code: 0, data: cached }}
      return { code: 9999, data: [], message: '获取地址列表失败' }
    }
  },

  async add(address) {
    const result = await this.call('addressAdd', { address })
    if (result && result.code === 0) {
      this._clearCache()
    }
    return result
  },

  async update(addressId, address) {
    const result = await this.call('addressUpdate', { addressId, address })
    if (result && result.code === 0) {
      this._clearCache()
    }
    return result
  },

  async remove(addressId) {
    const result = await this.call('addressRemove', { addressId })
    if (result && result.code === 0) {
      this._clearCache()
    }
    return result
  },

  async setDefault(addressId) {
    const result = await this.call('addressSetDefault', { addressId })
    if (result && result.code === 0) {
      this._clearCache()
    }
    return result
  },

  async getDefault() {
    const result = await this.getList()
    if (result && result.code === 0 && result.data) {
      return result.data.find(item => item.isDefault) || result.data[0] || null
    }
    return null
  },
}

module.exports = { AddressService }
