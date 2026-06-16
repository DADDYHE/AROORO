const { FeedingService } = require('./services/FeedingService')
const { CouponService } = require('../../services/CouponService')
const { AddressService } = require('../../utils/AddressService')
const { computeFinalAmount } = require('../../utils/coupon-amount')
const couponSelectorBehavior = require('../../behaviors/couponSelectorBehavior')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [couponSelectorBehavior],
  data: {
    feederId: '',
    feeder: null,
    petIds: [],
    startDate: '',
    endDate: '',
    visitTimes: [],
    address: null,
    addressText: '',
    notes: '',
    totalPrice: 0,
    isLoading: true,
    isSubmitting: false,
    showPaymentModal: false,
    orderId: '',

    selectedCouponId: '',
    selectedCoupon: null,
    availableCoupons: [],
    couponDiscount: 0,
    finalPrice: 0,
    showCouponSelector: false,
    loadingCoupons: false,
  },

  onLoad(options) {
    const app = getApp()
    const isLoggedIn = app && app.globalData && app.globalData.isLoggedIn
    if (!isLoggedIn) {
      const { authService } = require('../../services/AuthService')
      authService.startLogin()
      return
    }

    const feederId = options.feederId || ''
    if (!feederId) {
      this.error('INVALID_PARAMS')
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ feederId })
    this._loadFeeder(feederId)
  },

  onShow() {
    const app = getApp()
    const globalAddress = app.globalData.selectedAddress
    if (globalAddress) {
      this.setData({
        address: globalAddress,
        addressText: globalAddress.fullAddress || '',
      })
      app.globalData.selectedAddress = null
    }
  },

  async _loadFeeder(feederId) {
    try {
      const result = await FeedingService.getFeederDetail(feederId)
      if (result && result.code === 0) {
        const feeder = result.data
        const pricePerVisit = Number(feeder.pricePerVisit) || Number(feeder.price) || 0
        const totalPrice = pricePerVisit || 0
        this.setData({
          feeder,
          isLoading: false,
          totalPrice,
          finalPrice: totalPrice,
        })
        this._loadAvailableCoupons()
      } else {
        this.setData({ isLoading: false })
        this.error('LOAD_FAILED')
      }
    } catch (error) {
      this.setData({ isLoading: false })
      this.error('LOAD_FAILED')
    }
  },

  onStartDateChange(e) { this.setData({ startDate: e.detail.value }) },
  onEndDateChange(e) { this.setData({ endDate: e.detail.value }) },
  onChooseAddress() {
    wx.navigateTo({
      url: '/subpackages/other/address/index',
    })
  },
  onAddressSelected(address) {
    if (address) {
      this.setData({
        address,
        addressText: address.fullAddress,
      })
    }
  },
  onNotesInput(e) { this.setData({ notes: e.detail.value }) },

})
