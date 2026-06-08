const { BookingData } = require('../../utils/BookingDataService')
const { CouponService } = require('../../services/CouponService')
const { AddressService } = require('../../utils/AddressService')
const { FeedingService } = require('./services/FeedingService')
const DEFAULT_AVATAR = '/images/default-avatar.svg'
const PaymentService = require('../../services/PaymentService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const HOLIDAYS_2025 = [
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-05', '2025-04-06',
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-31', '2025-06-01', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
]

const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
]

const _HOLIDAY_SET = new Set([...HOLIDAYS_2025, ...HOLIDAYS_2026])

function _isHoliday(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return _HOLIDAY_SET.has(`${y}-${m}-${d}`)
}

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
  behaviors: [cloudImageBehavior],

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
          const holiday = _isHoliday(dateObj)
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
          const holiday = _isHoliday(dateObj)
          const dayPrice = holiday ? 60 : 50
          familiarityTotal += Math.round(dayPrice * 0.7 * d.count * 100) / 100
        }
      })
    }

    if (multiVisitDates && multiVisitDates.length > 0) {
      multiVisitDates.forEach(d => {
        if (d.count > 0) {
          const dateObj = new Date(d.date)
          const holiday = _isHoliday(dateObj)
          const dayPrice = holiday ? 60 : 50
          multiVisitTotal += Math.round(dayPrice * 0.8 * d.count * 100) / 100
        }
      })
    }

    const totalPrice = basePrice + walkTotal + familiarityTotal + multiVisitTotal
    const finalPrice = this.data.selectedCouponId
      ? Math.max(0, totalPrice - this.data.couponDiscount)
      : totalPrice

    this.setData({
      basicPrice: basePrice,
      walkTotal,
      familiarityPrice: familiarityTotal,
      multiVisitPrice: multiVisitTotal,
      totalPrice,
      finalPrice,
      serviceBreakdown: breakdown,
    })

    this._loadAvailableCoupons()
  },

  async _loadAvailableCoupons() {
    const { totalPrice } = this.data
    if (!totalPrice) {return}

    try {
      const result = await CouponService.getAvailableCoupons({
        business: 'feeding',
        amount: totalPrice,
      })
      if (result && result.code === 0) {
        this.setData({ availableCoupons: result.data || [] })
      }
    } catch (e) {
      console.warn('[confirm-service] 优惠券加载失败:', e)
    }
  },

  onToggleCouponSelector() {
    this.setData({ showCouponSelector: !this.data.showCouponSelector })
  },

  onSelectCoupon(e) {
    const { id, amount } = e.currentTarget.dataset
    const coupon = this.data.availableCoupons.find(c => c._id === id)
    if (!coupon) {return}

    const discountAmount = parseFloat(amount)
    const finalPrice = Math.max(0, Math.round((this.data.totalPrice - discountAmount) * 100) / 100)

    this.setData({
      selectedCouponId: id,
      selectedCoupon: coupon,
      couponDiscount: discountAmount,
      finalPrice,
      showCouponSelector: false,
    })
  },

  onRemoveCoupon() {
    this.setData({
      selectedCouponId: '',
      selectedCoupon: null,
      couponDiscount: 0,
      finalPrice: this.data.totalPrice,
    })
  },

  onChooseAddress() {
    wx.navigateTo({
      url: '/subpackages/other/address/index?from=service',
    })
  },

  onViewServiceStandard() {
    wx.navigateTo({
      url: '/subpackages/feeding/service-detail',
    })
  },

  onAddressSelected(address) {
    if (address) {
      this.setData({
        address,
        addressText: address.fullAddress || '',
      })
    }
  },

  onNotesInput(e) {
    this.setData({ notes: e.detail.value })
  },

  onShowKeyPicker() {
    this.setData({ showKeyPicker: true })
  },

  onHideKeyPicker() {
    this.setData({ showKeyPicker: false })
  },

  onKeyPickerChange(e) {
    this.setData({ keyPickerValue: e.detail.value })
  },

  onConfirmKeyPicker() {
    const idx = this.data.keyPickerValue[0]
    const keyMethod = this.data.keyOptions[idx] || ''
    this.setData({ keyMethod, showKeyPicker: false })
  },

  onShowTimePicker() {
    this.setData({ showTimePicker: true })
  },

  onHideTimePicker() {
    this.setData({ showTimePicker: false })
  },

  onTimePickerChange(e) {
    this.setData({ timePickerValue: e.detail.value })
  },

  onConfirmTimePicker() {
    const [hIdx, mIdx] = this.data.timePickerValue
    const hour = this.data.timeHourOptions[hIdx] || '09:00'
    const minute = this.data.timeMinuteOptions[mIdx] || '00'
    const visitHour = hour.replace(':00', '')
    const visitMinute = minute
    const visitTimeText = `${visitHour}:${visitMinute}`
    this.setData({ visitHour, visitMinute, visitTimeText, showTimePicker: false })
  },

  onShowFamiliarityPicker() {
    const { petServices, selectedPetDetails } = this.data
    const dateMap = {}
    if (selectedPetDetails && petServices) {
      selectedPetDetails.forEach(pet => {
        const svc = petServices[pet.id]
        if (svc && svc.serviceDates) {
          svc.serviceDates.forEach(d => {
            if (!dateMap[d.date]) {
              dateMap[d.date] = {
                date: d.date,
                shortDate: d.shortDate,
                timestamp: d.timestamp,
                count: 0,
              }
            }
          })
        }
      })
    }
    const familiarityDates = Object.values(dateMap).sort((a, b) => a.timestamp - b.timestamp)
    const selectedIndex = this.data.familiaritySelectedIndex || 0
    const count = familiarityDates[selectedIndex]?.count ?? 0
    const firstDate = familiarityDates[selectedIndex]
    let unitPrice = 0
    if (firstDate) {
      const dateObj = new Date(firstDate.date)
      const holiday = _isHoliday(dateObj)
      const dayPrice = holiday ? 60 : 50
      unitPrice = Math.round(dayPrice * 0.7 * 100) / 100
    }
    this.setData({ showFamiliarityPicker: true, familiarityDates, familiarityCount: count, familiaritySelectedIndex: selectedIndex, familiarityUnitPrice: unitPrice })
  },

  onHideFamiliarityPicker() {
    this.setData({ showFamiliarityPicker: false })
  },

  onSelectFamiliarityDate(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const count = this.data.familiarityDates[index]?.count ?? 0
    const dateItem = this.data.familiarityDates[index]
    let unitPrice = 0
    if (dateItem) {
      const dateObj = new Date(dateItem.date)
      const holiday = _isHoliday(dateObj)
      const dayPrice = holiday ? 60 : 50
      unitPrice = Math.round(dayPrice * 0.7 * 100) / 100
    }
    this.setData({ familiaritySelectedIndex: index, familiarityCount: count, familiarityUnitPrice: unitPrice })
  },

  onFamiliarityDecrease() {
    const { familiarityDates, familiaritySelectedIndex, familiarityCount } = this.data
    if (familiarityCount <= 0) {return}
    const newCount = familiarityCount - 1
    const key = `familiarityDates[${familiaritySelectedIndex}].count`
    this.setData({ familiarityCount: newCount, [key]: newCount })
  },

  onFamiliarityIncrease() {
    const { familiarityDates, familiaritySelectedIndex, familiarityCount } = this.data
    if (familiarityCount >= 10) {return}
    const newCount = familiarityCount + 1
    const key = `familiarityDates[${familiaritySelectedIndex}].count`
    this.setData({ familiarityCount: newCount, [key]: newCount })
  },

  onConfirmFamiliarity() {
    const { familiarityDates } = this.data
    const activeCount = familiarityDates.filter(d => d.count > 0).length
    if (activeCount === 0) {
      this.setData({
        familiarityText: '',
        familiarityCount: 0,
        showFamiliarityPicker: false,
      })
      this._calculatePrice()
      return
    }
    this.setData({
      familiarityText: `${activeCount}天×多次`,
      showFamiliarityPicker: false,
    })
    this._calculatePrice()
  },

  onShowMultiVisitPicker() {
    const { petServices, selectedPetDetails } = this.data
    const dateMap = {}
    if (selectedPetDetails && petServices) {
      selectedPetDetails.forEach(pet => {
        const svc = petServices[pet.id]
        if (svc && svc.serviceDates) {
          svc.serviceDates.forEach(d => {
            if (!dateMap[d.date]) {
              dateMap[d.date] = {
                date: d.date,
                shortDate: d.shortDate,
                timestamp: d.timestamp,
                count: 0,
              }
            }
          })
        }
      })
    }
    const multiVisitDates = Object.values(dateMap).sort((a, b) => a.timestamp - b.timestamp)
    const prev = this.data.multiVisitDates || []
    multiVisitDates.forEach(item => {
      const prevItem = prev.find(p => p.date === item.date)
      if (prevItem) {
        item.count = prevItem.count
      }
    })
    const selectedIndex = this.data.multiVisitSelectedIndex || 0
    const count = multiVisitDates[selectedIndex]?.count ?? 0
    const firstDate = multiVisitDates[selectedIndex]
    let unitPrice = 0
    if (firstDate) {
      const dateObj = new Date(firstDate.date)
      const holiday = _isHoliday(dateObj)
      const dayPrice = holiday ? 60 : 50
      unitPrice = Math.round(dayPrice * 0.8 * 100) / 100
    }
    this.setData({ showMultiVisitPicker: true, multiVisitDates, multiVisitCount: count, multiVisitSelectedIndex: selectedIndex, multiVisitUnitPrice: unitPrice })
  },

  onHideMultiVisitPicker() {
    this.setData({ showMultiVisitPicker: false })
  },

  onSelectMultiVisitDate(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const count = this.data.multiVisitDates[index]?.count ?? 0
    const dateItem = this.data.multiVisitDates[index]
    let unitPrice = 0
    if (dateItem) {
      const dateObj = new Date(dateItem.date)
      const holiday = _isHoliday(dateObj)
      const dayPrice = holiday ? 60 : 50
      unitPrice = Math.round(dayPrice * 0.8 * 100) / 100
    }
    this.setData({ multiVisitSelectedIndex: index, multiVisitCount: count, multiVisitUnitPrice: unitPrice })
  },

  onDecreaseDateCount() {
    const { multiVisitDates, multiVisitSelectedIndex, multiVisitCount } = this.data
    if (multiVisitCount <= 0) {return}
    const newCount = multiVisitCount - 1
    const key = `multiVisitDates[${multiVisitSelectedIndex}].count`
    this.setData({ multiVisitCount: newCount, [key]: newCount })
  },

  onIncreaseDateCount() {
    const { multiVisitDates, multiVisitSelectedIndex, multiVisitCount } = this.data
    if (multiVisitCount >= 10) {return}
    const newCount = multiVisitCount + 1
    const key = `multiVisitDates[${multiVisitSelectedIndex}].count`
    this.setData({ multiVisitCount: newCount, [key]: newCount })
  },

  onConfirmMultiVisit() {
    const { multiVisitDates } = this.data
    const activeCount = multiVisitDates.filter(d => d.count > 0).length
    if (activeCount === 0) {
      this.setData({
        multiVisitText: '',
        multiVisitValue: 1,
        showMultiVisitPicker: false,
      })
      this._calculatePrice()
      return
    }
    const totalCount = multiVisitDates.reduce((sum, d) => sum + d.count, 0)
    this.setData({
      multiVisitText: `${activeCount}天×多次`,
      multiVisitValue: totalCount,
      showMultiVisitPicker: false,
    })
    this._calculatePrice()
  },

  onPetAvatarLoadError(e) {
    const index = e.target.dataset.index
    if (index === undefined) {return}
    const key = `selectedPetDetails[${index}].avatarUrl`
    this.setData({ [key]: DEFAULT_AVATAR })
  },

  async onSubmit() {
    if (this.data.isSubmitting) {return}

    const { address, selectedPetDetails } = this.data

    if (!selectedPetDetails || selectedPetDetails.length === 0) {
      this.error('SERVICE_PET_REQUIRED')
      return
    }

    if (!address) {
      this.showModal({ titleKey: 'BIZ_HN56', contentKey: 'BIZ_190P12T', showCancel: false, confirmText: '知道了' })
      return
    }

    try {
      await this.onConfirmPayment()
    } catch (error) {
      console.error('[confirm-service] onSubmit error:', error)
      this.setData({ isSubmitting: false })
      wx.hideLoading()
      this.error('OPERATION_RETRY')
    }
  },

  async onConfirmPayment() {
    const {
      selectedPetDetails, petServices, address, notes,
      totalPrice, selectedCouponId, couponDiscount, finalPrice,
    } = this.data

    this.setData({ isSubmitting: true })
    wx.showLoading({ title: '提交中...', mask: true })

    let lockedCouponId = null
    let orderId = null

    try {
      const result = await FeedingService.createFeedingOrder({
        address: address.fullAddress || address,
        notes: notes.trim(),
        keyMethod: this.data.keyMethod,
        visitTime: this.data.visitTimeText,
        feederGender: this.data.feederGender,
        familiarity: this.data.familiarityValue,
        familiarityText: this.data.familiarityText,
        familiarityDates: this.data.familiarityDates,
        multiVisit: this.data.multiVisitValue,
        multiVisitText: this.data.multiVisitText,
        multiVisitDates: this.data.multiVisitDates,
        petIds: selectedPetDetails.map(p => p.id),
        petDetails: selectedPetDetails,
        petServices,
        totalAmount: finalPrice,
        originalAmount: totalPrice,
        couponId: selectedCouponId || undefined,
        couponDiscount: couponDiscount || 0,
      })

      if (!result || result.code !== 0) {
        this.setData({ isSubmitting: false })
        wx.hideLoading()
        this.errorDynamic(result?.message, 'ORDER_PLACE_FAILED')
        return
      }

      orderId = result.data.id
      const orderNo = result.data.orderNo

      if (selectedCouponId) {
        const lockRes = await CouponService.lockCoupon(selectedCouponId, orderId, 'feeding_order', 'feeding')
        if (lockRes && lockRes.code !== 0) {
          console.warn('[confirm-service] 优惠券锁定失败，继续支付')
        } else {
          lockedCouponId = selectedCouponId
        }
      }

      const payAmount = Math.round(finalPrice * 100)

      try {
        wx.hideLoading()
        await PaymentService.pay({
          type: 'feeding',
          orderId,
          amount: payAmount,
          description: '上门喂养服务',
        })

        if (lockedCouponId) {
          await CouponService.useCoupon(
            lockedCouponId, orderId, 'feeding', totalPrice, couponDiscount, finalPrice
          ).catch(() => {})
        }

        BookingData.set('selectedPetDetails', null)
        BookingData.set('petServices', null)

        this.setData({ isSubmitting: false })
        wx.redirectTo({
          url: `/subpackages/feeding/order-status?orderId=${orderId}`,
        })
      } catch (payError) {
        if (payError.isCancel) {
          this.setData({ isSubmitting: false })
          this.error('PAYMENT_CANCELLED_TEXT')
          setTimeout(() => {
            wx.redirectTo({
              url: `/subpackages/feeding/order-status?orderId=${orderId}`,
            })
          }, 1500)
        } else if (payError.isPending) {
          this.setData({ isSubmitting: false })
          this.error(() => payError.message, { duration: 3000 })
          setTimeout(() => {
            wx.redirectTo({
              url: `/subpackages/feeding/order-status?orderId=${orderId}`,
            })
          }, 3000)
        } else {
          this.setData({ isSubmitting: false })
          this.showModal({ titleKey: 'PAYMENT_FAILED', contentKey: 'BIZ_A0D703', showCancel: true, cancelText: '留在本页', confirmText: '查看订单' })
        }
      }
    } catch (error) {
      console.error('[confirm-service] onConfirmPayment error:', error)
      if (lockedCouponId) {
        try { await CouponService.unlockCoupon(lockedCouponId) } catch (e) {}
      }
      this.setData({ isSubmitting: false })
      wx.hideLoading()

      if (orderId) {
        this.showModal({ titleKey: 'OPERATION_FAILED', showCancel: true, cancelText: '留在本页', confirmText: '查看订单' })
      } else {
        this.errorDynamic(error.message, 'ORDER_PLACE_FAILED')
      }
    }
  },
})
