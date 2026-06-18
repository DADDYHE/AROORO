/**
 * 订单状态统一迁移脚本
 * 目标：
 *   1. ongoing -> in_progress
 *   2. pending -> pending_payment
 *   3. 补全缺失的 paymentStatus 字段
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_LIMIT = 100

const STATUS_MAP = {
  ongoing: 'in_progress',
  pending: 'pending_payment',
}

function inferPaymentStatus(status) {
  if (['paid', 'confirmed', 'in_progress', 'completed'].includes(status)) {
    return 'paid'
  }
  if (status === 'refunded') {
    return 'refunded'
  }
  if (['cancelled', 'pending_payment', 'pending'].includes(status)) {
    return 'unpaid'
  }
  if (status === 'closed') {
    return 'closed'
  }
  return 'unpaid'
}

async function migrateCollection(collectionName) {
  let offset = 0
  let updated = 0
  let scanned = 0
  while (true) {
    const res = await db.collection(collectionName).skip(offset).limit(MAX_LIMIT).get()
    const list = res.data || []
    if (list.length === 0) break
    for (const doc of list) {
      scanned++
      const updates = {}
      if (STATUS_MAP[doc.status]) {
        updates.status = STATUS_MAP[doc.status]
      }
      if (!doc.paymentStatus && doc.status) {
        updates.paymentStatus = inferPaymentStatus(doc.status)
      }
      if (Object.keys(updates).length > 0) {
        await db.collection(collectionName).doc(doc._id).update({
          data: { ...updates, updatedAt: db.serverDate() },
        })
        updated++
      }
    }
    offset += list.length
  }
  return { scanned, updated }
}

exports.main = async () => {
  const results = {}
  results.orders = await migrateCollection('orders')
  results.feedingOrders = await migrateCollection('feedingOrders')
  results.tuan_orders = await migrateCollection('tuan_orders')
  results.activity_registrations = await migrateCollection('activity_registrations')
  return { code: 0, message: '迁移完成', data: results }
}
