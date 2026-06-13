const { CloudFunctionService } = require('./CloudFunctionService')

class CouponService {
  async call(action, data = {}) {
    return CloudFunctionService.call('couponService', { action, ...data })
  }

  getMyCoupons(data) { return this.call('getMyCoupons', data) }
  getAvailableCoupons(data) { return this.call('getAvailableCoupons', data) }
  getClaimableTemplates(data) { return this.call('getClaimableTemplates', data) }
  getPopupCoupon(data) { return this.call('getPopupCoupon', data) }
  claimCoupon(templateId, source) { return this.call('claimCoupon', { templateId, source }) }
  lockCoupon(couponId, orderId, orderType, business) { return this.call('lockCoupon', { couponId, orderId, orderType, business }) }
  useCoupon(couponId, orderId, business, originalAmount, discountAmount, finalAmount) { return this.call('useCoupon', { couponId, orderId, business, originalAmount, discountAmount, finalAmount }) }
  unlockCoupon(couponId) { return this.call('unlockCoupon', { couponId }) }
}

module.exports = { CouponService: new CouponService() }
