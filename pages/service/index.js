const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const { reverseGeocode } = require('../../utils/reverseGeocoding')

const pageI18n = require('../../utils/page-i18n.js')
const { buildSharePath } = require('../../utils/share')

Page({
  ...pageI18n.mixin(),
  behaviors: [tabBarSyncBehavior],

  data: {
    city: '',
    locationText: '',
    petTypeText: '',
    petTypes: ['猫咪', '狗狗', '猫咪+狗狗', '其他'],
  },

  onLoad() {
    this.autoLocate()
  },

  autoLocate() {
    wx.getFuzzyLocation({
      success: res => {
        this._resolveCity(res.latitude, res.longitude)
      },
      fail: err => {
        console.warn('[service] getFuzzyLocation fail:', err)
        this._locateByIP()
      },
    })
  },

  _resolveCity(latitude, longitude) {
    reverseGeocode({
      latitude,
      longitude,
      success: data => {
        if (data.city) {
          this.setData({ city: data.city.replace(/市$/, '') })
        } else {
          this.setData({ city: '未知城市' })
        }
      },
      fail: err => {
        console.warn('[service] resolveCity fail:', err)
        this.setData({ city: '定位失败' })
      },
    })
  },

  _locateByIP() {
    const { qqMapKey } = require('../../config/env.js')
    console.log('[service] _locateByIP qqMapKey:', qqMapKey ? '已配置' : '未配置')
    if (!qqMapKey) {
      this.setData({ city: '选择城市' })
      return
    }
    wx.request({
      url: 'https://apis.map.qq.com/ws/location/v1/ip',
      data: { key: qqMapKey, output: 'json' },
      success: res => {
        const data = res.data
        if (data && data.status === 0 && data.result) {
          const adInfo = data.result.ad_info || {}
          if (adInfo.city) {
            this.setData({ city: adInfo.city.replace(/市$/, '') })
          } else if (adInfo.province) {
            this.setData({ city: adInfo.province.replace(/省$/, '') })
          } else {
            this.setData({ city: '选择城市' })
          }
        } else {
          this.setData({ city: '选择城市' })
        }
      },
      fail: () => {
        this.setData({ city: '选择城市' })
      },
    })
  },

  onShow() {
    this._syncTabBar()
  },

  handleCityTap() {
    this._chooseLocation()
  },

  handleLocationTap() {
    this._chooseLocation()
  },

  handleRelocate() {
    this._chooseLocation()
  },

  _chooseLocation() {
    wx.chooseLocation({
      success: res => {
        if (res.name || res.address) {
          this.setData({
            locationText: res.name || res.address,
          })
        }
        if (res.latitude && res.longitude) {
          reverseGeocode({
            latitude: res.latitude,
            longitude: res.longitude,
            success: data => {
              if (data.city) {
                this.setData({ city: data.city.replace(/市$/, '') })
              }
            },
          })
        }
      },
      fail: () => {
        wx.getSetting({
          success: settingRes => {
            if (!settingRes.authSetting['scope.userFuzzyLocation']) {
              this.showModal({ titleKey: 'BIZ_AJ90BY', contentKey: 'BIZ_PVLULF', confirmText: '去设置' })
            }
          },
        })
      },
    })
  },

  handlePetTypeTap() {
    wx.showActionSheet({
      itemList: this.data.petTypes,
      success: res => {
        this.setData({
          petTypeText: this.data.petTypes[res.tapIndex],
        })
      },
    })
  },

  handleBookTap() {
    if (!this.data.locationText) {
      this.error('SERVICE_LOCATION_REQUIRED')
      return
    }
    wx.navigateTo({
      url: '/subpackages/booking/pet-select?from=service',
    })
  },

  handlePricingTap() {
    wx.navigateTo({
      url: '/subpackages/feeding/service-detail?tab=0',
    })
  },

  handleGuideTap() {
    wx.navigateTo({
      url: '/subpackages/feeding/service-detail?tab=1',
    })
  },

  handleFaqTap() {
    wx.navigateTo({
      url: '/subpackages/feeding/service-detail?tab=2',
    })
  },

  onShareAppMessage() {
    return {
      title: 'AROORO - 宠物服务一站式体验',
      path: buildSharePath('/pages/service/index'),
    }
  },
})
