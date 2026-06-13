const { qqMapKey } = require('../config/env.js')

const REVERSE_GEOCACHE = {}

function getCacheKey(latitude, longitude) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`
}

function formatAddress(result) {
  if (!result || !result.address) {
    return ''
  }

  const addressComponents = result.address_components || {}

  const parts = []
  if (addressComponents.province) {parts.push(addressComponents.province)}
  if (addressComponents.city && addressComponents.city !== addressComponents.province) {
    parts.push(addressComponents.city)
  }
  if (addressComponents.district) {parts.push(addressComponents.district)}

  const formatted = parts.join('')

  const poiName = result.formatted_addresses?.poi || ''
  if (poiName && poiName !== formatted) {
    return `${formatted}${poiName}`
  }

  return formatted || result.address
}

function reverseGeocode({ latitude, longitude, success, fail }) {
  if (!latitude || !longitude) {
    const error = new Error('经纬度参数不能为空')
    console.warn('[reverseGeocode]', error.message)
    if (typeof fail === 'function') {
      fail(error)
    }
    return
  }

  if (!qqMapKey) {
    const error = new Error('QQ Map Key 未配置')
    console.warn('[reverseGeocode]', error.message)
    if (typeof fail === 'function') {
      fail(error)
    }
    return
  }

  const cacheKey = getCacheKey(latitude, longitude)
  if (REVERSE_GEOCACHE[cacheKey]) {
    if (typeof success === 'function') {
      success(REVERSE_GEOCACHE[cacheKey])
    }
    return
  }

  wx.request({
    url: 'https://apis.map.qq.com/ws/geocoder/v1/',
    data: {
      location: `${latitude},${longitude}`,
      key: qqMapKey,
      get_poi: 1,
    },
    success(res) {
      if (res.statusCode === 200 && res.data && res.data.status === 0 && res.data.result) {
        const result = res.data.result

        let province = result.address_components?.province || ''
        let city = result.address_components?.city || ''
        let district = result.address_components?.district || ''

        if (!province && result.ad_info) {
          province = result.ad_info.province || ''
          city = result.ad_info.city || ''
          district = result.ad_info.district || ''
        }

        if (!city && result.address) {
          const fullAddress = result.address
          const provinceMatch = fullAddress.match(/(.+?)省/)
          const cityMatch = fullAddress.match(/(.+?)市/)
          if (provinceMatch) {province = `${provinceMatch[1]}省`}
          if (cityMatch) {city = `${cityMatch[1]}市`}
        }

        const address = formatAddress(result)

        const data = {
          address,
          fullAddress: result.address || '',
          province,
          city,
          district,
          poi: result.formatted_addresses?.poi || '',
        }
        REVERSE_GEOCACHE[cacheKey] = data
        if (typeof success === 'function') {
          success(data)
        }
      } else {
        const error = new Error(res.data?.message || '逆地址解析失败')
        if (typeof fail === 'function') {
          fail(error)
        }
      }
    },
    fail(err) {
      const error = new Error(err?.errMsg || '逆地址解析网络请求失败')
      console.warn('[reverseGeocode]', error.message)
      if (typeof fail === 'function') {
        fail(error)
      }
    },
  })
}

function clearCache() {
  Object.keys(REVERSE_GEOCACHE).forEach(key => {
    delete REVERSE_GEOCACHE[key]
  })
}

module.exports = {
  reverseGeocode,
  clearCache,
}
