const { ActivityService } = require('./services/ActivityService')
const { CouponService } = require('../../services/CouponService')
const PaymentService = require('../../services/PaymentService')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const countdownBehavior = require('../../behaviors/countdownBehavior')

const pageI18n = require('../../utils/page-i18n.js')
const { requireLogin } = require('../../utils/require-login')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, countdownBehavior],
  data: {
    mode: 'new',
    registrationId: '',
    paymentOrderId: '',
    activityId: '',
    activity: null,
    pets: [],
    petNames: '',
    phone: '',
    notes: '',
    friends: [],
    petIds: [],
    participantCount: 1,
    totalAmount: 0,
    originalAmount: 0,
    couponId: '',
    couponDiscount: 0,
    finalAmount: 0,
    paying: false,
    orderStatus: '',
    orderStatusText: '',
    orderNo: '',
    actions: [],
    actionTip: '',
    isLoading: true,
    // 支付倒计时计算用：原始创建时间戳 + 超时分钟（与后端 ORDER_TIMEOUT_MINUTES=30 对齐）
    createdAtTs: 0,
    timeoutMinutes: 30,
  },

  async onLoad(options) {
    this._initNavbarHeight()
    if (!(await requireLogin())) {
      return
    }

    if (options.registrationId) {
      this.setData({ mode: 'detail', registrationId: options.registrationId })
      wx.setNavigationBarTitle({ title: '订单详情' })
      this._loadRegistrationDetail(options.registrationId)
    } else if (options.data) {
      wx.setNavigationBarTitle({ title: '确认支付' })
      try {
        const registrationData = JSON.parse(decodeURIComponent(options.data))
        this.setData({
          activityId: registrationData.activityId,
          pets: registrationData.pets,
          petNames: registrationData.pets.map(p => p.petName).join('、'),
          phone: registrationData.phone,
          notes: registrationData.notes || '',
          friends: registrationData.friends || [],
          petIds: registrationData.petIds || [],
          participantCount: registrationData.participantCount || 1,
          totalAmount: registrationData.totalAmount,
          originalAmount: registrationData.originalAmount,
          couponId: registrationData.couponId || '',
          couponDiscount: registrationData.couponDiscount || 0,
          finalAmount: registrationData.totalAmount,
          isLoading: false,
        })
        this._loadActivity()
      } catch (e) {
        console.error('[Payment] 解析报名数据失败:', e)
        wx.navigateBack()
      }
    } else {
      wx.navigateBack()
    }
  },

  // 详情态底部操作栏配置（UI 展示层）：key 对应 onAction 分支
  // 待支付且活动未结束 → 去支付；待支付但活动已结束 → 纯文字提示
  _buildDetailActions(orderStatus, finalAmount, activityExpired) {
    if (orderStatus !== 'pending_payment') {
      return { actions: [], tip: '' }
    }
    if (activityExpired) {
      return { actions: [], tip: '活动已结束，无法继续支付' }
    }
    return {
      actions: [{ key: 'pay', text: `去支付 ¥${finalAmount}`, type: 'primary' }],
      tip: '',
    }
  },

  onAction(e) {
    const { action } = e.detail || {}
    if (action === 'pay') this.onGoPay()
  },

  async _loadRegistrationDetail(registrationId) {
    try {
      const result = await ActivityService.getRegistrationDetail(registrationId)
      if (!result || result.code !== 0 || !result.data) {
        this.error('ORDER_NOT_FOUND')
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const { registration, activityInfo } = result.data
      const statusMap = {
        pending_payment: '待付款',
        paid: '已支付',
        completed: '已完成',
        cancelled: '已取消',
        refunded: '已退款',
      }

      const activity = activityInfo || {}

      let activityExpired = false
      if (activity.endDate || activity.endTime || activity.endTime) {
        const endTime = activity.endDate || activity.endTime || activity.endTime
        const endDate = new Date(String(endTime).replace(/-/g, '/'))
        if (!isNaN(endDate.getTime()) && new Date() > endDate) {
          activityExpired = true
        }
      }

      const finalAmount = registration.finalAmount || registration.totalAmount || 0
      const orderStatus = registration.status || ''
      const detailActions = this._buildDetailActions(orderStatus, finalAmount, activityExpired)

      this.setData({
        activityId: registration.activityId,
        paymentOrderId: registration._id || registrationId,
        activity,
        pets: registration.pets || [],
        petNames: (registration.pets || []).map(p => p.name || '').join('、'),
        phone: registration.phone || '',
        notes: registration.notes || '',
        friends: registration.friends || [],
        participantCount: registration.participantCount || 1,
        totalAmount: registration.totalAmount || 0,
        originalAmount: registration.originalAmount || registration.totalAmount || 0,
        couponId: registration.couponId || '',
        couponDiscount: registration.couponDiscount || 0,
        finalAmount,
        orderStatus,
        orderStatusText: statusMap[registration.status] || registration.status || '',
        orderNo: registration.orderNo || '',
        activityExpired,
        actions: detailActions.actions,
        actionTip: detailActions.tip,
        // 保留原始创建时间戳，供支付倒计时计算（与后端 ORDER_TIMEOUT_MINUTES=30 对齐）
        createdAtTs: registration.createdAt ? new Date(registration.createdAt).getTime() : 0,
        timeoutMinutes: 30,
        isLoading: false,
      })
      this._loadedOnce = true
      // 待支付订单启动支付倒计时（仅 detail 模式；与后端 30min 超时取消对齐）
      if (this.data.mode === 'detail' && this.data.orderStatus === 'pending_payment') {
        this._startPayCountdown((this.data.createdAtTs || 0) + (this.data.timeoutMinutes || 30) * 60 * 1000)
      } else {
        this._stopPayCountdown()
      }
    } catch (e) {
      console.error('[Payment] 加载订单详情失败:', e)
      this.setData({ isLoading: false })
      this.error('LOAD_FAILED')
    }
  },

  async _loadActivity() {
    const { activityId } = this.data
    try {
      const result = await ActivityService.getActivityDetail(activityId)
      if (result && result.code === 0) {
        this.setData({ activity: result.data })
      }
    } catch (e) {
      console.error('[Payment] 加载活动详情失败:', e)
    }
  },

  async onGoPay() {
    if (this.data.paying) {return}
    this.setData({ paying: true })

    const { paymentOrderId, finalAmount, activity } = this.data

    try {
      await PaymentService.pay({
        type: 'activity',
        orderId: paymentOrderId,
        amount: Math.round(finalAmount * 100),
        description: `活动报名-${activity?.title || ''}`,
      })

      this.toast('PAYMENT_SUCCESS')
      setTimeout(() => {
        this._loadRegistrationDetail(this.data.registrationId)
      }, 1500)
    } catch (payErr) {
      this.setData({ paying: false })
      if (payErr.isCancel) {
        this.error('PAYMENT_CANCELLED')
      } else if (payErr.isPending) {
        this.error(() => payErr.message, { duration: 3000 })
      } else {
        this.errorDynamic(payErr.message, 'PAYMENT_FAILED')
      }
    }
  },

  async onConfirmPay() {
    if (this.data.paying) {return}
    this.setData({ paying: true })

    const {
      activityId, pets, phone, notes, friends, petIds, participantCount,
      totalAmount, originalAmount, couponId, couponDiscount, finalAmount,
    } = this.data

    let lockedCouponId = null

    try {
      // P0-B 修复：活动报名单 ID 由前端预生成并传给 submitRegistration，
      //   与 couponService.lockCoupon 关联的 orderId 保持一致（对齐 mall/tuan 模式）。
      //   此前传空字符串会导致 lockCoupon 以"订单ID格式错误"拒绝，活动带券报名必失败。
      const preRegId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
      if (couponId) {
        const lockRes = await CouponService.lockCoupon(couponId, preRegId, 'activity_registration', 'activity')
        if (lockRes && lockRes.code !== 0) {
          this.setData({ paying: false })
          this.errorDynamic(lockRes.message, 'COUPON_LOCK_FAILED')
          return
        }
        lockedCouponId = couponId
      }

      const regResult = await ActivityService.submitRegistration({
        activityId, pets, phone, notes, friends, petIds, participantCount,
        totalAmount: finalAmount,
        originalAmount,
        couponId: couponId || undefined,
        couponDiscount,
        _registrationId: preRegId,
      })

      if (!regResult || regResult.code !== 0) {
        if (lockedCouponId) {await CouponService.unlockCoupon(lockedCouponId)}
        this.setData({ paying: false })
        this.errorDynamic(regResult?.message, 'ACTIVITY_REGISTRATION_FAILED')
        return
      }

      const registrationId = regResult.data?.registrationId || regResult.data?.id

      if (finalAmount <= 0) {
        if (lockedCouponId) {
          await CouponService.useCoupon(lockedCouponId, registrationId, 'activity', totalAmount, couponDiscount, finalAmount)
        }
        this._onSuccess()
        return
      }

      try {
        await PaymentService.pay({
          type: 'activity',
          orderId: registrationId,
          amount: Math.round(finalAmount * 100),
          description: `活动报名-${this.data.activity?.title || ''}`,
        })

        // P0-B: 付费活动券核销改由 paymentService 支付回调（notify）完成，与 mall/tuan 对齐；
        //   此处不再前端 useCoupon，避免"支付成功但回调未达"时券提前 used
        this._onSuccess()
      } catch (payErr) {
        // P0-B: 支付取消/失败必须释放已锁定的券（lockCoupon 在 submitRegistration 前已调用），
        //   否则券永久卡 locked
        if (lockedCouponId) {
          await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
        }
        if (payErr.isCancel) {
          this.error('PAYMENT_CANCELLED_KEPT')
        } else if (payErr.isPending) {
          this.error(() => payErr.message, { duration: 3000 })
        } else {
          this.errorDynamic(payErr.message, 'PAYMENT_FAILED_KEPT')
        }
        setTimeout(() => wx.navigateBack(), 1500)
      }
    } catch (error) {
      this.setData({ paying: false })
      if (lockedCouponId) {
        await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
      }
      console.error('[Payment] 支付流程失败:', error)
      this.error('OPERATION_RETRY_LATER')
    }
  },

  // 页面重新显示时刷新订单（支付/取消后返回需拿到最新状态），并重启倒计时
  onShow() {
    if (this._loadedOnce && this.data.mode === 'detail' && this.data.registrationId) {
      this._loadRegistrationDetail(this.data.registrationId)
    }
  },

  onHide() {
    this._stopPayCountdown()
  },

  onUnload() {
    this._stopPayCountdown()
  },

  _onSuccess() {
    const pages = getCurrentPages()
    for (let i = pages.length - 1; i >= 0; i--) {
      if (pages[i]._updateRegisteredState) {
        pages[i]._updateRegisteredState()
        break
      }
    }
    this.toast('ACTIVITY_REGISTRATION_SUCCESS')
    setTimeout(() => {
      wx.navigateBack({ delta: this.data.finalAmount > 0 ? 2 : 1 })
    }, 1500)
  },
})
