const { initCloud, generateId } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:commission')

async function createCommissionRecord(orderType, order) {
  try {
    if (!order.ownerId) {return}

    // users._id = openid，直接 doc 查询
    let user = null
    try {
      const userRes = await db.collection('users').doc(order.ownerId).field({ _id: true, inviterId: true }).get()
      user = userRes.data
    } catch (e) { return }
    if (!user || !user.inviterId) {return}

    let config = {}
    try {
      const configRes = await db.collection('system_config').doc('commission_rates').get()
      config = configRes.data || {}
    } catch (e) { return }

    const rate = config[orderType] !== undefined ? Number(config[orderType]) : 0
    if (!rate || rate <= 0) {return}

    const orderAmount = Number(order.totalAmount || order.totalPrice || order.basicPrice || 0)
    if (orderAmount <= 0) {return}

    const commissionAmount = Math.round(orderAmount * rate / 100 * 100) / 100

    // inviterId 就是 openid，直接 doc 查询
    let inviter = null
    try {
      const inviterRes = await db.collection('users').doc(user.inviterId).field({ _id: true, nickName: true }).get()
      inviter = inviterRes.data
    } catch (e) { return }
    if (!inviter) {return}

    const existRes = await db.collection('tuan_commissions').where({
      orderNo: order.orderNo || order._id,
      inviterId: user.inviterId,
    }).count()
    if (existRes.total > 0) {return}

    await db.collection('tuan_commissions').add({
      data: {
        _id: generateId('commission', order.ownerId),
        inviterId: user.inviterId,
        inviterNickName: inviter.nickName || '',
        ownerId: user._id,
        orderType,
        orderId: order._id,
        orderNo: order.orderNo || order._id,
        orderAmount,
        commissionRate: rate,
        commissionAmount,
        status: 'pending',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })

    logger.info('createCommissionRecord', { orderType, orderId: order.orderNo || order._id, amount: orderAmount, rate, commissionAmount })
  } catch (e) {
    logger.error('createCommissionRecord', e)
  }
}

module.exports = { createCommissionRecord }
