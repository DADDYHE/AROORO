const { ActivityService } = require('./services/ActivityService')
const { CouponService } = require('../../services/CouponService')
const PaymentService = require('../../services/PaymentService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
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
    isLoading: true,
  },

  onLoad(options) {
    const app = getApp()
    const isLoggedIn = app && app.globalData && app.globalData.isLoggedIn
    if (!isLoggedIn) {
      const { authService } = require('../../services/AuthService')
      authService.startLogin()
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
        confirmed: '已确认',
        cancelled: '已取消',
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
        finalAmount: registration.finalAmount || registration.totalAmount || 0,
        orderStatus: registration.status || '',
        orderStatusText: statusMap[registration.status] || registration.status || '',
        activityExpired,
        isLoading: false,
      })
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
      if (couponId) {
        const lockRes = await CouponService.lockCoupon(couponId, '', 'activity_registration', 'activity')
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

        if (lockedCouponId) {
          await CouponService.useCoupon(lockedCouponId, registrationId, 'activity', totalAmount, couponDiscount, finalAmount)
        }
        this._onSuccess()
      } catch (payErr) {
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
