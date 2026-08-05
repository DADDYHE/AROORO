const { BookingData } = require('../../utils/BookingDataService')
const { AddressService } = require('../../utils/AddressService')
const { FeedingService } = require('./services/FeedingService')
const PaymentService = require('../../services/PaymentService')
const { ListBehavior } = require('../../behaviors/listBehavior')
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
  behaviors: [ListBehavior, cloudImageBehavior, couponSelectorBehavior],

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
    iconService: '/images/icons/message-luxury-line.svg',
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
    this._initNavbarHeight()
    this._initCouponSelector('totalPrice')
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

  // ===== 表单事件 =====
  onChooseAddress() {
    wx.navigateTo({
      url: '/subpackages/other/address/index',
    })
  },

  onPhoneInput(e) {
    this.setData({ contactPhone: e.detail.value })
  },

  onPhoneBlur(e) {
    const phone = e.detail.value
    if (phone && phone.length !== 11) {
      wx.showToast({ title: '请输入11位手机号', icon: 'none' })
    }
  },

  onNotesInput(e) {
    this.setData({ notes: e.detail.value })
  },

  onViewServiceStandard() {
    wx.navigateTo({
      url: '/subpackages/feeding/service-detail',
    })
  },

  // ===== 钥匙交接选择器 =====
  onShowKeyPicker() {
    const idx = Math.max(0, this.data.keyOptions.indexOf(this.data.keyMethod))
    this.setData({
      showKeyPicker: true,
      keyPickerValue: [idx >= 0 ? idx : 0],
    })
  },

  onHideKeyPicker() {
    this.setData({ showKeyPicker: false })
  },

  onKeyPickerChange(e) {
    this.setData({ keyPickerValue: e.detail.value })
  },

  onConfirmKeyPicker() {
    const idx = this.data.keyPickerValue[0]
    this.setData({
      keyMethod: this.data.keyOptions[idx] || '',
      showKeyPicker: false,
    })
  },

  // ===== 上门时间选择器 =====
  onShowTimePicker() {
    let hourIdx = 9
    const minuteIdx = 0
    if (this.data.visitHour) {
      const h = parseInt(this.data.visitHour, 10)
      hourIdx = Math.max(0, Math.min(h, this.data.timeHourOptions.length - 1))
    }
    this.setData({
      showTimePicker: true,
      timePickerValue: [hourIdx, minuteIdx],
    })
  },

  onHideTimePicker() {
    this.setData({ showTimePicker: false })
  },

  onTimePickerChange(e) {
    this.setData({ timePickerValue: e.detail.value })
  },

  onConfirmTimePicker() {
    const [hIdx, mIdx] = this.data.timePickerValue
    const hour = this.data.timeHourOptions[hIdx] || ''
    const minute = this.data.timeMinuteOptions[mIdx] || ''
    this.setData({
      visitHour: hour,
      visitMinute: minute,
      visitTimeText: `${hour}-${minute}`,
      showTimePicker: false,
    })
  },

  // ===== 提前熟悉选择器 =====
  onShowFamiliarityPicker() {
    const dates = picker.buildDateMap(this.data.petServices, this.data.selectedPetDetails)
    const merged = picker.mergePrevCounts(dates, this.data.familiarityDates)
    this.setData({
      familiarityDates: merged,
      showFamiliarityPicker: true,
      familiaritySelectedIndex: 0,
      familiarityCount: merged[0]?.count || 0,
      familiarityUnitPrice: merged[0] ? picker.calcUnitPrice(merged[0].date, 0.7) : 0,
    })
  },

  onHideFamiliarityPicker() {
    this.setData({ showFamiliarityPicker: false })
  },

  onSelectFamiliarityDate(e) {
    picker.onSelectDate(this, 'familiarity', e.currentTarget.dataset.index)
  },

  onFamiliarityDecrease() {
    picker.onDecrease(this, 'familiarity')
  },

  onFamiliarityIncrease() {
    picker.onIncrease(this, 'familiarity')
  },

  onConfirmFamiliarity() {
    picker.onConfirm(this, 'familiarity', { onConfirm: () => this._calculatePrice() })
  },

  // ===== 一天多次选择器 =====
  onShowMultiVisitPicker() {
    const dates = picker.buildDateMap(this.data.petServices, this.data.selectedPetDetails)
    const merged = picker.mergePrevCounts(dates, this.data.multiVisitDates)
    this.setData({
      multiVisitDates: merged,
      showMultiVisitPicker: true,
      multiVisitSelectedIndex: 0,
      multiVisitCount: merged[0]?.count || 0,
      multiVisitUnitPrice: merged[0] ? picker.calcUnitPrice(merged[0].date, 0.8) : 0,
    })
  },

  onHideMultiVisitPicker() {
    this.setData({ showMultiVisitPicker: false })
  },

  onSelectMultiVisitDate(e) {
    picker.onSelectDate(this, 'multiVisit', e.currentTarget.dataset.index)
  },

  onDecreaseDateCount() {
    picker.onDecrease(this, 'multiVisit')
  },

  onIncreaseDateCount() {
    picker.onIncrease(this, 'multiVisit')
  },

  onConfirmMultiVisit() {
    picker.onConfirm(this, 'multiVisit', { onConfirm: () => this._calculatePrice() })
  },

  // ===== 提交订单 =====
  async onSubmit() {
    if (this.data.isSubmitting) {return}

    // 表单校验
    if (!this.data.address || !this.data.addressText) {
      wx.showToast({ title: '请选择服务地址', icon: 'none' })
      return
    }
    if (!this.data.contactPhone || this.data.contactPhone.length !== 11) {
      wx.showToast({ title: '请输入11位手机号', icon: 'none' })
      return
    }
    if (!this.data.keyMethod) {
      wx.showToast({ title: '请选择钥匙交接方式', icon: 'none' })
      return
    }
    if (!this.data.visitTimeText) {
      wx.showToast({ title: '请选择期望上门时间', icon: 'none' })
      return
    }
    if (!this.data.selectedPetDetails || this.data.selectedPetDetails.length === 0) {
      wx.showToast({ title: '暂无服务宠物', icon: 'none' })
      return
    }

    this.setData({ isSubmitting: true })

    try {
      // 构造订单数据（字段名需与云函数 createFeedingOrder 的 event 解构一致）
      const petDetails = this.data.selectedPetDetails
      const petIds = petDetails.map(pet => pet.id)

      // 从所有宠物的 serviceDates 中提取起止日期（YYYY-MM-DD）
      const allDates = []
      petDetails.forEach(pet => {
        const svc = this.data.petServices[pet.id]
        if (svc && svc.serviceDates) {
          svc.serviceDates.forEach(d => allDates.push(d.date))
        }
      })
      allDates.sort()
      const startDate = allDates[0] || ''
      const endDate = allDates[allDates.length - 1] || ''

      // multiVisit 总次数（multiVisitDates 中各日期 count 之和）
      const multiVisitTotal = this.data.multiVisitDates
        .filter(d => d.count > 0)
        .reduce((sum, d) => sum + d.count, 0)

      const orderData = {
        petIds,
        petDetails,
        petServices: this.data.petServices,
        address: this.data.address,
        contactPhone: this.data.contactPhone,
        keyMethod: this.data.keyMethod,
        visitTime: this.data.visitTimeText,
        visitTimes: this.data.visitTimeText ? [this.data.visitTimeText] : [],
        startDate,
        endDate,
        notes: this.data.notes,
        familiarityDates: this.data.familiarityDates.filter(d => d.count > 0),
        multiVisit: multiVisitTotal,
        multiVisitDates: this.data.multiVisitDates.filter(d => d.count > 0),
        couponId: this.data.selectedCouponId || '',
        couponDiscount: this.data.couponDiscount || 0,
        // totalAmount/originalAmount 由云函数按平台价目表重算，前端不传以避免篡改
      }

      // 创建喂养订单
      const result = await FeedingService.createFeedingOrder(orderData)
      if (!result || result.code !== 0) {
        throw new Error(result?.message || '创建订单失败')
      }

      const orderId = result.data?.id || result.data?.orderId || result.data?._id || ''
      if (!orderId) {
        throw new Error('订单创建异常')
      }

      // 发起支付（金额单位：云函数 createPayment 要求分为单位的正整数）
      const payAmountYuan = result.data?.totalAmount != null
        ? result.data.totalAmount
        : (this.data.selectedCouponId ? this.data.finalPrice : this.data.totalPrice)
      const payResult = await PaymentService.pay({
        type: 'feeding',
        orderId,
        amount: Math.round(payAmountYuan * 100),
        description: '宠物喂养服务',
      })

      if (payResult && payResult.paid) {
        wx.showToast({ title: '下单成功', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({
            url: `/subpackages/feeding/order-status?orderId=${orderId}`,
          })
        }, 1500)
      }
    } catch (err) {
      if (err && err.isCancel) {
        wx.showToast({ title: '支付已取消', icon: 'none' })
      } else if (err && err.isPending) {
        wx.showToast({ title: '支付确认中，请稍后查看订单', icon: 'none' })
        setTimeout(() => {
          wx.redirectTo({
            url: '/subpackages/feeding/order-status?orderId=',
          })
        }, 1500)
      } else {
        wx.showToast({ title: err?.message || '下单失败', icon: 'none' })
      }
    } finally {
      this.setData({ isSubmitting: false })
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
    // P1-4 修复：此前未传 business 导致默认按 mall 查询，
    //   喂养专属券不显示、商城券误显示且提交被拒
    this._loadAvailableCoupons({ business: 'feeding' })
  },

})
