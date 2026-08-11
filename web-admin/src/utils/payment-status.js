/**
 * 派生订单的支付状态用于 UI 展示。
 *
 * 与 constants/order.js 的纯数据（LABELS/TAG_TYPE）分离：
 * 派生函数依赖 order 对象（status + paymentStatus + 金额）做逻辑判断，
 * 属于业务逻辑而非纯数据定义。小程序端需各自实现一份同款逻辑。
 *
 * 规则（按优先级）：
 *   1. status === 'refunded' → 'refunded'
 *   2. status === 'cancelled'：
 *       - paymentStatus === 'refunded' 时外层 status 一般也是 'refunded'，已被规则 1 拦截
 *       - 诚实版：直接返回 paymentStatus 原始值，不强制映射到 'closed'
 *       - 历史数据清理后 cancelled 订单的 paymentStatus 已统一为 'closed'（非 refunded），
 *         但新取消的订单可能保留原 paymentStatus，展示层应诚实反映
 *       - paymentStatus 缺省时回退 'closed'
 *   3. paymentStatus === 'paid' 且金额为 0 → 'free'
 *      加 'paid' 守卫：历史数据中金额字段缺失（undefined → Number() → 0）的订单
 *      不应被误判为免费，只有已支付且金额为 0 才算免费
 *      金额取 totalPrice / totalAmount / finalAmount 中第一个非 NaN 且 truthy 的值，
 *      若三者均 falsy（含 0、undefined、NaN）则按 0 处理
 *      免费活动/0元秒杀等无需走支付流程，显示「未支付」会让用户困惑
 *   4. 其他 → 原始 paymentStatus，缺省为 'unpaid'
 *
 * 注意：业务条件（如退款按钮 v-if）应直接用 order.paymentStatus === 'paid'，
 * 不要用本函数的返回值——free 派生后 'free' !== 'paid' 会误伤免费订单的退款入口。
 *
 * 配合：constants/order.js 的 PAYMENT_STATUS_LABELS 需覆盖所有可能的 paymentStatus 值
 * （含 cancelled 诚实版可能返回的 unpaid/paying/paid/closed 等）。
 *
 * @param {{status?: string, paymentStatus?: string, totalPrice?: number, totalAmount?: number, finalAmount?: number}} order
 * @returns {string} 归一化后的 paymentStatus，可直接用于 PAYMENT_STATUS_LABELS 查表
 */
export function normalizePaymentStatus(order) {
  if (!order) return 'unpaid'
  const { status, paymentStatus } = order
  if (status === 'refunded') return 'refunded'
  if (status === 'cancelled') {
    // 诚实版：返回实际 paymentStatus，不强制映射到 closed
    // 历史数据清理后 cancelled 订单的 paymentStatus 已统一为 'closed'（非 refunded）
    // 但新取消的订单可能保留原 paymentStatus，展示层应诚实反映
    return paymentStatus || 'closed'
  }
  // 0 元订单视为免费（仅当已支付时；兼容各集合金额字段命名差异）
  // 金额取 totalPrice / totalAmount / finalAmount 中第一个非 NaN 且 truthy 的值，
  // 三者均 falsy 时回退 0
  if (paymentStatus === 'paid') {
    const amount = Number(order.totalPrice) || Number(order.totalAmount) || Number(order.finalAmount) || 0
    if (amount === 0) return 'free'
  }
  return paymentStatus || 'unpaid'
}
