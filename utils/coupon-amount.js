/**
 * utils/coupon-amount.js
 *
 * 优惠券抵扣金额计算工具（Sprint 27）
 *
 * 规则：
 *   1. 订单本身 ≤ 0 元（免费活动/0 元商品）→ 视为免费订单，不允许用券
 *   2. 订单原价 > 0 元时，券抵扣后金额最低 0.1 元（与微信支付最低一致）
 *   3. 0.1 元下限是"封顶"作用：券抵扣金额不能超过 (原价 - 0.1)
 *
 * 用法：
 *   const { computeFinalAmount, COUPON_MIN_AMOUNT } = require('../../utils/coupon-amount')
 *   const { finalAmount, couponDiscount, shouldClear } = computeFinalAmount(totalAmount, couponDiscount)
 *
 *   - finalAmount: 计算后的应付金额
 *   - couponDiscount: 实际应用的折扣（保持用户视角，即"减了 50"）
 *   - shouldClear: 是否需要清空已选优惠券（订单本身 ≤ 0 时）
 */

const MIN_AMOUNT = 0.1  // 最低 0.1 元

function computeFinalAmount(totalAmount, couponDiscount) {
  const total = Number(totalAmount) || 0
  const discount = Number(couponDiscount) || 0

  // 规则 1：订单本身 ≤ 0 → 免费订单，不允许用券
  if (total <= 0) {
    return {
      finalAmount: 0,
      couponDiscount: 0,
      shouldClear: true,
    }
  }

  // 规则 2：订单 > 0 → 券抵扣
  const rawFinal = Math.max(0, Math.round((total - discount) * 100) / 100)

  // 规则 3：抵扣后 < 0.1 → 强制 0.1 元（封顶）
  const finalAmount = rawFinal < MIN_AMOUNT ? MIN_AMOUNT : rawFinal

  return {
    finalAmount,
    couponDiscount: discount,
    shouldClear: false,
  }
}

module.exports = { computeFinalAmount, COUPON_MIN_AMOUNT: MIN_AMOUNT }
