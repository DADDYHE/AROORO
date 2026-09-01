const { CloudFunctionService } = require('./CloudFunctionService')

class CouponService {
  async call(action, data = {}, options = {}) {
    return CloudFunctionService.call('couponService', { action, ...data }, options)
  }

  getMyCoupons(data, options) { return this.call('getMyCoupons', data, options) }
  getAvailableCoupons(data, options) { return this.call('getAvailableCoupons', data, options) }
  getClaimableTemplates(data, options) { return this.call('getClaimableTemplates', data, options) }
  getPopupCoupon(data, options) { return this.call('getPopupCoupon', data, options) }
  claimCoupon(templateId, source, options) { return this.call('claimCoupon', { templateId, source }, options) }
  lockCoupon(couponId, orderId, orderType, business, options) { return this.call('lockCoupon', { couponId, orderId, orderType, business }, options) }
  useCoupon(couponId, orderId, business, originalAmount, discountAmount, finalAmount, options) { return this.call('useCoupon', { couponId, orderId, business, originalAmount, discountAmount, finalAmount }, options) }
  unlockCoupon(couponId, options) { return this.call('unlockCoupon', { couponId }, options) }
}

module.exports = { CouponService: new CouponService() }
