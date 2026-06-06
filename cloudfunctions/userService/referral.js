const { err } = require('./common/errors')
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')

const { db } = initCloud()
const logger = createLogger('userService:referral')

async function getReferralStats(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    let user = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getReferralStats.users.fetch', { openid, code: e.errCode, msg: e.message })
    }
    if (!user) {throw err('NOT_FOUND', '用户不存在')}

    // inviterId 现在存的是 openid，直接用 openid 查询
    const invitedUsersRes = await db.collection('users')
      .where({ inviterId: openid })
      .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
      .get()

    const invitedUsers = invitedUsersRes.data || []
    const totalInvited = invitedUsers.length

    const invitedOpenids = invitedUsers.map(u => u._id).filter(Boolean)
    let consumingCount = 0
    let totalSpent = 0

    if (invitedOpenids.length > 0) {
      const _ = db.command
      const spenderOpenids = new Set()

      const ordersRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
        .limit(1000)
        .get()
      ;(ordersRes.data || []).forEach(o => {
        if (o.ownerId) {spenderOpenids.add(o.ownerId)}
        totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
      })

      const mallRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' })
        .limit(1000)
        .get()
      ;(mallRes.data || []).forEach(o => {
        if (o.ownerId) {spenderOpenids.add(o.ownerId)}
        totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
      })

      try {
        const feedRes = await db.collection('feedingOrders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(feedRes.data || []).forEach(o => {
          if (o.ownerId) {spenderOpenids.add(o.ownerId)}
          totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })
      } catch (e) {
        logger.warn('getReferralStats.feedingOrders', { openid, code: e.errCode, msg: e.message })
      }

      try {
        const tuanRes = await db.collection('tuan_orders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(tuanRes.data || []).forEach(o => {
          if (o.ownerId) {spenderOpenids.add(o.ownerId)}
          totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })
      } catch (e) {
        logger.warn('getReferralStats.tuan_orders', { openid, code: e.errCode, msg: e.message })
      }

      try {
        const actRes = await db.collection('activity_registrations')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(actRes.data || []).forEach(o => {
          if (o.ownerId) {spenderOpenids.add(o.ownerId)}
          totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })
      } catch (e) {
        logger.warn('getReferralStats.activity_registrations', { openid, code: e.errCode, msg: e.message })
      }

      consumingCount = spenderOpenids.size
    }

    return handleSuccess({
      totalInvited,
      consumingCount,
      totalSpent: totalSpent.toFixed(2),
    })
  } catch (error) {
    logger.error('getReferralStats', error)
    return handleError(error, '获取带货统计失败', ERROR_CODES.DATA)
  }
}

async function getInvitedUsers(event, context, auth) {
  const { openid } = auth
  const { page = 1, pageSize = 20 } = event
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    const _ = db.command
    let user = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getInvitedUsers.users.fetch', { openid, code: e.errCode, msg: e.message })
    }
    if (!user) {throw err('NOT_FOUND', '用户不存在')}

    const skip = (page - 1) * pageSize
    // inviterId 现在存的是 openid，直接用 openid 查询
    const [listRes, countRes] = await Promise.all([
      db.collection('users')
        .where({ inviterId: openid })
        .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get(),
      db.collection('users').where({ inviterId: openid }).count(),
    ])

    const invitedUsers = listRes.data || []

    const invitedOpenids = invitedUsers.map(u => u._id).filter(Boolean)
    const orderMap = {}

    if (invitedOpenids.length > 0) {
      const ordersRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
        .limit(1000)
        .get()
      ;(ordersRes.data || []).forEach(o => {
        const key = o.ownerId
        if (!orderMap[key]) {orderMap[key] = { orderCount: 0, totalSpent: 0 }}
        orderMap[key].orderCount += 1
        orderMap[key].totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
      })

      const mallRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' })
        .limit(1000)
        .get()
      ;(mallRes.data || []).forEach(o => {
        const key = o.ownerId
        if (!orderMap[key]) {orderMap[key] = { orderCount: 0, totalSpent: 0 }}
        orderMap[key].orderCount += 1
        orderMap[key].totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
      })

      try {
        const feedRes = await db.collection('feedingOrders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(feedRes.data || []).forEach(o => {
          const key = o.ownerId
          if (!orderMap[key]) {orderMap[key] = { orderCount: 0, totalSpent: 0 }}
          orderMap[key].orderCount += 1
          orderMap[key].totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })
      } catch (e) {
        logger.warn('getInvitedUsers.feedingOrders', { openid, code: e.errCode, msg: e.message })
      }

      try {
        const tuanRes = await db.collection('tuan_orders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(tuanRes.data || []).forEach(o => {
          const key = o.ownerId
          if (!orderMap[key]) {orderMap[key] = { orderCount: 0, totalSpent: 0 }}
          orderMap[key].orderCount += 1
          orderMap[key].totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })
      } catch (e) {
        logger.warn('getInvitedUsers.tuan_orders', { openid, code: e.errCode, msg: e.message })
      }

      try {
        const actRes = await db.collection('activity_registrations')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(actRes.data || []).forEach(o => {
          const key = o.ownerId
          if (!orderMap[key]) {orderMap[key] = { orderCount: 0, totalSpent: 0 }}
          orderMap[key].orderCount += 1
          orderMap[key].totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })
      } catch (e) {
        logger.warn('getInvitedUsers.activity_registrations', { openid, code: e.errCode, msg: e.message })
      }
    }

    const list = invitedUsers.map(u => {
      const stats = orderMap[u._id] || { orderCount: 0, totalSpent: 0 }
      return {
        _id: u._id,
        nickName: u.nickName || '未知用户',
        avatarUrl: u.avatarUrl || '',
        createdAt: u.createdAt,
        orderCount: stats.orderCount,
        totalSpent: stats.totalSpent.toFixed(2),
      }
    })

    return handleSuccess({ list, total: countRes.total })
  } catch (error) {
    logger.error('getInvitedUsers', error)
    return handleError(error, '获取邀请用户失败', ERROR_CODES.DATA)
  }
}

module.exports = { getReferralStats, getInvitedUsers }
