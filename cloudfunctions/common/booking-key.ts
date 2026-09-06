/**
 * bookingKey：寄养订单防重复下单唯一键（orders.idx_bookingKey_unique）
 *
 * 业务语义（2026-09-06 定稿）：
 *   1. 同一用户重复下单（用户 + 家庭 + 起止日期 + 起止时刻 全部一致）→ 挡
 *   2. 不同用户即使日期时刻一致 → 不挡（键含 ownerId，天然区分）
 *   3. 同一用户取消/拒单/退款后重新下单同日期 → 不挡（终态时改写键位释放）
 *   4. 家庭可接宠物数（maxPets）仅展示不限制——不做容量维度
 *
 * 实现要点：CloudBase 无「条件唯一索引」，故取消时必须改写 bookingKey 释放原键位，
 *   否则取消单会永久占用该用户+家庭+时刻组合，导致无法重新下单。
 */

/** 构造唯一键：用户 + 家庭 + 起止日期 + 起止时刻 */
export function buildBookingKey(params: {
  hostId: string,
  startDate: string,
  endDate: string,
  startAt?: string,
  endAt?: string,
  ownerId: string,
}): string {
  const { hostId, startDate, endDate, startAt, endAt, ownerId } = params
  return `booking_${hostId}_${startDate}_${endDate}_${startAt || ''}_${endAt || ''}_${ownerId}`
}

/** 释放键位：订单进入终态（cancelled / rejected / refunded）时改写 bookingKey 为此值 */
export function releasedBookingKey(orderId: string): string {
  return `released_${orderId}_${Date.now()}`
}

/** 活跃订单状态集：占用 bookingKey（这些状态下不可重复下单） */
export const BOOKING_KEY_ACTIVE_STATUSES: string[] = [
  'pending_payment',
  'deposit_paid',
  'paid',
  'confirmed',
  'in_progress',
]

/** 终态：不占用 bookingKey（已释放） */
export const BOOKING_KEY_RELEASED_STATUSES: string[] = [
  'cancelled',
  'rejected',
  'refunded',
]
