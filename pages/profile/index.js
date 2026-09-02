const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
// 个人中心页面 - 极简画廊风格
const { authService } = require('../../services/AuthService')
const { PetService, ActivityService, CloudFunctionService } = require('../../services/CloudFunctionService')
const { CouponService } = require('../../services/CouponService')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')

const pageI18n = require('../../utils/page-i18n.js')
const { CLOUD_ICONS } = require('../../utils/cloudIcons')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, tabBarSyncBehavior, cloudImageBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    userInfo: {
      nickName: 'AROORO用户',
      avatarUrl: '',
      openid: '',
    },
    stats: {
      petCount: '-',
      activityCount: '-',
      couponCount: '-',
    },
    appVersion: '1.0.0',
    isHeaderScrolled: false,
    showHostModal: false,
    iconShoppingCart: CLOUD_ICONS.SHOPPING_CART,
    iconBell: CLOUD_ICONS.BELL,
    iconDoorOpen: CLOUD_ICONS.DOOR_OPEN,
    iconHomeHeart: CLOUD_ICONS.HOME_HEART,
  },

  onLoad() {
    this._initNavbarHeight()
    this.getUserInfo()
  },

  onShow() {
    this._syncTabBar()
    this.getUserInfo()
    // 性能优化（2026-09-01）：30s 节流——partner 状态为低频变化数据，tab 切回时不重复裸调用
    // 3 个统计计数由 getUserInfo 触发，已各自带缓存兜底（pet/activity 走 get() 5min、coupon 30s）
    const now = Date.now()
    if (this._lastPartnerCheckAt && now - this._lastPartnerCheckAt < 30000) { return }
    this._lastPartnerCheckAt = now
    this._refreshPartnerStatus()
  },

  _onSessionRestored() {
    this.getUserInfo()
    this._lastPartnerCheckAt = 0 // 登录回跳强制刷新一次
    this._refreshPartnerStatus()
  },

  async getUserInfo() {
    const isLoggedIn = authService.isLoggedIn()
    const globalUserInfo = authService.getCurrentIdentity()

    if (isLoggedIn && globalUserInfo) {
      const avatarUrl = globalUserInfo.avatarUrl || ''

      this.setData({
        userInfo: {
          nickName: globalUserInfo.nickName || 'AROORO用户',
          avatarUrl,
          openid: globalUserInfo._id || '',
          isHost: Boolean(globalUserInfo.isHost),
          hasPhone: Boolean(globalUserInfo.hasPhone),
          isPartner: Boolean(globalUserInfo.isPartner) || Boolean(globalUserInfo.permissions?.length),
        },
        stats: {
          petCount: '-',
          activityCount: '-',
          couponCount: '-',
        },
      })
      this._fetchPetCount()
      this._fetchActivityCount()
      this._fetchCouponCount()
      return
    }

    this.setData({
      userInfo: {
        nickName: 'AROORO用户',
        avatarUrl: '',
        openid: '',
      },
      stats: {
        petCount: 0,
        orderCount: 0,
        couponCount: 0,
      },
    })
  },

  async _refreshPartnerStatus() {
    try {
      // 性能优化（2026-09-01）：裸 wx.cloud.callFunction 改走 Service 层统一入口，
      // 获得 30s 缓存能力（partner 状态为低频变化数据，节流 + 缓存双保险）
      const res = await CloudFunctionService.call('userService', { action: 'checkAdminStatus' }, { useCache: true, cacheTime: 30000 })
      if (res && res.code === 0 && res.data) {
        const { isPartner } = res.data
        if (this.data.userInfo.isPartner !== Boolean(isPartner)) {
          this.setData({ 'userInfo.isPartner': Boolean(isPartner) })
          const app = getApp()
          if (app.globalData.userInfo) {
            app.globalData.userInfo.isPartner = Boolean(isPartner)
          }
          const cached = wx.getStorageSync(require('../../config/storageKeys').USER_INFO)
          if (cached) {
            cached.isPartner = Boolean(isPartner)
            wx.setStorageSync(require('../../config/storageKeys').USER_INFO, cached)
          }
        }
      }
    } catch (e) {
      console.warn('[profile] 刷新合作伙伴状态失败:', e.message)
    }
  },

  async _fetchPetCount() {
    try {
      const result = await PetService.getPetList({ page: 1, pageSize: 1 })
      if (result && result.code === 0 && result.data) {
        this.setData({ 'stats.petCount': result.data.total || 0 })
      }
    } catch (error) {
      console.error('[profile] _fetchPetCount:', error)
    }
  },

  async _fetchActivityCount() {
    try {
      const result = await ActivityService.getMyRegisteredActivities({ page: 1, pageSize: 1, status: 'all' })
      if (result && result.code === 0 && result.data) {
        this.setData({ 'stats.activityCount': result.data.total || 0 })
      }
    } catch (error) {
      console.error('[profile] _fetchActivityCount:', error)
    }
  },

  async _fetchCouponCount() {
    try {
      // 性能优化（2026-09-01）：30s 缓存，tab 切回避免重复云调用
      const result = await CouponService.getMyCoupons({ status: 'unused', page: 1, pageSize: 1 }, { useCache: true, cacheTime: 30000 })
      if (result && result.code === 0 && result.data) {
        this.setData({ 'stats.couponCount': result.data.total || 0 })
      }
    } catch (error) {
      console.error('[profile] _fetchCouponCount:', error)
    }
  },

  onMyPets() {
    wx.navigateTo({ url: '/subpackages/pet/list' })
  },

  onMyActivities() {
    wx.navigateTo({ url: '/subpackages/activity/my-registered' })
  },

  onMyFavorites() {
    wx.navigateTo({ url: '/subpackages/other/favorites/index' })
  },

  onMyCoupons() {
    wx.navigateTo({ url: '/subpackages/coupon/my-coupons' })
  },

  onActivityOrders() {
    wx.navigateTo({ url: '/subpackages/profile/order-stats/index?type=activity' })
  },

  onServiceOrders() {
    wx.navigateTo({ url: '/subpackages/profile/order-stats/index?type=service' })
  },

  onGroupOrders() {
    wx.navigateTo({ url: '/subpackages/profile/order-stats/index?type=group' })
  },

  onHostingOrders() {
    wx.navigateTo({ url: '/subpackages/profile/order-stats/index?type=boarding' })
  },

  onMallOrders() {
    wx.navigateTo({ url: '/subpackages/profile/order-stats/index?type=mall' })
  },

  onPartnerTap() {
    wx.navigateTo({ url: '/subpackages/partner/home/index' })
  },

  onHostApply() {
    this.setData({ showHostModal: true })
  },

  onCloseHostModal() {
    this.setData({ showHostModal: false })
  },

  onMakeCall() {
    this.setData({ showHostModal: false })
    const appConfig = require('../../config')
    const phone = appConfig.customerServicePhone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    } else {
      this.error('SUPPORT_PHONE_MISSING')
    }
  },

  onPersonalInfo() {
    wx.navigateTo({ url: '/subpackages/profile/edit/index' })
  },

  onPrivacySettings() {
    wx.navigateTo({ url: '/subpackages/profile/privacy/privacy' })
  },

  onNotificationSettings() {
    wx.navigateTo({ url: '/subpackages/profile/notification/list' })
  },

  onHelpCenter() {
    wx.navigateTo({ url: '/subpackages/profile/about/about' })
  },

  onAboutUs() {
    wx.navigateTo({ url: '/subpackages/profile/about/about' })
  },

  onLogout() {
    this.showModal({
      titleKey: 'BIZ_IIFI5W',
      contentKey: 'BIZ_19HBY7L',
      success: (confirmed) => {
        if (!confirmed) {return}
        this._doLogout()
      },
    })
  },

  async _doLogout() {
    try {
      const res = await authService.logout()
      this.toast('LOGOUT_SUCCESS')
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/home/index' })
      }, 800)
    } catch (err) {
      this.error('LOGOUT_FAILED')
    }
  },

  onPageScroll(e) {
    const isScrolled = e.scrollTop > 10
    if (isScrolled !== this.data.isHeaderScrolled) {
      this.setData({ isHeaderScrolled: isScrolled })
    }
  },
})
