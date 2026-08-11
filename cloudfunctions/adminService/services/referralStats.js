/**
 * referralStats.js - 推广/邀请统计统一口径（2026-08-04 治理）
 *
 * 背景：团购订单被双写（orders.type='group_buy' + tuan_orders），
 *   且各集合金额字段不统一（商城/团购/喂养/活动报名写 totalAmount，寄养写 totalPrice），
 *   导致按「orders 全量桶 + 专项桶」累加的统计出现订单数重复计、金额漏计。
 *
 * 统一规则：
 *   1) 每个板块只从一个权威集合取数，绝不同时查两个集合：
 *      - mall / boarding / tuan  → orders（按 type 区分）
 *      - feeding                 → feedingOrders
 *      - activity                → activity_registrations（镜像单不重复计）
 *   2) 状态集 = 已支付且未取消（各板块状态机不同，分别列全）
 *   3) 金额统一按 totalAmount || totalPrice || price 解析（兼容历史数据）
 */
const { initCloud } = require('../common/utils')

const { db } = initCloud()
const _ = db.command

const REFERRAL_BOARDS = [
  { type: 'mall', collection: 'orders', where: { type: 'mall' }, statuses: ['paid', 'shipped', 'completed'] },
  // 寄养口径与 getBoardingOrders 对齐：orders 中非 mall/group_buy 的订单（兼容历史无 type / type=hosting 记录）
  { type: 'boarding', collection: 'orders', where: { type: _.nin(['mall', 'group_buy']), orderType: _.nin(['activity']) }, statuses: ['paid', 'confirmed', 'in_progress', 'completed'] },
  { type: 'tuan', collection: 'orders', where: { type: 'group_buy' }, statuses: ['paid', 'shipped', 'completed'] },
  { type: 'feeding', collection: 'feedingOrders', where: {}, statuses: ['paid', 'confirmed', 'in_progress', 'completed'] },
  // V5: 活动订单死状态 confirmed 移除，改为 paid（已支付）与 completed（活动结束）
  { type: 'activity', collection: 'activity_registrations', where: {}, statuses: ['paid', 'completed'] },
]

/** 统一金额解析：totalAmount || totalPrice || price */
function resolveOrderAmount(o) {
  return Number(o.totalAmount) || Number(o.totalPrice) || Number(o.price) || 0
}

/**
 * 拉取某板块某批用户的有效订单
 * @param {{collection:string, where?:object, statuses:string[]}} board
 * @param {string[]} ownerIds
 * @param {number} [limit]
 * @returns {Promise<Array>}
 */
async function fetchBoardOrders(board, ownerIds, limit = 5000) {
  const where = { ownerId: _.in(ownerIds), status: _.in(board.statuses), ...(board.where || {}) }
  const res = await db.collection(board.collection).where(where).limit(limit).get()
  return res.data || []
}

module.exports = { REFERRAL_BOARDS, resolveOrderAmount, fetchBoardOrders }
