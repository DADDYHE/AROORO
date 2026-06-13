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

  // onToggleCouponSelector, onSelectCoupon, onRemoveCoupon 已由 couponSelectorBehavior 提供

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

  onPhoneInput(e) {
    this.setData({ contactPhone: e.detail.value })
  },

  onPhoneBlur() {
    const { contactPhone } = this.data
    if (contactPhone && !/^1[3-9]\d{9}$/.test(contactPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none', duration: 2000 })
    }
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
    const dates = picker.buildDateMap(this.data.petServices, this.data.selectedPetDetails)
    const selectedIndex = this.data.familiaritySelectedIndex || 0
    const count = dates[selectedIndex]?.count ?? 0
    const unitPrice = dates[selectedIndex] ? picker.calcUnitPrice(dates[selectedIndex].date, 0.7) : 0
    this.setData({ showFamiliarityPicker: true, familiarityDates: dates, familiarityCount: count, familiaritySelectedIndex: selectedIndex, familiarityUnitPrice: unitPrice })
  },

  onHideFamiliarityPicker() { this.setData({ showFamiliarityPicker: false }) },

  onSelectFamiliarityDate(e) { picker.onSelectDate(this, 'familiarity', parseInt(e.currentTarget.dataset.index, 10)) },

  onFamiliarityDecrease() { picker.onDecrease(this, 'familiarity') },

  onFamiliarityIncrease() { picker.onIncrease(this, 'familiarity') },

  onConfirmFamiliarity() { picker.onConfirm(this, 'familiarity', { onConfirm: () => this._calculatePrice() }) },

  onShowMultiVisitPicker() {
    const dates = picker.buildDateMap(this.data.petServices, this.data.selectedPetDetails)
    picker.mergePrevCounts(dates, this.data.multiVisitDates)
    const selectedIndex = this.data.multiVisitSelectedIndex || 0
    const count = dates[selectedIndex]?.count ?? 0
    const unitPrice = dates[selectedIndex] ? picker.calcUnitPrice(dates[selectedIndex].date, 0.8) : 0
    this.setData({ showMultiVisitPicker: true, multiVisitDates: dates, multiVisitCount: count, multiVisitSelectedIndex: selectedIndex, multiVisitUnitPrice: unitPrice })
  },

  onHideMultiVisitPicker() { this.setData({ showMultiVisitPicker: false }) },

  onSelectMultiVisitDate(e) { picker.onSelectDate(this, 'multiVisit', parseInt(e.currentTarget.dataset.index, 10)) },

  onDecreaseDateCount() { picker.onDecrease(this, 'multiVisit') },

  onIncreaseDateCount() { picker.onIncrease(this, 'multiVisit') },

  onConfirmMultiVisit() { picker.onConfirm(this, 'multiVisit', { onConfirm: () => this._calculatePrice() }) },

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

    const { contactPhone } = this.data
    if (!contactPhone || !/^1[3-9]\d{9}$/.test(contactPhone)) {
      wx.showToast({ title: '请填写正确的联系电话', icon: 'none', duration: 2000 })
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
    // 客户端预生成 orderId（用于 lockCoupon 的 orderId 参数，且与 feedingOrders._id 保持一致）
    // 必须以 fd_ 前缀，与 generateId('feeding', openid) 风格匹配，便于后端 accept
    const clientOrderId = `fd_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

    try {
      // Sprint 27: 先锁定优惠券（与其他订单确认页一致）
      if (selectedCouponId) {
        const lockRes = await CouponService.lockCoupon(selectedCouponId, clientOrderId, 'feeding_order', 'feeding')
        if (lockRes && lockRes.code !== 0) {
          this.setData({ isSubmitting: false })
          wx.hideLoading()
          this.errorDynamic(lockRes.message, 'COUPON_LOCK_FAILED')
          return
        }
        lockedCouponId = selectedCouponId
      }

      const result = await FeedingService.createFeedingOrder({
        orderId: clientOrderId,
        address: address.fullAddress || address,
        contactPhone: this.data.contactPhone,
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
        if (lockedCouponId) {
          await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
        }
        this.setData({ isSubmitting: false })
        wx.hideLoading()
        this.errorDynamic(result?.message, 'ORDER_PLACE_FAILED')
        return
      }

      orderId = result.data.id
      const orderNo = result.data.orderNo

      const payAmount = Math.round(finalPrice * 100)

      try {
        wx.hideLoading()
        await PaymentService.pay({
          type: 'feeding',
          orderId,
          amount: payAmount,
          description: '上门喂养服务',
        })

        // 优惠券核销由后端 paymentService 在支付回调/确认支付时自动完成（locked → used）
        // 此处不再调用 CouponService.useCoupon，避免重复核销

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
          this.showModal({
            titleKey: 'PAYMENT_FAILED',
            contentKey: 'BIZ_A0D703',
            showCancel: true,
            cancelText: '留在本页',
            confirmText: '查看订单',
            success: (confirmed) => {
              if (!confirmed) {return}
              wx.redirectTo({ url: `/subpackages/feeding/order-status?orderId=${orderId}` })
            },
          })
        }
      }
    } catch (error) {
      console.error('[confirm-service] onConfirmPayment error:', error)
      if (lockedCouponId) {
        await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
      }
      this.setData({ isSubmitting: false })
      wx.hideLoading()

      if (orderId) {
        this.showModal({
          titleKey: 'OPERATION_FAILED',
          showCancel: true,
          cancelText: '留在本页',
          confirmText: '查看订单',
          success: (confirmed) => {
            if (!confirmed) {return}
            wx.redirectTo({ url: `/subpackages/feeding/order-status?orderId=${orderId}` })
          },
        })
      } else {
        this.errorDynamic(error.message, 'ORDER_PLACE_FAILED')
      }
    }
  },
})
