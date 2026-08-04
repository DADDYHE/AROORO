const { orderManager } = require('../../services/OrderManager')
const { HostService, OrderService, PetService } = require('../../services/CloudFunctionService')
const { authService } = require('../../services/AuthService')
const { BookingData } = require('../../utils/BookingDataService')
const { CouponService } = require('../../services/CouponService')
const PaymentService = require('../../services/PaymentService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { computeFinalAmount } = require('../../utils/coupon-amount')
const { isHoliday } = require('../../utils/holidays')
const couponSelectorBehavior = require('../../behaviors/couponSelectorBehavior')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, couponSelectorBehavior],
  data: {
    hostId: '',
    hostName: '',
    hostPrice: 0,
    selectedDates: { start: '', end: '', days: 0 },
    selectedPets: [],
    selectedPetsDetails: [],
    petServices: {},
    serviceBreakdown: [],
    basicPrice: 0,
    discount: 0,
    totalPrice: 0,
    loading: false,
    isLoggedIn: false,
    showDatePicker: false,
    priceCalculated: false,
    showCalendar: false,
    minDate: new Date().getTime(),
    maxDate: new Date(new Date().getFullYear(), new Date().getMonth() + 6, new Date().getDate()).getTime(),
    defaultDate: null,
    selectedCouponId: '',
    selectedCoupon: null,
    availableCoupons: [],
    couponDiscount: 0,
    finalPrice: 0,
    showCouponSelector: false,
  },

  _batchUpdate(updates, callback) {
    if (Object.keys(updates).length > 0) {
      this.setData(updates, callback)
    } else if (callback) {
      callback()
    }
  },

  onLoad(options) {
    this._initNavbarHeight()
    const isLoggedIn = authService.isLoggedIn()
    const hostId = options.hostId || options.id
    const updates = { isLoggedIn }
    if (hostId) {updates.hostId = hostId}
    this._batchUpdate(updates, () => this.loadOrderInfo())
  },

  openCalendar(e) {
    const type = e.currentTarget.dataset.type
    const globalSelectedDates = BookingData.get('selectedDatesTimestamp')
    let defaultDate = null
    if (globalSelectedDates && globalSelectedDates.start && globalSelectedDates.end) {
      defaultDate = [globalSelectedDates.start, globalSelectedDates.end]
    }
    this.setData({ calendarType: type, defaultDate, showCalendar: true })
  },

  onCloseCalendar() {
    this.setData({ showCalendar: false })
  },

  onCalendarChange(event) {
    const selectedDate = event.detail
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length === 2) {
      this.updateDates(new Date(selectedDate[0]), new Date(selectedDate[1]))
      this.setData({ showCalendar: false })
    }
  },

  onConfirmCalendar(event) {
    const [startDate, endDate] = event.detail
    if (!startDate || !endDate) {
      this.error('DATE_RANGE_FULL_REQUIRED')
      return
    }
    this.updateDates(new Date(startDate), new Date(endDate))
    this.setData({ showCalendar: false })
  },

  async checkLoginStatus() {
    try {
      const isLoggedIn = authService.isLoggedIn()
      this._batchUpdate({ isLoggedIn })
    } catch (error) {
      this._batchUpdate({ isLoggedIn: false })
    }
  },

  loginWithWechat() {
    authService.startLogin()
  },

  async loadOrderInfo() {
    try {
      const bookingData = BookingData.get()
      let selectedDates = bookingData.selectedDates
      const selectedPets = bookingData.selectedPets
      const selectedPetsDetails = bookingData.selectedPetDetails

      if (!selectedDates || !selectedDates.start || !selectedDates.end) {
        const bookingReqs = bookingData.bookingRequirements || {}
        if (bookingReqs.startDate && bookingReqs.endDate) {
          selectedDates = {
            start: { text: bookingReqs.startDate },
            end: { text: bookingReqs.endDate },
            days: bookingReqs.days || 0,
          }
        }
      }

      const selectedHost = bookingData.selectedHost || null
      const updates = {}

      if (selectedHost) {
        const hostPrice = selectedHost.pricePerDay || selectedHost.price || 0
        if (hostPrice > 0) {
          updates.hostName = selectedHost.hostName || selectedHost.name || '寄养家庭'
          updates.hostPrice = hostPrice
          updates.priceCalculated = true
        }
      }

      if (selectedDates && selectedDates.start && selectedDates.end) {
        if (typeof selectedDates.start === 'object' && selectedDates.start.text) {
          updates.selectedDates = selectedDates
          const existingTimestamp = BookingData.get('selectedDatesTimestamp')
          if (!existingTimestamp || !existingTimestamp.start || !existingTimestamp.end) {
            this._restoreTimestampFromDisplay(selectedDates)
          }
        } else {
          updates.selectedDates = this._formatStringDates(selectedDates)
        }
      } else {
        updates.selectedDates = { start: { text: '', weekDay: '' }, end: { text: '', weekDay: '' }, days: 0 }
      }

      updates.selectedPets = selectedPets
      updates.selectedPetsDetails = selectedPetsDetails || []
      updates.petServices = bookingData.petServices || {}

      this._batchUpdate(updates)

      if (selectedPets && selectedPets.length > 0 && !selectedPetsDetails) {
        await this._loadPetDetails(selectedPets)
      }

      if (this.data.hostId) {
        await this.loadHostInfo()
      }
    } catch (error) {
      if (error.message && error.message.includes('DATABASE_COLLECTION_NOT_EXIST')) {return}
      this.error('ORDER_LOAD_FAILED')
    }
  },

  _restoreTimestampFromDisplay(selectedDates) {
    const today = new Date()
    const parseDateText = text => {
      if (!text || typeof text !== 'string') {return null}
      const monthPart = text.split('月')
      if (!monthPart || monthPart.length < 2) {return null}
      const dayPart = monthPart[1].split('日')
      if (!dayPart || dayPart.length < 1) {return null}
      const month = parseInt(monthPart[0], 10)
      const day = parseInt(dayPart[0], 10)
      if (isNaN(month) || isNaN(day)) {return null}
      return { month: month - 1, day }
    }

    const startParsed = parseDateText(selectedDates.start.text)
    const endParsed = parseDateText(selectedDates.end.text)
    if (!startParsed || !endParsed) {return}

    const startDate = new Date(today.getFullYear(), startParsed.month, startParsed.day)
    const endDate = new Date(today.getFullYear(), endParsed.month, endParsed.day)
    if (startDate < today) {startDate.setFullYear(today.getFullYear() + 1)}
    if (endDate < today) {endDate.setFullYear(today.getFullYear() + 1)}

    BookingData.set('selectedDatesTimestamp', {
      start: startDate.getTime(),
      end: endDate.getTime(),
      days: selectedDates.days || 0,
    })
  },

  _formatStringDates(selectedDates) {
    const formatDateToObject = dateStr => {
      if (!dateStr) {return { text: '', weekDay: '' }}
      const cleanStr = String(dateStr).replace(/<[^>]*>/g, '').trim()
      const monthDayMatch = cleanStr.match(/(\d{1,2}) 月 (\d{1,2}) 日/)
      const weekDayMatch = cleanStr.match(/([ 周 ][ 日一二三四五六])/)
      if (monthDayMatch) {
        return { text: `${monthDayMatch[1]}月${monthDayMatch[2]}日`, weekDay: weekDayMatch ? weekDayMatch[1] : '' }
      }
      return { text: '', weekDay: '' }
    }
    return {
      ...selectedDates,
      start: formatDateToObject(selectedDates.start),
      end: formatDateToObject(selectedDates.end),
      days: selectedDates.days || 0,
    }
  },

  async _loadPetDetails(petIds) {
    try {
      const petsDetails = await Promise.all(
        petIds.map(async petId => {
          try {
            const result = await PetService.getPetDetail(petId)
            if (result && result.code === 0) {
              const petData = result.data || {}
              return petData.pet || petData
            }
            return null
          } catch (error) {
            return null
          }
        })
      )
      this._batchUpdate({ selectedPetsDetails: petsDetails.filter(d => d !== null) })
    } catch (error) {
      this._batchUpdate({ selectedPetsDetails: [] })
    }
  },

  async loadHostInfo() {
    try {
      if (this.data.hostPrice > 0) {
        this.calculatePrice()
        return
      }

      const result = await HostService.getHostList({ hostId: this.data.hostId })

      if (result.code === 0) {
        const hostList = result.data.list || result.data
        const host = hostList.find(h => h._id === this.data.hostId || h.id === this.data.hostId)

        if (host) {
          const price = host.pricePerDay || host.price || 0
          this._batchUpdate({
            hostName: host.hostName || '寄养家庭',
            hostPrice: price,
            priceCalculated: true,
          }, () => this.calculatePrice())
        }
      }
    } catch (error) {
      this._batchUpdate({ hostName: '寄养家庭', hostPrice: 0 })
    }
  },

  async calculatePrice() {
    try {
      this.calculatePriceLocal()
    } catch (error) {
      this.calculatePriceLocal()
    }
  },

  calculatePriceLocal() {
    const { selectedPetsDetails, hostPrice, petServices } = this.data
    const pricePerDay = hostPrice > 0 ? hostPrice : 0

    if (pricePerDay === 0) {
      this.error('PRICE_REQUIRED')
      return
    }

    if (!selectedPetsDetails || selectedPetsDetails.length === 0) {return}

    let basePrice = 0
    let walkTotal = 0
    const breakdown = []

    selectedPetsDetails.forEach(pet => {
      const svc = petServices[pet.id]
      let petBase = 0
      let petWalk = 0
      let serviceDays = 0

      if (svc && svc.serviceDates && svc.serviceDates.length > 0) {
        serviceDays = svc.serviceDates.length
        svc.serviceDates.forEach(d => {
          const dateObj = new Date(d.date)
          const holiday = isHoliday(dateObj)
          petBase += holiday ? 58 : 48
        })
        petWalk = svc.walkMinutes || 0
      } else {
        serviceDays = this.data.selectedDates.days || 0
        petBase = pricePerDay * serviceDays
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

    const totalPrice = basePrice + walkTotal
    const { finalAmount, couponDiscount: finalCouponDiscount, shouldClear } = computeFinalAmount(totalPrice, this.data.couponDiscount)
    const finalPrice = finalAmount

    this._batchUpdate({
      basicPrice: basePrice,
      discount: 0,
      totalPrice,
      finalPrice,
      serviceBreakdown: breakdown,
    })
    if (shouldClear) {
      // 免费订单不允许用券
      this._batchUpdate({
        selectedCouponId: '',
        selectedCoupon: null,
        couponDiscount: 0,
      })
    } else if (this.data.couponDiscount !== finalCouponDiscount) {
      this._batchUpdate({ couponDiscount: finalCouponDiscount })
    }
    this._loadAvailableCoupons()
  },

  async _loadAvailableCoupons() {
    const { hostId, totalPrice } = this.data
    if (!hostId || !totalPrice) {return}

    try {
      const result = await CouponService.getAvailableCoupons({
        business: 'boarding',
        items: hostId ? [hostId] : [],
        amount: totalPrice,
      })
      if (result && result.code === 0) {
        this._batchUpdate({ availableCoupons: result.data || [] })
      }
    } catch (e) {
      console.warn('[confirm] 优惠券列表加载失败:', e)
    }
  },

  // onToggleCouponSelector, onSelectCoupon, onRemoveCoupon 已由 couponSelectorBehavior 提供

  onPetAvatarLoadError(e) {
    const index = e.currentTarget.dataset.index
    const selectedPetsDetails = [...this.data.selectedPetsDetails]
    selectedPetsDetails[index].avatarUrl = '/images/default-photo.png'
    this._batchUpdate({ selectedPetsDetails })
  },

  updateDates(startDate, endDate) {
    const formatDate = date => {
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      return { text: `${month}月${day}日`, weekDay: weekDays[date.getDay()] }
    }

    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    const selectedDatesDisplay = { start: formatDate(startDate), end: formatDate(endDate), days }
    const selectedDatesTimestamp = { start: startDate.getTime(), end: endDate.getTime(), days }

    BookingData.set('selectedDates', selectedDatesDisplay)
    BookingData.set('selectedDatesTimestamp', selectedDatesTimestamp)

    this._batchUpdate({ selectedDates: selectedDatesDisplay }, () => this.calculatePrice())
  },

  selectPets() {
    wx.navigateTo({
      url: '/subpackages/booking/pet-select?from=confirm',
      fail: () => { this.error('PET_SELECT_PET_REQUIRED') },
    })
  },

  onShow() {
    const globalSelectedPets = BookingData.get('selectedPets')
    const globalSelectedPetDetails = BookingData.get('selectedPetDetails')
    const globalPetServices = BookingData.get('petServices')

    const updates = {}

    if (globalSelectedPets && JSON.stringify(globalSelectedPets) !== JSON.stringify(this.data.selectedPets)) {
      updates.selectedPets = globalSelectedPets
      updates.selectedPetsDetails = globalSelectedPetDetails || []
      updates.petServices = globalPetServices || {}
    } else if (globalSelectedPetDetails && globalSelectedPetDetails.length > 0 &&
               JSON.stringify(globalSelectedPetDetails) !== JSON.stringify(this.data.selectedPetsDetails)) {
      updates.selectedPetsDetails = globalSelectedPetDetails
      updates.petServices = globalPetServices || {}
    }

    this._batchUpdate(updates, () => {
      if (updates.selectedPets) {this.calculatePrice()}
    })

    if (this.data.selectedDates && this.data.selectedDates.start && this.data.selectedDates.end && this.data.hostPrice > 0) {
      if (this.data.priceCalculated) {this.calculatePrice()}
    }
  },

  /**
   * 确认下单主流程
   * 流程：参数校验 → 优惠券锁定 → 获取寄养家庭信息 → 创建订单 → 使用优惠券 → 发起微信支付 → 更新状态
   */
  async confirmBooking() {
    let lockedCouponId = null
    try {
      // ===== 参数校验 =====
      if (!this.data.selectedDates || !this.data.selectedDates.days) {
        this.error('DATE_RANGE_REQUIRED')
        return
      }
      if (!this.data.selectedPets || this.data.selectedPets.length === 0) {
        this.error('PET_REQUIRED')
        return
      }
      if (this.data.totalPrice <= 0) {
        this.error('ORDER_AMOUNT_INVALID')
        return
      }

      const identity = authService.getCurrentIdentity()
      if (!authService.isLoggedIn() || !identity?._id) {
        this.error('AUTH_REQUIRED')
        return
      }

      this._batchUpdate({ loading: true })

      // ===== 优惠券锁定 =====
      const orderId = `board_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

      if (this.data.selectedCouponId) {
        try {
          const lockRes = await CouponService.lockCoupon(this.data.selectedCouponId, orderId, 'boarding_order', 'boarding')
          if (lockRes && lockRes.code !== 0) {
            this.errorDynamic(lockRes.message, 'COUPON_LOCK_FAILED')
            this._batchUpdate({ loading: false })
            return
          }
          lockedCouponId = this.data.selectedCouponId
        } catch (lockErr) {
          this.error('COUPON_LOCK_FAILED_RETRY')
          this._batchUpdate({ loading: false })
          return
        }
      }

      // ===== 获取寄养家庭信息 =====
      const hostInfoRes = await HostService.getHostInfo(this.data.hostId)
      if (hostInfoRes.code !== 0) {
        throw new Error(hostInfoRes.message || '获取寄养家庭信息失败')
      }

      // ===== 构造订单数据 =====
      const globalSelectedDates = BookingData.get('selectedDatesTimestamp')
      const startDateObj = globalSelectedDates?.start ? new Date(globalSelectedDates.start) : new Date()
      const endDateObj = globalSelectedDates?.end ? new Date(globalSelectedDates.end) : new Date()

      const formatDateToYYYYMMDD = date => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const orderData = {
        hostId: this.data.hostId,
        startDate: formatDateToYYYYMMDD(startDateObj),
        endDate: formatDateToYYYYMMDD(endDateObj),
        days: this.data.selectedDates.days,
        petIds: this.data.selectedPets,
        petDetails: this.data.selectedPetsDetails,
        petServices: this.data.petServices,
        requirements: BookingData.get('bookingRequirements'),
        basicPrice: this.data.basicPrice,
        discount: this.data.discount,
        totalPrice: this.data.totalPrice,
        finalPrice: this.data.selectedCouponId ? this.data.finalPrice : this.data.totalPrice,
        couponId: this.data.selectedCouponId || undefined,
        couponDiscount: this.data.couponDiscount || 0,
        status: 'pending_payment',
        paymentStatus: 'unpaid',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // ===== 创建订单 =====
      const createResult = await orderManager.createOrder(orderData)
      const finalOrderId = createResult.orderId || createResult._id

      // P1-B 修复：不再在此处 useCoupon（支付前核销）——券保持 locked，
      //   支付成功由 paymentService 支付回调（notify）统一核销（business='boarding'）；
      //   支付取消/失败/超时由前端 unlock 或取消/超时路径解锁（unlockOrderCoupons 按 couponId 直解）

      // ===== 发起微信支付（使用折后价） =====
      const payAmount = this.data.selectedCouponId ? this.data.finalPrice : this.data.totalPrice
      try {
        await this.initiateWechatPayment(finalOrderId, payAmount)
      } catch (payError) {
        // P1-B 修复：支付失败/取消时释放已锁定的券（lockedCouponId 在本作用域），
        //   避免券卡 locked；订单保留待支付，可稍后在订单列表重新支付
        if (lockedCouponId) {
          CouponService.unlockCoupon(lockedCouponId).catch(e => {
            console.error('[confirm] 支付失败解锁优惠券失败（超时路径会兜底）:', e)
          })
        }
        this.error('ORDER_CREATED_PAY_LATER')
        setTimeout(() => {
          wx.redirectTo({ url: '/subpackages/profile/order-stats/index?type=boarding' })
        }, 1500)
      }
    } catch (error) {
      // ===== 异常回滚：解锁优惠券 =====
      if (lockedCouponId) {
        CouponService.unlockCoupon(lockedCouponId).catch(e => {
          console.error('[confirm] 优惠券解锁失败（需人工处理）:', e)
        })
      }
      this.error(() => `操作失败：${error.message}`)
      this._batchUpdate({ loading: false })
    }
  },

  /**
   * 发起微信支付
   * 调用云函数获取支付参数 → 调起微信支付 → 成功后更新订单状态并跳转
   */
  async initiateWechatPayment(orderId, amount) {
    try {
      const petNames = (this.data.selectedPetsDetails || []).map(p => p.name || '').filter(Boolean).join('、')
      const dateText = this.data.selectedDates
        ? `${this.data.selectedDates.start?.text || ''}-${this.data.selectedDates.end?.text || ''}`
        : ''
      const hostName = this.data.hostName || '寄养家庭'
      const payDesc = `寄养-${hostName}-${petNames || '宠物'}-${dateText || `${this.data.selectedDates?.days || 0}天`}`

      const result = await PaymentService.pay({
        type: 'order',
        orderId,
        amount: Math.round(amount * 100),
        description: payDesc.substring(0, 127),
      })

      this.updateOrderStatus(orderId, 'paid')
      this.toast('PAYMENT_SUCCESS')
      BookingData.reset()
      setTimeout(() => {
        wx.redirectTo({ url: `/subpackages/profile/order-detail/index?id=${orderId}` })
      }, 1500)
    } catch (error) {
      if (error.isCancel) {
        this.error('PAYMENT_CANCELLED')
      } else if (error.isPending) {
        this.error(() => error.message, { duration: 3000 })
      } else {
        // 注意：onGoPay 的 showModal 弹窗也复用同款"重新支付"，但触发场景不同
        // —— 这里只覆盖"支付失败"分支，并在 success 里调 initiateWechatPayment 重试。
        this.showModal({
          titleKey: 'PAYMENT_FAILED',
          contentKey: 'BIZ_24KPRW',
          cancelText: '稍后再说',
          confirmText: '重新支付',
          success: (confirmed) => {
            if (!confirmed) {return}
            this.initiateWechatPayment(orderId, amount)
          },
        })
      }
      this._batchUpdate({ loading: false })
    }
  },

  /**
   * 更新订单状态（带重试）
   * 支付成功后调用，失败时最多重试3次（指数退避），确保订单状态最终一致
   */
  async updateOrderStatus(orderId, status) {
    const MAX_RETRIES = 3
    const BASE_DELAY = 1000

    for (let i = 0; i <= MAX_RETRIES; i++) {
      try {
        await OrderService.updateBookingStatus(orderId, status)
        return
      } catch (error) {
        if (i < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, i)
          console.warn(`[confirm] 订单状态更新失败，${delay}ms后重试(${i + 1}/${MAX_RETRIES}):`, error)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          console.error('[confirm] 订单状态更新最终失败，需人工处理:', orderId, status, error)
        }
      }
    }
  },

  onUnload() {
    if (this.loginStateUnsubscribe) {
      this.loginStateUnsubscribe()
    }
  },

  handleLoginStateChange(state) {
    this._batchUpdate({ isLoggedIn: state.isLoggedIn, userInfo: state.userInfo || {} })
  },
})
