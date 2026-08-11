/**
 * 派生订单的支付状态用于 UI 展示。
 *
 * 与 constants/order.js 的纯数据（LABELS/TAG_TYPE）分离：
 * 派生函数依赖 order 对象（status + paymentStatus + 金额）做逻辑判断，
 * 属于业务逻辑而非纯数据定义。小程序端需各自实现一份同款逻辑。
 *
 * 规则（按优先级）：
 *   1. status === 'cancelled'：
 *       - paymentStatus === 'refunded' → 'refunded'
 *       - 其他（paying/unpaid/空/异常） → 'closed'（订单已取消无法再支付）
 *   2. status === 'refunded' → 'refunded'
 *   3. 0 元订单（totalPrice/totalAmount/finalAmount 任一为 0）→ 'free'
 *      免费活动/0元秒杀等无需走支付流程，显示「未支付」会让用户困惑
 *   4. 其他 → 原始 paymentStatus，缺省为 'unpaid'
 *
 * 注意：业务条件（如退款按钮 v-if）应直接用 order.paymentStatus === 'paid'，
 * 不要用本函数的返回值——free 派生后 'free' !== 'paid' 会误伤免费订单的退款入口。
 *
 * @param {{status?: string, paymentStatus?: string, totalPrice?: number, totalAmount?: number, finalAmount?: number}} order
 * @returns {string} 归一化后的 paymentStatus，可直接用于 PAYMENT_STATUS_LABELS 查表
 */
export function normalizePaymentStatus(order) {
  if (!order) return 'unpaid'
  const { status, paymentStatus } = order
  if (status === 'cancelled') {
    return paymentStatus === 'refunded' ? 'refunded' : 'closed'
  }
  if (status === 'refunded') return 'refunded'
  // 0 元订单视为免费（兼容各集合金额字段命名差异）
  const amount = Number(order.totalPrice) || Number(order.totalAmount) || Number(order.finalAmount) || 0
  if (amount === 0) return 'free'
  return paymentStatus || 'unpaid'
}
