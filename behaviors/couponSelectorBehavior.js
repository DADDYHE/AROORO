/**
 * behaviors/couponSelectorBehavior.js
 *
 * 优惠券选择器行为模块
 *
 * 用途：
 *   - 封装优惠券选择/移除的通用逻辑
 *   - 减少 5 个订单确认页面的重复代码（~250 行）
 *
 * 用法：
 *   const couponSelectorBehavior = require('../../behaviors/couponSelectorBehavior')
 *   Page({
 *     behaviors: [couponSelectorBehavior],
 *     // 在 onLoad 中调用 this._initCouponSelector(totalPriceKey)
 *     // 在模板中使用 onToggleCouponSelector / onSelectCoupon / onRemoveCoupon
 *   })
 */

const { computeFinalAmount } = require('../utils/coupon-amount')
const { CouponService } = require('../services/CouponService')

const couponSelectorBehavior = Behavior({
  data: {
    showCouponSelector: false,
    selectedCouponId: '',
    selectedCoupon: null,
    couponDiscount: 0,
    availableCoupons: [],
    loadingCoupons: false,
  },

  methods: {
    _initCouponSelector(totalPriceKey = 'totalPrice') {
      this._couponTotalPriceKey = totalPriceKey
    },

    async _loadAvailableCoupons(opts = {}) {
      const amount = opts.amount || this.data[this._couponTotalPriceKey || 'totalPrice'] || 0
      if (!amount) {return}
      const business = opts.business || 'mall'
      const items = opts.items || []

      this.setData({ loadingCoupons: true })
      try {
        const result = await CouponService.getAvailableCoupons({ business, items, amount })
        if (result && result.code === 0) {
          this.setData({ availableCoupons: result.data || [] })
        }
      } catch (e) {
        // silent
      } finally {
        this.setData({ loadingCoupons: false })
      }
    },

    /**
     * 切换优惠券选择器显示/隐藏
     */
    onToggleCouponSelector() {
      this.setData({ showCouponSelector: !this.data.showCouponSelector })
    },

    /**
     * 选择优惠券
     * @param {Event} e - 点击事件，dataset 包含 id 和 amount
     */
    onSelectCoupon(e) {
      const { id, amount } = e.currentTarget.dataset
      const coupon = this.data.availableCoupons.find(c => c._id === id)
      if (!coupon) { return }

      // P2 修复：locked 券（正在其他订单中使用）明确提示，不允许选中
      if (coupon.status === 'locked') {
        wx.showToast({ title: '该优惠券正在使用中', icon: 'none' })
        return
      }

      const discountAmount = parseFloat(amount)
      const totalPrice = this.data[this._couponTotalPriceKey || 'totalPrice'] || 0
      const { finalAmount, couponDiscount, shouldClear } = computeFinalAmount(totalPrice, discountAmount)

      if (shouldClear) {
        // 免费订单不允许用券
        this._batchUpdate({
          selectedCouponId: '',
          selectedCoupon: null,
          couponDiscount: 0,
          finalPrice: 0,
          showCouponSelector: false,
        })
        return
      }

      this._batchUpdate({
        selectedCouponId: id,
        selectedCoupon: coupon,
        couponDiscount,
        finalPrice: finalAmount,
        showCouponSelector: false,
      })
    },

    /**
     * 移除已选优惠券
     */
    onRemoveCoupon() {
      const totalPrice = this.data[this._couponTotalPriceKey || 'totalPrice'] || 0
      this._batchUpdate({
        selectedCouponId: '',
        selectedCoupon: null,
        couponDiscount: 0,
        finalPrice: totalPrice,
      })
    },

    /**
     * 批量更新数据（兼容 Page 和 Component）
     * @param {Object} data - 要更新的数据
     * @param {Function} callback - 更新完成后的回调
     */
    _batchUpdate(data, callback) {
      if (this.setData) {
        this.setData(data, callback)
      }
    },
  },
})

module.exports = couponSelectorBehavior
