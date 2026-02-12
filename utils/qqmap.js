// 腾讯位置服务SDK封装
// 文档: https://lbs.qq.com/miniProgram/jsSdk/jsSdkGuide/jsSdkOverview

const QQMapSDK = require('qqmap-wx-jssdk')

// 初始化腾讯地图SDK
const qqmapsdk = new QQMapSDK({
  key: 'Z54BZ-5TUCM-IS76C-6WUX3-ZJJ46-3PF54'
})

const QQMap = {
  /**
   * 获取当前位置
   * @returns {Promise} 返回经纬度和地址信息
   */
  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          const { latitude, longitude } = res
          // 逆地址解析，获取详细地址
          this.reverseGeocode(latitude, longitude)
            .then(addressInfo => {
              resolve({
                latitude,
                longitude,
                ...addressInfo
              })
            })
            .catch(() => {
              // 逆地址解析失败，返回经纬度
              resolve({
                latitude,
                longitude,
                province: '',
                city: '',
                district: '',
                address: ''
              })
            })
        },
        fail: (err) => {
          wx.showModal({
            title: '定位失败',
            content: '请检查定位权限或网络设置',
            showCancel: false
          })
          reject(err)
        }
      })
    })
  },

  /**
   * 逆地址解析（坐标转地址）
   * @param {Number} latitude 纬度
   * @param {Number} longitude 经度
   * @returns {Promise} 返回详细地址信息
   */
  reverseGeocode(latitude, longitude) {
    return new Promise((resolve, reject) => {
      qqmapsdk.reverseGeocode({
        location: {
          latitude,
          longitude
        },
        get_poi: 0,
        success: (res) => {
          const { address_component, formatted_addresses } = res.result
          resolve({
            province: address_component.province,
            city: address_component.city,
            district: address_component.district,
            street: address_component.street,
            address: formatted_addresses.recommend
          })
        },
        fail: (err) => {
          console.error('逆地址解析失败:', err)
          reject(err)
        }
      })
    })
  },

  /**
   * 地址解析（地址转坐标）
   * @param {String} address 地址
   * @returns {Promise} 返回经纬度
   */
  geocode(address) {
    return new Promise((resolve, reject) => {
      qqmapsdk.geocoder({
        address: address,
        success: (res) => {
          const { location } = res.result
          resolve({
            latitude: location.lat,
            longitude: location.lng
          })
        },
        fail: (err) => {
          console.error('地址解析失败:', err)
          reject(err)
        }
      })
    })
  },

  /**
   * 关键词搜索周边
   * @param {String} keyword 搜索关键词
   * @param {Object} location 中心点坐标 {latitude, longitude}
   * @param {Number} radius 搜索半径，单位米
   * @returns {Promise} 返回搜索结果列表
   */
  searchNearby(keyword, location, radius = 1000) {
    return new Promise((resolve, reject) => {
      qqmapsdk.search({
        keyword: keyword,
        location: {
          latitude: location.latitude,
          longitude: location.longitude
        },
        radius: radius,
        page_size: 20,
        success: (res) => {
          const results = res.result.data.map(item => ({
            id: item.id,
            title: item.title,
            address: item.address,
            latitude: item.location.lat,
            longitude: item.location.lng,
            distance: item.distance || 0
          }))
          resolve(results)
        },
        fail: (err) => {
          console.error('周边搜索失败:', err)
          reject(err)
        }
      })
    })
  },

  /**
   * 打开地图选择位置
   * @returns {Promise} 返回选中的位置信息
   */
  chooseLocation() {
    return new Promise((resolve, reject) => {
      wx.chooseLocation({
        success: (res) => {
          resolve({
            name: res.name,
            address: res.address,
            latitude: res.latitude,
            longitude: res.longitude
          })
        },
        fail: (err) => {
          if (err.errMsg.includes('cancel')) {
            // 用户取消选择
            resolve(null)
          } else {
            wx.showToast({
              title: '选择位置失败',
              icon: 'none'
            })
            reject(err)
          }
        }
      })
    })
  },

  /**
   * 计算两地间距离
   * @param {Object} from 起点 {latitude, longitude}
   * @param {Object} to 终点 {latitude, longitude}
   * @returns {Promise} 返回距离（米）
   */
  calculateDistance(from, to) {
    return new Promise((resolve, reject) => {
      qqmapsdk.calculateDistance({
        mode: 'driving', // 驾车距离
        from: {
          latitude: from.latitude,
          longitude: from.longitude
        },
        to: {
          latitude: to.latitude,
          longitude: to.longitude
        },
        success: (res) => {
          const distance = res.result.elements[0].distance
          resolve(distance)
        },
        fail: (err) => {
          console.error('计算距离失败:', err)
          reject(err)
        }
      })
    })
  },

  /**
   * 获取城市列表
   * @returns {Promise} 返回城市列表
   */
  getCityList() {
    return new Promise((resolve, reject) => {
      qqmapsdk.getCityList({
        success: (res) => {
          const cities = res.result[1] // 城市列表
          resolve(cities)
        },
        fail: (err) => {
          console.error('获取城市列表失败:', err)
          reject(err)
        }
      })
    })
  },

  /**
   * 获取指定城市的区县列表
   * @param {String} city 城市名称
   * @returns {Promise} 返回区县列表
   */
  getDistrictByCity(city) {
    return new Promise((resolve, reject) => {
      qqmapsdk.getDistrictByCityId({
        id: city,
        success: (res) => {
          resolve(res.result[0])
        },
        fail: (err) => {
          console.error('获取区县列表失败:', err)
          reject(err)
        }
      })
    })
  }
}

module.exports = QQMap
