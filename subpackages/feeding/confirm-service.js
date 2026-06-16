const { BookingData } = require('../../utils/BookingDataService')
const { CouponService } = require('../../services/CouponService')
const { AddressService } = require('../../utils/AddressService')
const { FeedingService } = require('./services/FeedingService')
const DEFAULT_AVATAR = '/images/default-avatar.svg'
const PaymentService = require('../../services/PaymentService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { computeFinalAmount } = require('../../utils/coupon-amount')
const { isHoliday } = require('../../utils/holidays')
const couponSelectorBehavior = require('../../behaviors/couponSelectorBehavior')
const picker = require('./utils/dateCountPicker')

const KEY_OPTIONS = ['密码锁', '存放快递柜', '家中有人', '其他']

const TIME_HOUR_OPTIONS = []
for (let h = 0; h < 24; h++) {
  TIME_HOUR_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
}
TIME_HOUR_OPTIONS.push('24:00')

const TIME_MINUTE_OPTIONS = ['00', '30']

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior, couponSelectorBehavior],

  data: {
    loading: true,
    selectedPetDetails: [],
    petServices: {},
    serviceBreakdown: [],
    basicPrice: 0,
    walkTotal: 0,
    familiarityPrice: 0,
    multiVisitPrice: 0,
    totalPrice: 0,
    address: null,
    addressText: '',
    contactPhone: '',
    notes: '',
    keyMethod: '',
    keyOptions: KEY_OPTIONS,
    keyPickerValue: [0],
    showKeyPicker: false,
    visitTimeText: '',
    visitHour: '',
    visitMinute: '',
    timeHourOptions: TIME_HOUR_OPTIONS,
    timeMinuteOptions: TIME_MINUTE_OPTIONS,
    timePickerValue: [9, 0],
    showTimePicker: false,
    iconService: '/images/icons/客服.svg',
    familiarityValue: '',
    familiarityText: '',
    showFamiliarityPicker: false,
    familiarityCount: 0,
    familiarityDates: [],
    familiaritySelectedIndex: 0,
    multiVisitValue: 1,
    multiVisitText: '',
    showMultiVisitPicker: false,
    multiVisitDates: [],
    multiVisitSelectedIndex: 0,
    multiVisitCount: 0,
    familiarityUnitPrice: 0,
    multiVisitUnitPrice: 0,
    isSubmitting: false,
    selectedCouponId: '',
    selectedCoupon: null,
    availableCoupons: [],
    couponDiscount: 0,
    finalPrice: 0,
    showCouponSelector: false,
  },

  onLoad() {
    const app = getApp()
    const isLoggedIn = app && app.globalData && app.globalData.isLoggedIn
    if (!isLoggedIn) {
      const { authService } = require('../../services/AuthService')
      authService.startLogin()
      return
    }
    this._loadOrderInfo()
    this._loadAddress()
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

  async _loadOrderInfo() {
    const selectedPetDetails = BookingData.get('selectedPetDetails') || []
    const petServices = BookingData.get('petServices') || {}

    this.setData({
      selectedPetDetails,
      petServices,
      loading: false,
    })

    this._calculatePrice()
  },

  async _loadAddress() {
    try {
      const addr = await AddressService.getDefault()
      if (addr) {
        this.setData({
          address: addr,
          addressText: addr.fullAddress || '',
        })
      }
    } catch (e) {
      console.warn('[confirm-service] 地址加载失败:', e)
    }
  },

  _calculatePrice() {
    const { selectedPetDetails, petServices, familiarityDates, multiVisitDates } = this.data
    if (!selectedPetDetails || selectedPetDetails.length === 0) {return}

    let basePrice = 0
    let walkTotal = 0
    let familiarityTotal = 0
    let multiVisitTotal = 0
    const breakdown = []

    selectedPetDetails.forEach(pet => {
      const svc = petServices[pet.id]
      let petBase = 0
      let petWalk = 0
      let serviceDays = 0

      if (svc && svc.serviceDates && svc.serviceDates.length > 0) {
        serviceDays = svc.serviceDates.length
        svc.serviceDates.forEach(d => {
          const dateObj = new Date(d.date)
          const holiday = isHoliday(dateObj)
          petBase += holiday ? 60 : 50
        })
        petWalk = svc.walkMinutes || 0
      }

      basePrice += petBase
      walkTotal += petWalk

      breakdown.push({
        name: pet.name || '未知',
        serviceDays,
        baseAmount: petBase,
        walkMinutes: petWalk,
        walkAmount: petWalk,
        subtotal: petBase + petWalk,
      })
    })

    if (familiarityDates && familiarityDates.length > 0) {
      familiarityDates.forEach(d => {
        if (d.count > 0) {
          const dateObj = new Date(d.date)
          const holiday = isHoliday(dateObj)
          const dayPrice = holiday ? 60 : 50
          familiarityTotal += Math.round(dayPrice * 0.7 * d.count * 100) / 100
        }
      })
    }

    if (multiVisitDates && multiVisitDates.length > 0) {
      multiVisitDates.forEach(d => {
        if (d.count > 0) {
          const dateObj = new Date(d.date)
          const holiday = isHoliday(dateObj)
          const dayPrice = holiday ? 60 : 50
          multiVisitTotal += Math.round(dayPrice * 0.8 * d.count * 100) / 100
        }
      })
    }

    const totalPrice = basePrice + walkTotal + familiarityTotal + multiVisitTotal
    const { finalAmount, couponDiscount: finalCouponDiscount, shouldClear } = computeFinalAmount(totalPrice, this.data.couponDiscount)
    const finalPrice = finalAmount

    this.setData({
      basicPrice: basePrice,
      walkTotal,
      familiarityPrice: familiarityTotal,
      multiVisitPrice: multiVisitTotal,
      totalPrice,
      finalPrice,
      serviceBreakdown: breakdown,
    })
    if (shouldClear) {
      // 免费订单不允许用券
      this.setData({
        selectedCouponId: '',
        selectedCoupon: null,
        couponDiscount: 0,
      })
    } else if (this.data.couponDiscount !== finalCouponDiscount) {
      this.setData({ couponDiscount: finalCouponDiscount })
    }
    this._loadAvailableCoupons()
  },

})
