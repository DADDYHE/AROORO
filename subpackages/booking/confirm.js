const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { orderManager } = require('../../services/OrderManager')
const { HostService, PetService } = require('../../services/CloudFunctionService')
const { authService } = require('../../services/AuthService')
const { BookingData } = require('../../utils/BookingDataService')
const { CouponService } = require('../../services/CouponService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { computeFinalAmount } = require('../../utils/coupon-amount')
const { isHoliday } = require('../../utils/holidays')
const { computeBoardingAmount } = require('../../utils/boarding-pricing')
const couponSelectorBehavior = require('../../behaviors/couponSelectorBehavior')

const pageI18n = require('../../utils/page-i18n.js')

const authGateBehavior = require('../../behaviors/authGateBehavior')
Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, couponSelectorBehavior, authGateBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    hostId: '',
    hostName: '',
    hostPrice: 0,
    selectedDates: { start: '', end: '', days: 0 },
    // 日期时间戳（响应式）：calculatePriceLocal 计费依据；updateDates / loadOrderInfo 双入口写入
    selectedDatesTimestamp: null,
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
    // ── 计费方式（2026-09-06 双计费算法）──
    billingMode: 'hotel',
    checkOutBefore: '12:00',
    // 时刻必填：默认空，未选齐不计价（下单前校验阻断）
    startTime: '',
    endTime: '',
    // 计费核心产出（hotel: nights/overtimeFee；hourly24: days/remainHours）
    chargeBreakdown: null,
    chargeNote: '',
  },

  // _batchUpdate 由 couponSelectorBehavior 提供（页面内重复定义会触发
  //   "[Component] method _batchUpdate from different behaviors is overriding" 警告）

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
      // P0 隔离（2026-09-14）：仅接受寄养流程（flow=booking）写入的数据；
      //   直接进入本页（boarding tab / 家庭详情 / 收藏）时若 flow 为上门流程（feeding）残留，
      //   先彻底清除，防止显示上门服务内容与价格
      if (BookingData.get('flow') !== 'booking') {
        BookingData.set('selectedPets', [])
        BookingData.set('selectedPetDetails', [])
        BookingData.set('petServices', {})
      }
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
          updates.selectedDates = this._decorateDates(selectedDates)
          const existingTimestamp = BookingData.get('selectedDatesTimestamp')
          if (!existingTimestamp || !existingTimestamp.start || !existingTimestamp.end) {
            this._restoreTimestampFromDisplay(selectedDates)
          }
          // timestamp 提升为 data 字段（calculatePriceLocal 计费依据，响应式）
          updates.selectedDatesTimestamp = BookingData.get('selectedDatesTimestamp') || null
        } else {
          updates.selectedDates = this._decorateDates(this._formatStringDates(selectedDates))
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
      this._batchUpdate({ selectedPetsDetails: petsDetails.filter(d => d !== null).map(d => this._decoratePetHealth(d)) })
    } catch (error) {
      this._batchUpdate({ selectedPetsDetails: [] })
    }
  },

  /**
   * 宠物健康信息摘要标签（Skyline：WXML 不做方法调用，JS 预计算）
   * 展示逻辑：有健康信息时显示标签提示家庭关注，无则不渲染
   */
  _decoratePetHealth(pet) {
    const h = pet && pet.healthInfo
    if (!h) { return { ...pet, healthTags: [] } }
    // 三字段兼容：旧字符串（非「无」即有）/ 新对象 { has, detail }
    const hasYes = (v) => (typeof v === 'string' ? (v.trim() && v.trim() !== '无') : (v && v.has === 'yes'))
    const tags = []
    if (h.allergies) { tags.push('有过敏源') }
    if (hasYes(h.medications)) { tags.push('有用药') }
    if (hasYes(h.medicalHistory)) { tags.push('有病史') }
    if (hasYes(h.supplements)) { tags.push('有保健品') }
    if (h.vaccines && h.vaccines.length > 0) { tags.push(`疫苗 ${h.vaccines.length} 针`) }
    if (h.neutered === 'yes') { tags.push('已绝育') }
    if (h.behaviorNotes) { tags.push('行为备注') }
    return { ...pet, healthTags: tags }
  },

  async loadHostInfo() {
    try {
      if (this.data.hostPrice > 0) {
        this.calculatePrice()
        return
      }

      // 直查单条（getHostDetail），取代 getHostList 拉整页再 .find——host 不在第一页会查不到
      const result = await HostService.getHostInfo(this.data.hostId)

      if (result && result.code === 0 && result.data) {
        const host = result.data
        const price = host.pricePerDay || host.price || 0
        this._batchUpdate({
          hostName: host.hostName || '寄养家庭',
          hostPrice: price,
          // 计费方式由家庭档案决定（服务端兜底 hotel/12:00，前端同口径兜底）
          billingMode: host.billingMode || 'hotel',
          checkOutBefore: host.checkOutBefore || '12:00',
          priceCalculated: true,
        }, () => this.calculatePrice())
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
    const { selectedPetsDetails, hostPrice, petServices, selectedDatesTimestamp, startTime, endTime } = this.data
    const pricePerDay = hostPrice > 0 ? hostPrice : 0

    if (pricePerDay === 0) {
      this.error('PRICE_REQUIRED')
      return
    }

    if (!selectedPetsDetails || selectedPetsDetails.length === 0) {return}

    // 时刻必填：未选齐时刻（或日期未定）不计价，展示引导文案而非裸 0 元
    if (!startTime || !endTime || !selectedDatesTimestamp || !selectedDatesTimestamp.start || !selectedDatesTimestamp.end) {
      this._batchUpdate({
        basicPrice: 0, totalPrice: 0, finalPrice: 0,
        serviceBreakdown: [], chargeBreakdown: null,
        chargeNote: '请先选择入住与离开时刻',
      })
      return
    }

    const petCount = selectedPetsDetails.length
    const hasServiceDates = selectedPetsDetails.some(pet => {
      const svc = petServices[pet.id]
      return svc && svc.serviceDates && svc.serviceDates.length > 0
    })

    let basePrice = 0
    let walkTotal = 0
    const breakdown = []
    let chargeBreakdown = null
    let chargeNote = ''

    if (hasServiceDates) {
      // 上门服务遗留分支（寄养流程不再产生 petServices，仅历史入口兼容）：48/58 每天 + 遛狗
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
          serviceDaysLabel: `${serviceDays}天`,
          baseAmount: petBase,
          walkMinutes: petWalk,
          walkAmount: petWalk,
          subtotal: petBase + petWalk,
        })
      })
    } else {
      // 寄养主分支：计费核心（hotel 按夜+超时 / hourly24 24h 一天+尾数小时），与云函数同源算法
      let pricing
      try {
        pricing = computeBoardingAmount({
          mode: this.data.billingMode,
          pricePerDay,
          startDate: this._ymdFromTs(selectedDatesTimestamp.start),
          endDate: this._ymdFromTs(selectedDatesTimestamp.end),
          startAt: startTime,
          endAt: endTime,
          petCount,
          checkOutBefore: this.data.checkOutBefore,
        })
      } catch (e) {
        // 时刻倒挂等非法组合：清零金额并展示原因（服务端下单同样会拦截）
        this._batchUpdate({
          basicPrice: 0, totalPrice: 0, finalPrice: 0,
          serviceBreakdown: [], chargeBreakdown: null,
          chargeNote: (e && e.message) || '',
        })
        return
      }

      basePrice = pricing.total
      chargeBreakdown = pricing.breakdown
      chargeNote = this._buildChargeNote(pricing.breakdown)

      // 每宠物分摊展示（末位补差，保证合计 = total）
      const perPet = Math.round((pricing.total / petCount) * 100) / 100
      selectedPetsDetails.forEach((pet, idx) => {
        const amount = idx === petCount - 1
          ? Math.round((pricing.total - perPet * (petCount - 1)) * 100) / 100
          : perPet
        breakdown.push({
          name: pet.name || '未知',
          // 明细标签（JS 预计算，Skyline wxml 禁方法调用）：
          //   hotel 按夜 / hourly24 按天（尾数小时另列于 chargeNote，不混入「天」）
          serviceDays: pricing.breakdown.mode === 'hotel' ? pricing.breakdown.nights : pricing.breakdown.days,
          serviceDaysLabel: pricing.breakdown.mode === 'hotel'
            ? `${pricing.breakdown.nights}晚`
            : (pricing.breakdown.remainHours > 0
              ? `${pricing.breakdown.days}天+${pricing.breakdown.remainHours}小时`
              : `${pricing.breakdown.days}天`),
          baseAmount: amount,
          walkMinutes: 0,
          walkAmount: 0,
          subtotal: amount,
        })
      })
    }

    const totalPrice = basePrice + walkTotal
    const { finalAmount, couponDiscount: finalCouponDiscount, shouldClear } = computeFinalAmount(totalPrice, this.data.couponDiscount)
    const finalPrice = finalAmount

    this._batchUpdate({
      basicPrice: basePrice,
      discount: 0,
      totalPrice,
      finalPrice,
      serviceBreakdown: breakdown,
      chargeBreakdown,
      chargeNote,
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
    this._loadAvailableCoupons(this._couponQueryOpts())
  },

  /** 本地时区 timestamp → 'YYYY-MM-DD'（前端铁律：本地北京时间；云函数侧独立换算，两端口径一致） */
  _ymdFromTs(ts) {
    const d = new Date(ts)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  },

  /** 计费提示（纯字符串预计算，Skyline wxml 禁方法调用；金额统一 2 位小数四舍五入显示） */
  _buildChargeNote(bd) {
    if (!bd) {return ''}
    if (bd.mode === 'hotel') {
      if (!bd.overtimeMinutes) {return ''}
      const h = Math.floor(bd.overtimeMinutes / 60)
      const m = bd.overtimeMinutes % 60
      const dur = m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
      const fee = (bd.overtimeFee * (bd.petCount || 1)).toFixed(2)
      return `晚于 ${bd.checkOutBefore} 离开，超时 ${dur}，加收 ¥${fee}`
    }
    // hourly24
    const tail = bd.remainHours > 0 ? ` + ${bd.remainHours} 小时` : ''
    return `共 ${bd.billableHours} 小时 = ${bd.days} 天${tail}，小时价 ¥${bd.pricePerHour.toFixed(2)}`
  },

  onStartTimeChange(e) {
    this._batchUpdate({ startTime: (e.detail && e.detail.value) || '' }, () => this.calculatePrice())
  },

  onEndTimeChange(e) {
    this._batchUpdate({ endTime: (e.detail && e.detail.value) || '' }, () => this.calculatePrice())
  },

  // 券查询参数：由 couponSelectorBehavior 的 _loadAvailableCoupons(opts) 消费（与 mall/order-confirm 同约定）。
  //   缺 hostId 时 amount 传 0 → behavior 内部 `if (!amount) return` 短路，与服务端券作用域一致
  _couponQueryOpts() {
    const { hostId, totalPrice } = this.data
    return {
      business: 'boarding',
      items: hostId ? [hostId] : [],
      amount: hostId ? totalPrice : 0,
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
      return { text: `${month}月${day}日`, weekDay: weekDays[date.getDay()], relativeTag: this._relativeTag(date) }
    }

    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    const selectedDatesDisplay = { start: formatDate(startDate), end: formatDate(endDate), days }
    const selectedDatesTimestamp = { start: startDate.getTime(), end: endDate.getTime(), days }

    BookingData.set('selectedDates', selectedDatesDisplay)
    BookingData.set('selectedDatesTimestamp', selectedDatesTimestamp)

    this._batchUpdate({ selectedDates: selectedDatesDisplay, selectedDatesTimestamp }, () => this.calculatePrice())
  },

  /** 相对日预计算：0=今天 1=明天 2=后天，其余空串（Skyline 禁 wxml 方法调用） */
  _relativeTag(date) {
    if (!date) { return '' }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const diff = Math.round((d - today) / 86400000)
    return diff === 0 ? '今天' : diff === 1 ? '明天' : diff === 2 ? '后天' : ''
  },

  /** 补齐 relativeTag：优先 timestamp，退化从「x月xx日」文本解析（假定当年） */
  _decorateDates(dates) {
    if (!dates || !dates.start) { return dates }
    const mk = side => {
      const o = dates[side]
      if (!o || !o.text) { return { ...o, relativeTag: '' } }
      let d = null
      const ts = (BookingData.get('selectedDatesTimestamp') || {})[side]
      if (ts) {
        d = new Date(ts)
      } else {
        const m = String(o.text).match(/(\d{1,2})月(\d{1,2})日/)
        if (m) {
          d = new Date()
          d.setMonth(Number(m[1]) - 1, Number(m[2]))
        }
      }
      return { ...o, relativeTag: d ? this._relativeTag(d) : '' }
    }
    return { ...dates, start: mk('start'), end: mk('end') }
  },

  selectPets() {
    wx.navigateTo({
      url: '/subpackages/booking/pet-select?from=confirm',
      fail: () => { this.error('PET_SELECT_PET_REQUIRED') },
    })
  },

  onShow() {
    // P0 隔离（2026-09-14）：仅寄养流程（flow=booking）的数据可被本页读取；
    //   上门流程残留（flow=feeding）一律忽略，防止串扰
    const flow = BookingData.get('flow')
    const globalSelectedPets = flow === 'booking' ? BookingData.get('selectedPets') : null
    const globalSelectedPetDetails = flow === 'booking' ? BookingData.get('selectedPetDetails') : null
    const globalPetServices = flow === 'booking' ? BookingData.get('petServices') : null

    // 兜底（2026-09-14）：无当前选中宠物却带上门服务配置（petServices）→
    //   视为上门喂养流程残留（未提交/未走寄养 pet-select 直接进入本页），丢弃，
    //   防止寄养确认页显示上门服务内容与价格。
    if (globalPetServices && Object.keys(globalPetServices).length > 0 &&
        (!globalSelectedPets || globalSelectedPets.length === 0)) {
      BookingData.set('petServices', {})
      this.setData({ petServices: {} })
    }

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
      // 日期已选即可（同日寄养 days=0 合法：hotel 降级按小时 / hourly24 按小时计）
      if (!this.data.selectedDates || !this.data.selectedDates.start || !this.data.selectedDates.start.text) {
        this.error('DATE_RANGE_REQUIRED')
        return
      }
      // 时刻必填（2026-09-06）：hotel 超时判定 / hourly24 计费的依据
      if (!this.data.startTime || !this.data.endTime) {
        this.error(() => '请选择入住与离开时刻')
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
        startAt: this.data.startTime,
        endAt: this.data.endTime,
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
      // createOrder 返回 { code, data, message }，订单号在 data 内（data.orderId / data._id）。
      //   直接取顶层 createResult.orderId 恒为 undefined → createPayment 报「缺少订单类型或订单号」（前端映射“请求参数不正确”）
      const orderPayload = (createResult && createResult.data) || {}
      const finalOrderId =
        orderPayload.orderId || orderPayload._id || createResult.orderId || createResult._id

      if (!createResult || createResult.code !== 0 || !finalOrderId) {
        throw new Error((createResult && createResult.message) || '订单创建失败')
      }

      // 2026-09-06 流程重构：提交订单页不再调起支付
      //   支付决策（全款 / 30% 定金）延后到订单详情页，家庭可在此之前改价
      //   券保持 locked，支付成功由 notify 核销；不支付由超时取消兜底解锁
      this.toast(() => '订单已提交，请在订单详情中完成支付')
      this._batchUpdate({ loading: false })
      BookingData.reset()
      setTimeout(() => {
        wx.redirectTo({ url: `/subpackages/profile/order-detail/index?id=${finalOrderId}` })
      }, 1200)
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

  onUnload() {
    if (this.loginStateUnsubscribe) {
      this.loginStateUnsubscribe()
    }
  },

  handleLoginStateChange(state) {
    this._batchUpdate({ isLoggedIn: state.isLoggedIn, userInfo: state.userInfo || {} })
  },
})
