const CouponService = {
  async call(action, data = {}) {
    const res = await wx.cloud.callFunction({
      name: 'couponService',
      data: { action, ...data },
      timeout: 20000,
    })
    return res.result
  },

  getMyCoupons(data) { return this.call('getMyCoupons', data) },
  getAvailableCoupons(data) { return this.call('getAvailableCoupons', data) },
  getClaimableTemplates(data) { return this.call('getClaimableTemplates', data) },
  getPopupCoupon(data) { return this.call('getPopupCoupon', data) },
  claimCoupon(templateId, source) { return this.call('claimCoupon', { templateId, source }) },
  lockCoupon(couponId, orderId, orderType, business) { return this.call('lockCoupon', { couponId, orderId, orderType, business }) },
  useCoupon(couponId, orderId, business, originalAmount, discountAmount, finalAmount) { return this.call('useCoupon', { couponId, orderId, business, originalAmount, discountAmount, finalAmount }) },
  unlockCoupon(couponId) { return this.call('unlockCoupon', { couponId }) },
}

module.exports = { CouponService }
