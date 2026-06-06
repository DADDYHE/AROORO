// 个人中心页面 - 极简画廊风格
const { authService } = require('../../services/AuthService')
const { PetService, ActivityService } = require('../../services/CloudFunctionService')
const { CouponService } = require('../../services/CouponService')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [tabBarSyncBehavior, cloudImageBehavior],
  data: {
    userInfo: {
      nickName: 'AROORO用户',
      avatarUrl: '',
      openid: '',
    },
    stats: {
      petCount: 0,
      activityCount: 0,
      couponCount: 0,
    },
    appVersion: '1.0.0',
    isHeaderScrolled: false,
    showHostModal: false,
    iconShoppingCart: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/shopping-cart-2-line.svg',
    iconBell: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/bell-line.svg',
    iconDoorOpen: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/door-open-line.svg',
    iconHomeHeart: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/home-heart-line.svg',
  },

  onLoad() {
    this.getUserInfo()
  },

  onShow() {
    this._syncTabBar()
    this.getUserInfo()
    this._refreshPartnerStatus()
  },

  _onSessionRestored() {
    this.getUserInfo()
  },

  onHide() {
  },

  onUnload() {
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
          petCount: 0,
          activityCount: 0,
          couponCount: 0,
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
      const res = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'checkAdminStatus' },
        timeout: 20000,
      })
      if (res.result && res.result.code === 0 && res.result.data) {
        const { isPartner } = res.result.data
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
      const result = await ActivityService.getMyRegisteredActivities({ page: 1, pageSize: 1, status: 'confirmed' })
      if (result && result.code === 0 && result.data) {
        this.setData({ 'stats.activityCount': result.data.total || 0 })
      }
    } catch (error) {
      console.error('[profile] _fetchActivityCount:', error)
    }
  },

  async _fetchCouponCount() {
    try {
      const result = await CouponService.getMyCoupons({ status: 'unused', page: 1, pageSize: 1 })
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
    this.showModal({ titleKey: 'BIZ_IIFI5W', contentKey: 'BIZ_19HBY7L' })
  },

  onPageScroll(e) {
    const isScrolled = e.scrollTop > 10
    if (isScrolled !== this.data.isHeaderScrolled) {
      this.setData({ isHeaderScrolled: isScrolled })
    }
  },
})
