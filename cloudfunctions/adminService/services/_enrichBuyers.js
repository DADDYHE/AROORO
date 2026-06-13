/**
 * 订单买家/卖家字段 enrich helper
 *
 * 背景：
 *   订单文档（orders / feedingOrders / tuan_orders / activity_registrations）通常只存 ownerId（openid），
 *   而管理后台表格需展示买家昵称 / 手机号 / 头像。
 *   orders 集合历史上不冗余存 ownerInfo / ownerName，需在管理端按需 join。
 *
 * 功能：
 *   1) 收集一批订单的所有 ownerId（去重 + 过滤空）
 *   2) 一次 where({ _id: db.command.in(openids) }) 查 users
 *   3) 把 nickName / realName / phone / avatarUrl 映射到订单对象上：
 *      - buyerNickName: u.nickName || u.realName || order.receiverName || ''
 *      - buyerPhone: u.phone || order.receiverPhone || ''
 *      - buyerAvatarUrl: u.avatarUrl || ''
 *
 * 用法：
 *   const { enrichBuyerFields } = require('./_enrichBuyers')
 *   const list = await paginate(db, 'orders', { ... })
 *   return handleSuccess({ ...result, list: await enrichBuyerFields(db, list) })
 */

async function enrichBuyerFields(db, orders, options = {}) {
  if (!orders || orders.length === 0) return orders || []
  const { ownerField = 'ownerId' } = options
  const openids = [...new Set(orders.map((o) => o[ownerField]).filter(Boolean))]
  if (openids.length === 0) return orders

  const userMap = {}
  // 分批：单次 _.in 上限 ~1000，超出则分页
  const BATCH = 500
  for (let i = 0; i < openids.length; i += BATCH) {
    const batch = openids.slice(i, i + BATCH)
    const res = await db.collection('users')
      .where({ _id: db.command.in(batch) })
      .field({ _id: true, nickName: true, realName: true, phone: true, avatarUrl: true })
      .limit(BATCH)
      .get()
    ;(res.data || []).forEach((u) => { userMap[u._id] = u })
  }

  return orders.map((o) => {
    const u = userMap[o[ownerField]]
    return {
      ...o,
      buyerNickName: u?.nickName || u?.realName || o.receiverName || o.ownerName || o.userName || '',
      buyerPhone: u?.phone || o.receiverPhone || o.ownerPhone || '',
      buyerAvatarUrl: u?.avatarUrl || o.avatarUrl || '',
    }
  })
}

/**
 * 团订单 orderNo 补全 helper
 *
 * 背景：
 *   tuan_orders 集合本身不存 orderNo，orderNo 只在 orders 集合中（通过 tuanOrderId 关联）。
 *   管理后台显示团订单时需要从 orders 反查 orderNo。
 *
 * 用法：
 *   const list = await paginate(db, 'tuan_orders', { ... })
 *   return handleSuccess({ ...result, list: await enrichTuanOrderNos(db, list.list || []) })
 */
async function enrichTuanOrderNos(db, tuanOrders) {
  if (!tuanOrders || tuanOrders.length === 0) return tuanOrders || []
  const tuanIds = [...new Set(tuanOrders.map((o) => o._id).filter(Boolean))]
  if (tuanIds.length === 0) return tuanOrders

  const BATCH = 500
  const orderMap = {}
  for (let i = 0; i < tuanIds.length; i += BATCH) {
    const batch = tuanIds.slice(i, i + BATCH)
    const res = await db.collection('orders')
      .where({ tuanOrderId: db.command.in(batch) })
      .field({ _id: true, orderNo: true, outTradeNo: true, paymentStatus: true, status: true, transactionId: true, paidAt: true })
      .limit(BATCH)
      .get()
    ;(res.data || []).forEach((o) => { orderMap[o.tuanOrderId] = o })
  }

  return tuanOrders.map((o) => {
    const matched = orderMap[o._id]
    return {
      ...o,
      // 优先用 orders 里的 orderNo；否则回落 outTradeNo（TUAN_xxx 形式），最后 _id
      orderNo: matched?.orderNo || o.outTradeNo || (o._id ? `TN${o._id.replace(/^tn_/, '').toUpperCase()}` : ''),
      paymentStatus: matched?.paymentStatus || o.paymentStatus || '',
      outTradeNo: matched?.outTradeNo || o.outTradeNo || '',
      transactionId: matched?.transactionId || o.transactionId || '',
      paidAt: matched?.paidAt || o.paidAt || null,
    }
  })
}

module.exports = { enrichBuyerFields, enrichTuanOrderNos }
