const { FeedingService } = require('./services/FeedingService')
const { CouponService } = require('../../services/CouponService')
const { AddressService } = require('../../utils/AddressService')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
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
        addressText: globalAddress.fullAddress || ''
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

  async _loadAvailableCoupons() {
    const { feeder, totalPrice } = this.data
    if (!feeder || !totalPrice) return

    this.setData({ loadingCoupons: true })
    try {
      const result = await CouponService.getAvailableCoupons({
        business: 'feeding',
        items: feeder._id ? [feeder._id] : [],
        amount: totalPrice,
      })
      if (result && result.code === 0) {
        this.setData({ availableCoupons: result.data || [] })
      }
    } catch (e) {
      console.warn('[feeding-confirm] 优惠券列表加载失败:', e)
    } finally {
      this.setData({ loadingCoupons: false })
    }
  },

  onToggleCouponSelector() {
    this.setData({ showCouponSelector: !this.data.showCouponSelector })
  },

  onSelectCoupon(e) {
    const { id, amount } = e.currentTarget.dataset
    const coupon = this.data.availableCoupons.find(c => c._id === id)
    if (!coupon) return

    const discountAmount = parseFloat(amount)
    const finalPrice = Math.max(0, Math.round((this.data.totalPrice - discountAmount) * 100) / 100)

    this.setData({
      selectedCouponId: id, selectedCoupon, couponDiscount: discountAmount,
      finalPrice, showCouponSelector: false,
    })
  },

  onRemoveCoupon() {
    this.setData({
      selectedCouponId: '', selectedCoupon: null,
      couponDiscount: 0, finalPrice: this.data.totalPrice,
    })
  },

  onSubmit() {
    const { feeder, startDate, endDate, address } = this.data
    if (!startDate || !endDate) {
      this.error('DATE_REQUIRED'); return
    }
    if (!address) {
      this.error('ADDRESS_REQUIRED'); return
    }

    const pricePerVisit = Number(feeder.pricePerVisit) || Number(feeder.price) || 0
    const estimatedTotal = pricePerVisit || 0
    this.setData({ totalPrice: estimatedTotal, finalPrice: this.data.selectedCouponId ? this.data.finalPrice : estimatedTotal, showPaymentModal: true })
  },

  onClosePaymentModal() {
    this.setData({ showPaymentModal: false })
  },

  async onConfirmPayment() {
    const { feederId, startDate, endDate, address, notes, totalPrice, selectedCouponId, couponDiscount, finalPrice } = this.data

    this.setData({ isSubmitting: true })

    let lockedCouponId = null
    const orderId = `feed_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

    try {
      if (selectedCouponId) {
        const lockRes = await CouponService.lockCoupon(selectedCouponId, orderId, 'feeding_order', 'feeding')
        if (lockRes && lockRes.code !== 0) {
          this.errorDynamic(lockRes.message, 'COUPON_LOCK_FAILED')
          this.setData({ isSubmitting: false })
          return
        }
        lockedCouponId = selectedCouponId
      }

      const result = await FeedingService.createFeedingOrder({
        feederId, startDate, endDate,
        address: address.fullAddress || addressText, notes: notes.trim(),
        petIds: [], visitTimes: [],
        totalAmount: finalPrice,
        originalAmount: totalPrice,
        couponId: selectedCouponId || undefined,
        couponDiscount: couponDiscount || 0,
      })

      if (result && result.code === 0) {
        const orderId = result.data.id
        if (lockedCouponId) {
          await CouponService.useCoupon(
            lockedCouponId, orderId, 'feeding', totalPrice, couponDiscount, finalPrice
          )
        }

        this.setData({ showPaymentModal: false, isSubmitting: false, orderId: result.data.id })
        wx.redirectTo({
          url: `/subpackages/feeding/order-status?orderId=${result.data.id}`,
        })
      } else {
        if (lockedCouponId) {
          await CouponService.unlockCoupon(lockedCouponId)
        }
        this.setData({ isSubmitting: false })
        this.errorDynamic(result?.message, 'ORDER_PLACE_FAILED')
      }
    } catch (error) {
      if (lockedCouponId) {
        try { await CouponService.unlockCoupon(lockedCouponId) } catch (e) {
          console.error('[feeding-confirm] 优惠券解锁失败（需人工处理）:', e)
        }
      }
      this.setData({ isSubmitting: false })
      this.error('ORDER_PLACE_FAILED')
    }
  },
})
