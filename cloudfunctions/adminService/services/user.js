const { handleSuccess, handleError, ERROR_CODES, paginate } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { err } = require('../common/errors')
const { ORDER_TYPES, ORDER_TYPE_NAMES } = require('../constants')

const { db, cloud } = initCloud()
const logger = createLogger('adminService')

async function getUserList(event, context, auth) {
  const { page = 1, pageSize = 20, keyword } = event
  const where = {}
  if (keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    where.nickName = db.RegExp({ regexp: escaped, options: 'i' })
  }

  const result = await paginate(db, 'users', { page, pageSize, where })

  if (result.list && result.list.length > 0) {
    const openids = result.list.map(u => u._id).filter(Boolean)
    if (openids.length > 0) {
      const adminRes = await db.collection('admins')
        .where({ _id: db.command.in(openids) })
        .field({ isPartner: true, permissions: true })
        .limit(100)
        .get()
      const adminMap = {}
      for (const a of (adminRes.data || [])) {
        adminMap[a._id] = a
      }
      for (const user of result.list) {
        const admin = adminMap[user._id]
        user.isPartner = admin ? Boolean(admin.isPartner) : false
        user.permissions = admin ? (admin.permissions || []) : []
      }
    }
  }

  return handleSuccess(result)
}

async function getUserDetail(event, context, auth) {
  const targetOpenid = event.targetOpenid || event.data?.targetOpenid
  if (!targetOpenid) {throw err('INVALID_PARAMS', '缺少用户ID')}

  const userRes = await db.collection('users').where({ _id: targetOpenid }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) {
    throw err('USER_NOT_FOUND', '用户不存在')
  }
  const userData = userRes.data[0]
  const [petCountRes, orderCountRes, adminRes] = await Promise.all([
    db.collection('pets').where({ ownerId: userData._id }).count(),
    db.collection('orders').where({ ownerId: userData._id }).count(),
    db.collection('admins').where({ _id: userData._id }).field({ isPartner: true, permissions: true }).limit(1).get(),
  ])
  const admin = (adminRes.data && adminRes.data[0]) || null
  userData.isPartner = admin ? Boolean(admin.isPartner) : false
  userData.permissions = admin ? (admin.permissions || []) : []

  // 将 Date 对象转为 ISO 字符串，防止 convertCloudUrls 递归时破坏
  if (userData.createdAt && userData.createdAt instanceof Date) {
    userData.createdAt = userData.createdAt.toISOString()
  }
  if (userData.updatedAt && userData.updatedAt instanceof Date) {
    userData.updatedAt = userData.updatedAt.toISOString()
  }

  return handleSuccess({ ...userData, petCount: petCountRes.total, orderCount: orderCountRes.total })
}

async function updateUserStatus(event, context, auth) {
  const targetOpenid = event.targetOpenid || event.data?.targetOpenid
  const status = event.status || event.data?.status
  if (!targetOpenid) {throw err('INVALID_PARAMS', '缺少用户ID')}
  if (!status || !['active', 'disabled'].includes(status)) {
    throw err('INVALID_PARAMS', '无效的状态值')
  }

  await db.collection('users').where({ _id: targetOpenid }).update({
    data: { status, updatedAt: db.serverDate() },
  })
  return handleSuccess(null, status === 'active' ? '用户已启用' : '用户已禁用')
}

async function getDashboardStats(event, context, auth) {
  try {
    const [pendingOrders, activeHosts, activeActivities, totalProducts] = await Promise.all([
      db.collection('orders').where({ status: 'pending' }).count(),
      db.collection('hostProfiles').where({ status: 'active' }).count(),
      db.collection('activities').where({ status: 'published' }).count(),
      db.collection('products').where({ status: 'on_sale' }).count(),
    ])
    return handleSuccess({
      pendingOrders: pendingOrders.total,
      activeHosts: activeHosts.total,
      activeActivities: activeActivities.total,
      totalProducts: totalProducts.total,
    })
  } catch (error) {
    logger.error('getDashboardStats', error)
    return handleSuccess({ pendingOrders: 0, activeHosts: 0, activeActivities: 0, totalProducts: 0 })
  }
}

async function getEnhancedDashboardStats(event, context, auth) {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const _ = db.command
    const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 86400000)

    // 基础统计 + 待处理统计 + 用户统计（独立 try，避免单条失败导致整体崩溃）
    const [
      basicStats, pendingCounts, todayUsers, totalUsersAgg,
    ] = await Promise.all([
      Promise.all([
        db.collection('hostProfiles').where({ status: 'active' }).count(),
        db.collection('activities').where({ status: 'published' }).count(),
        db.collection('products').where({ status: 'on_sale' }).count(),
      ]),
      Promise.all([
        db.collection('orders').where({ status: 'pending_payment' }).count(),
        db.collection('orders').where({ type: 'mall', status: 'confirmed' }).count(),
        db.collection('admin_applications').where({ status: 'pending' }).count(),
        db.collection('withdrawals').where({ status: 'pending' }).count(),
      ]),
      db.collection('users').where({ createdAt: _.gte(todayStart) }).count(),
      db.collection('users').count(),
    ])

    // 今日各渠道订单数
    const [todayMallOrders, todayTuanOrders, todayFeedingOrders, todayActivityOrders] = await Promise.all([
      db.collection('orders').where({ createdAt: _.gte(todayStart) }).count(),
      db.collection('tuan_orders').where({ createdAt: _.gte(todayStart) }).count(),
      db.collection('feedingOrders').where({ createdAt: _.gte(todayStart) }).count(),
      db.collection('activity_registrations').where({ createdAt: _.gte(todayStart) }).count(),
    ])
    const todayOrders = todayMallOrders.total + todayTuanOrders.total + todayFeedingOrders.total + todayActivityOrders.total

    // 今日各渠道收入
    const [todayMallRevenue, todayTuanRevenue, todayFeedingRevenue, todayActivityRevenue] = await Promise.all([
      db.collection('orders').aggregate()
        .match({ createdAt: _.gte(todayStart) })
        .group({ _id: null, total: { $sum: { $toDouble: { $ifNull: ['$totalPrice', { $ifNull: ['$price', 0] }] } } } })
        .end(),
      db.collection('tuan_orders').aggregate()
        .match({ createdAt: _.gte(todayStart), status: _.neq('cancelled') })
        .group({ _id: null, total: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } })
        .end(),
      db.collection('feedingOrders').aggregate()
        .match({ createdAt: _.gte(todayStart), status: _.neq('cancelled') })
        .group({ _id: null, total: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } })
        .end(),
      db.collection('activity_registrations').aggregate()
        .match({ createdAt: _.gte(todayStart), status: _.neq('cancelled') })
        .group({ _id: null, total: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } })
        .end(),
    ])
    const sumAgg = agg => ((agg.data && agg.data[0]) ? agg.data[0].total : 0)
    const todayRevenue = sumAgg(todayMallRevenue) + sumAgg(todayTuanRevenue) + sumAgg(todayFeedingRevenue) + sumAgg(todayActivityRevenue)

    // 30天订单趋势（各渠道合并）
    const [mallTrend, tuanTrend, feedingTrend, activityTrend] = await Promise.all([
      db.collection('orders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo) })
        .group({ _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: { $toDouble: { $ifNull: ['$totalPrice', { $ifNull: ['$price', 0] }] } } } })
        .end(),
      db.collection('tuan_orders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } })
        .end(),
      db.collection('feedingOrders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } })
        .end(),
      db.collection('activity_registrations').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } })
        .end(),
    ])

    // 合并趋势数据
    const trendMap = {}
    for (let i = 0; i <= 29; i++) {
      const d = new Date(todayStart.getTime() - (29 - i) * 86400000)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      trendMap[dateStr] = { date: dateStr, count: 0, revenue: 0 }
    }
    const mergeTrend = aggData => {
      (aggData || []).forEach(item => {
        if (trendMap[item._id]) {
          trendMap[item._id].count += item.count || 0
          trendMap[item._id].revenue += item.revenue || 0
        }
      })
    }
    mergeTrend(mallTrend.data)
    mergeTrend(tuanTrend.data)
    mergeTrend(feedingTrend.data)
    mergeTrend(activityTrend.data)
    const orderTrendData = Object.values(trendMap).map(t => ({ ...t, revenue: Number(t.revenue.toFixed(2)) }))

    // 订单类型分布（近30天）
    // orders 集合按 type 分组：mall 归类为商城，group_buy 归类为团购，其余归类为寄养
    const [mallTypeAgg, tuanTypeAgg, feedingTypeAgg, activityTypeAgg] = await Promise.all([
      db.collection('orders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo) })
        .group({ _id: '$type', count: { $sum: 1 } })
        .end(),
      db.collection('tuan_orders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: null, count: { $sum: 1 } }).end(),
      db.collection('feedingOrders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: null, count: { $sum: 1 } }).end(),
      db.collection('activity_registrations').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: null, count: { $sum: 1 } }).end(),
    ])

    const ordersByType = {}
    let boardingCount = 0
    ;(mallTypeAgg.data || []).forEach(t => {
      const typeName = t._id || 'mall'
      if (typeName === 'mall') {
        ordersByType.mall = { name: 'mall', count: t.count }
      } else if (typeName === 'group_buy') {
        // group_buy 在 orders 集合中，但业务上属于团购
        ordersByType.tuan = { name: 'tuan', count: (ordersByType.tuan?.count || 0) + t.count }
      } else {
        // 其余（无 type 或其他值）归为寄养
        boardingCount += t.count
      }
    })
    if (boardingCount > 0) {
      ordersByType.boarding = { name: 'boarding', count: boardingCount }
    }
    if (tuanTypeAgg.data && tuanTypeAgg.data[0] && tuanTypeAgg.data[0].count > 0) {
      ordersByType.tuan = { name: 'tuan', count: (ordersByType.tuan?.count || 0) + tuanTypeAgg.data[0].count }
    }
    if (feedingTypeAgg.data && feedingTypeAgg.data[0] && feedingTypeAgg.data[0].count > 0) {
      ordersByType.feeding = { name: 'feeding', count: feedingTypeAgg.data[0].count }
    }
    if (activityTypeAgg.data && activityTypeAgg.data[0] && activityTypeAgg.data[0].count > 0) {
      ordersByType.activity = { name: 'activity', count: activityTypeAgg.data[0].count }
    }

    // 收入类型分布（近30天）
    // orders 集合按 type 分组：mall 归类为商城，group_buy 归类为团购，其余归类为寄养
    const [mallRevAgg, tuanRevAgg, feedingRevAgg, activityRevAgg] = await Promise.all([
      db.collection('orders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo) })
        .group({ _id: '$type', revenue: { $sum: { $toDouble: { $ifNull: ['$totalAmount', { $ifNull: ['$totalPrice', { $ifNull: ['$price', 0] }] }] } } } })
        .end(),
      db.collection('tuan_orders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: null, revenue: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } }).end(),
      db.collection('feedingOrders').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: null, revenue: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } }).end(),
      db.collection('activity_registrations').aggregate()
        .match({ createdAt: _.gte(thirtyDaysAgo), status: _.neq('cancelled') })
        .group({ _id: null, revenue: { $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } } }).end(),
    ])

    const revenueByType = {}
    let boardingRevenue = 0
    ;(mallRevAgg.data || []).forEach(t => {
      const typeName = t._id || 'mall'
      if (typeName === 'mall') {
        revenueByType.mall = { name: 'mall', amount: Number((t.revenue || 0).toFixed(2)) }
      } else if (typeName === 'group_buy') {
        revenueByType.tuan = { name: 'tuan', amount: Number(((revenueByType.tuan?.amount || 0) + (t.revenue || 0)).toFixed(2)) }
      } else {
        boardingRevenue += t.revenue || 0
      }
    })
    if (boardingRevenue > 0) {
      revenueByType.boarding = { name: 'boarding', amount: Number(boardingRevenue.toFixed(2)) }
    }
    if (tuanRevAgg.data && tuanRevAgg.data[0] && tuanRevAgg.data[0].revenue > 0) {
      revenueByType.tuan = { name: 'tuan', amount: Number(((revenueByType.tuan?.amount || 0) + tuanRevAgg.data[0].revenue).toFixed(2)) }
    }
    if (feedingRevAgg.data && feedingRevAgg.data[0] && feedingRevAgg.data[0].revenue > 0) {
      revenueByType.feeding = { name: 'feeding', amount: Number(feedingRevAgg.data[0].revenue.toFixed(2)) }
    }
    if (activityRevAgg.data && activityRevAgg.data[0] && activityRevAgg.data[0].revenue > 0) {
      revenueByType.activity = { name: 'activity', amount: Number(activityRevAgg.data[0].revenue.toFixed(2)) }
    }

    return handleSuccess({
      activeHosts: basicStats[0].total,
      activeActivities: basicStats[1].total,
      totalProducts: basicStats[2].total,
      todayNewUsers: todayUsers.total,
      todayOrders,
      todayRevenue: Number(todayRevenue.toFixed(2)),
      totalUsers: totalUsersAgg.total,
      pendingPayment: pendingCounts[0].total,
      pendingShip: pendingCounts[1].total,
      pendingApproval: pendingCounts[2].total,
      pendingWithdrawal: pendingCounts[3].total,
      orderTrend: orderTrendData,
      ordersByType,
      revenueByType,
    })
  } catch (error) {
    logger.error('getEnhancedDashboardStats', error)
    return handleSuccess({
      activeHosts: 0,
      activeActivities: 0,
      totalProducts: 0,
      todayNewUsers: 0,
      todayOrders: 0,
      todayRevenue: 0,
      totalUsers: 0,
      pendingPayment: 0,
      pendingShip: 0,
      pendingApproval: 0,
      pendingWithdrawal: 0,
      orderTrend: [],
      ordersByType: {},
      revenueByType: {},
    })
  }
}

async function getFinanceOverview(event, context, auth) {
  try {
    const _ = db.command
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // 各订单类型的查询配置，与实际数据库集合结构对齐：
    // - orders 集合：用 type 字段区分（mall / group_buy），寄养订单无 type 或 type 非 mall/group_buy
    // - feedingOrders 集合：有 orderType='feeding'
    // - tuan_orders 集合：独立集合
    // - activity_registrations 集合：独立集合
    // 金额字段统一用 totalAmount，状态用 completed / paid 表示已完成
    const ORDER_TYPE_MAP = {
      mall: { collection: 'orders', where: { type: 'mall', status: _.in(['completed', 'paid']) } },
      boarding: { collection: 'orders', where: { type: _.or([_.exists(false), _.and(_.neq('mall'), _.neq('group_buy'))]), status: _.in(['completed', 'paid']) } },
      activity: { collection: 'activity_registrations', where: { status: _.in(['completed', 'paid']) } },
      tuan: { collection: 'tuan_orders', where: { status: _.in(['completed', 'paid']) } },
      feeding: { collection: 'feedingOrders', where: { status: _.in(['completed', 'paid']) } },
    }

    const revenueByType = { boarding: 0, activity: 0, mall: 0, feeding: 0, tuan: 0 }
    let totalRevenue = 0
    let monthlyRevenue = 0
    const recentTransactions = []

    for (const [type, config] of Object.entries(ORDER_TYPE_MAP)) {
      const matchCond = config.where

      const [allRes, recentRes] = await Promise.all([
        db.collection(config.collection).where(matchCond).field({ totalAmount: true, totalPrice: true, completedAt: true, updatedAt: true, createdAt: true }).limit(1000).get(),
        db.collection(config.collection).where(matchCond).orderBy('createdAt', 'desc').limit(5).field({ _id: true, totalAmount: true, totalPrice: true, completedAt: true, updatedAt: true, createdAt: true }).get(),
      ])

      let typeTotal = 0
      let typeMonthly = 0
      ;(allRes.data || []).forEach(order => {
        const amount = Number(order.totalAmount || order.totalPrice || 0)
        typeTotal += amount
        const timeRef = order.completedAt || order.updatedAt || order.createdAt
        if (timeRef && new Date(timeRef) >= monthStart) {
          typeMonthly += amount
        }
      })

      revenueByType[type] = typeTotal
      totalRevenue += typeTotal
      monthlyRevenue += typeMonthly

      ;(recentRes.data || []).forEach(order => {
        recentTransactions.push({
          id: order._id,
          amount: Number(order.totalAmount || order.totalPrice || 0),
          type,
          completedAt: order.completedAt || order.updatedAt || order.createdAt,
        })
      })
    }

    recentTransactions.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
    recentTransactions.splice(10)

    return handleSuccess({
      stats: {
        totalRevenue: totalRevenue.toFixed(2),
        monthlyRevenue: monthlyRevenue.toFixed(2),
        pendingSettlement: '0',
        settledAmount: totalRevenue.toFixed(2),
      },
      revenueByType: {
        boarding: revenueByType.boarding.toFixed(2),
        activity: revenueByType.activity.toFixed(2),
        mall: revenueByType.mall.toFixed(2),
        feeding: revenueByType.feeding.toFixed(2),
        tuan: revenueByType.tuan.toFixed(2),
      },
      recentTransactions,
    })
  } catch (error) {
    logger.error('getFinanceOverview', error)
    return handleError(error, `获取营收概览失败: ${error.message}`, ERROR_CODES.BUSINESS)
  }
}

async function getReferralStats(event, context, auth) {
  try {
    const _ = db.command
    const targetOpenid = event.targetOpenid || event.data?.targetOpenid

    let targetInviterId = null

    if (targetOpenid) {
      // inviterId 现在直接存 openid，无需转换
      targetInviterId = targetOpenid
    }

    if (!targetInviterId) {
      const invitedCountRes = await db.collection('users')
        .where({ inviterId: _.exists(true).and(_.neq('')) })
        .count()
      const totalInvited = invitedCountRes.total || 0

      const inviterCountRes = await db.collection('users')
        .where({ inviterId: _.exists(true).and(_.neq('')) })
        .field({ _id: true, inviterId: true })
        .limit(1000)
        .get()

      const inviterIds = new Set()
      ;(inviterCountRes.data || []).forEach(u => { if (u.inviterId) {inviterIds.add(u.inviterId)} })
      const totalInviters = inviterIds.size

      const invitedOpenids = (inviterCountRes.data || []).map(u => u._id).filter(Boolean)

      let consumingCount = 0
      let totalSpent = 0

      if (invitedOpenids.length > 0) {
        const spenderOpenids = new Set()

        const ordersRes = await db.collection('orders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(ordersRes.data || []).forEach(o => {
          if (o.ownerId) {spenderOpenids.add(o.ownerId)}
          totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })

        const mallOrdersRes = await db.collection('orders')
          .where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' })
          .limit(1000)
          .get()
        ;(mallOrdersRes.data || []).forEach(o => {
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
          logger.warn('getReferralStats.feedingOrders', { code: e.errCode, msg: e.message })
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
          logger.warn('getReferralStats.tuan_orders', { code: e.errCode, msg: e.message })
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
          logger.warn('getReferralStats.activity_registrations', { code: e.errCode, msg: e.message })
        }

        consumingCount = spenderOpenids.size
      }

      return handleSuccess({
        totalInvited,
        totalInviters,
        consumingCount,
        totalSpent: totalSpent.toFixed(2),
      })
    }

    const invitedRes = await db.collection('users')
      .where({ inviterId: targetInviterId })
      .field({ _id: true })
      .limit(1000)
      .get()

    const invitedUsers = invitedRes.data || []
    const totalInvited = invitedUsers.length
    const invitedOpenids = invitedUsers.map(u => u._id).filter(Boolean)

    let consumingCount = 0
    let totalSpent = 0

    if (invitedOpenids.length > 0) {
      const spenderOpenids = new Set()

      const ordersRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
        .limit(1000)
        .get()
      ;(ordersRes.data || []).forEach(o => {
        if (o.ownerId) {spenderOpenids.add(o.ownerId)}
        totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
      })

      const mallOrdersRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' })
        .limit(1000)
        .get()
      ;(mallOrdersRes.data || []).forEach(o => {
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
        logger.warn('getReferralStats.feedingOrders(2)', { code: e.errCode, msg: e.message })
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
        logger.warn('getReferralStats.tuan_orders(2)', { code: e.errCode, msg: e.message })
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
        logger.warn('getReferralStats.activity_registrations(2)', { code: e.errCode, msg: e.message })
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

async function getReferralList(event, context, auth) {
  const { page = 1, pageSize = 20 } = event
  try {
    const _ = db.command

    const invitedRes = await db.collection('users')
      .where({ inviterId: _.exists(true).and(_.neq('')) })
      .field({ _id: true, inviterId: true })
      .limit(1000)
      .get()

    const invitedUsers = invitedRes.data || []

    const inviterCountMap = {}
    const inviterToInvitedOpenids = {}
    invitedUsers.forEach(u => {
      inviterCountMap[u.inviterId] = (inviterCountMap[u.inviterId] || 0) + 1
      if (!inviterToInvitedOpenids[u.inviterId]) {inviterToInvitedOpenids[u.inviterId] = []}
      if (u._id) {inviterToInvitedOpenids[u.inviterId].push(u._id)}
    })

    const uniqueInviterIds = Object.keys(inviterCountMap)
    const orderMap = {}
    if (uniqueInviterIds.length > 0) {
      for (const inviterId of uniqueInviterIds) {
        const openids = inviterToInvitedOpenids[inviterId] || []
        if (openids.length === 0) {continue}
        let orderCount = 0
        let totalSpent = 0

        const ordersRes = await db.collection('orders')
          .where({ ownerId: _.in(openids), status: 'completed' })
          .limit(1000)
          .get()
        ;(ordersRes.data || []).forEach(o => {
          orderCount += 1
          totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })

        const mallRes = await db.collection('orders')
          .where({ ownerId: _.in(openids), type: 'mall', status: 'completed' })
          .limit(1000)
          .get()
        ;(mallRes.data || []).forEach(o => {
          orderCount += 1
          totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
        })

        try {
          const feedRes = await db.collection('feedingOrders')
            .where({ ownerId: _.in(openids), status: 'completed' })
            .limit(1000)
            .get()
          ;(feedRes.data || []).forEach(o => {
            orderCount += 1
            totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
          })
        } catch (e) {
          logger.warn('getReferralList.feedingOrders', { inviterId, code: e.errCode, msg: e.message })
        }

        try {
          const tuanRes = await db.collection('tuan_orders')
            .where({ ownerId: _.in(openids), status: 'completed' })
            .limit(1000)
            .get()
          ;(tuanRes.data || []).forEach(o => {
            orderCount += 1
            totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
          })
        } catch (e) {
          logger.warn('getReferralList.tuan_orders', { inviterId, code: e.errCode, msg: e.message })
        }

        try {
          const actRes = await db.collection('activity_registrations')
            .where({ ownerId: _.in(openids), status: 'completed' })
            .limit(1000)
            .get()
          ;(actRes.data || []).forEach(o => {
            orderCount += 1
            totalSpent += (Number(o.totalPrice) || Number(o.price) || 0)
          })
        } catch (e) {
          logger.warn('getReferralList.activity_registrations', { inviterId, code: e.errCode, msg: e.message })
        }

        orderMap[inviterId] = { orderCount, totalSpent }
      }
    }

    const skip = (page - 1) * pageSize
    const pagedInviterIds = uniqueInviterIds.slice(skip, skip + pageSize)

    const inviterUserMap = {}
    if (pagedInviterIds.length > 0) {
      // users._id = openid，直接用 _id 批量查询
      const invitersRes = await db.collection('users')
        .where({ _id: _.in(pagedInviterIds) })
        .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
        .get()
      ;(invitersRes.data || []).forEach(u => { inviterUserMap[u._id] = u })
    }

    const list = pagedInviterIds.map(id => {
      const u = inviterUserMap[id] || {}
      return {
        _id: id,
        nickName: u.nickName || '未知用户',
        avatarUrl: u.avatarUrl || '',
        createdAt: u.createdAt || '',
        invitedCount: inviterCountMap[id] || 0,
        invitedSpent: (orderMap[id]?.totalSpent || 0).toFixed(2),
      }
    })

    await convertCloudAvatars(list)

    return handleSuccess({ list, total: uniqueInviterIds.length })
  } catch (error) {
    logger.error('getReferralList', error)
    return handleError(error, '获取带货列表失败', ERROR_CODES.DATA)
  }
}

async function getInvitedUsersByAdmin(event, context, auth) {
  const targetOpenid = event.targetOpenid || event.data?.targetOpenid
  if (!targetOpenid) {throw err('INVALID_PARAMS', '缺少用户ID')}

  try {
    const _ = db.command

    // inviterId 现在直接存 openid，无需转换
    logger.info('getInvitedUsersByAdmin', { targetOpenid, authOpenid: auth.openid })

    const invitedRes = await db.collection('users')
      .where({ inviterId: targetOpenid })
      .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
      .get()

    const invitedUsers = invitedRes.data || []

    const orderMap = {}
    if (invitedUsers.length > 0) {
      const invitedOpenids = invitedUsers.map(u => u._id).filter(Boolean)

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
        logger.warn('getInvitedUsersByAdmin.feedingOrders', { targetOpenid, code: e.errCode, msg: e.message })
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
        logger.warn('getInvitedUsersByAdmin.tuan_orders', { targetOpenid, code: e.errCode, msg: e.message })
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
        logger.warn('getInvitedUsersByAdmin.activity_registrations', { targetOpenid, code: e.errCode, msg: e.message })
      }
    }

    const list = invitedUsers.map(u => ({
      _id: u._id,
      nickName: u.nickName || '未知用户',
      avatarUrl: u.avatarUrl || '',
      createdAt: u.createdAt,
      orderCount: (orderMap[u._id]?.orderCount) || 0,
      totalSpent: (orderMap[u._id]?.totalSpent || 0).toFixed(2),
    }))

    await convertCloudAvatars(list)

    return handleSuccess({ list, total: list.length })
  } catch (error) {
    logger.error('getInvitedUsersByAdmin', error)
    return handleError(error, '获取邀请用户失败', ERROR_CODES.DATA)
  }
}

async function getReferralOrders(event, context, auth) {
  const { type = '', page = 1, pageSize = 20, targetOpenid, invitedUserOpenid } = event
  const _ = db.command

  try {
    let invitedOpenids = []
    const nickMap = {}

    if (invitedUserOpenid && invitedUserOpenid.trim()) {
      invitedOpenids = [invitedUserOpenid.trim()]
      try {
        const uRes = await db.collection('users')
          .where({ _id: invitedUserOpenid.trim() })
          .field({ _id: true, nickName: true })
          .limit(1)
          .get()
        ;(uRes.data || []).forEach(u => { nickMap[u._id] = u.nickName })
      } catch (e) {
        logger.warn('getReferralOrders.users.fetchNick', { invitedUserOpenid, code: e.errCode, msg: e.message })
      }
    } else if (targetOpenid) {
      // inviterId 现在直接存 openid，无需转换
      const invitedRes = await db.collection('users')
        .where({ inviterId: targetOpenid })
        .field({ _id: true, nickName: true })
        .limit(1000)
        .get()

      const invitedUsers = invitedRes.data || []
      if (invitedUsers.length === 0) {
        return handleSuccess({ list: [], total: 0 })
      }
      invitedOpenids = invitedUsers.map(u => u._id).filter(Boolean)
      invitedUsers.forEach(u => { nickMap[u._id] = u.nickName })
    } else if (auth.openid && !auth._isHttpAuth) {
      // inviterId 现在直接存 openid，无需转换
      const invitedRes = await db.collection('users')
        .where({ inviterId: auth.openid })
        .field({ _id: true, nickName: true })
        .limit(1000)
        .get()

      const invitedUsers = invitedRes.data || []
      if (invitedUsers.length === 0) {
        return handleSuccess({ list: [], total: 0 })
      }
      invitedOpenids = invitedUsers.map(u => u._id).filter(Boolean)
      invitedUsers.forEach(u => { nickMap[u._id] = u.nickName })
    } else {
      const invitedRes = await db.collection('users')
        .where({ inviterId: _.exists(true).and(_.neq('')) })
        .field({ _id: true, nickName: true })
        .limit(1000)
        .get()

      const invitedUsers = invitedRes.data || []
      if (invitedUsers.length === 0) {
        return handleSuccess({ list: [], total: 0 })
      }
      invitedOpenids = invitedUsers.map(u => u._id).filter(Boolean)
      invitedUsers.forEach(u => { nickMap[u._id] = u.nickName })
    }

    if (invitedOpenids.length === 0) {
      return handleSuccess({ list: [], total: 0 })
    }

    const orders = []

    if (!type || type === 'mall') {
      try {
        const mallWhere = { type: 'mall', ownerId: _.in(invitedOpenids) }
        const mallRes = await db.collection('orders').where(mallWhere)
          .orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
        ;(mallRes.data || []).forEach(o => orders.push({ ...o, orderType: 'mall', buyerNick: nickMap[o.ownerId] || o.ownerName || '' }))
      } catch (e) {
        logger.warn('getReferralOrders.mall', { code: e.errCode, msg: e.message })
      }
    }

    if (!type || type === 'hosting') {
      try {
        const hostWhere = { ownerId: _.in(invitedOpenids) }
        const hostRes = await db.collection('orders').where(hostWhere)
          .orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
        ;(hostRes.data || []).forEach(o => {
          if (o.type === 'mall') {return}
          orders.push({ ...o, orderType: 'hosting', buyerNick: nickMap[o.ownerId] || '' })
        })
      } catch (e) {
        logger.warn('getReferralOrders.hosting', { code: e.errCode, msg: e.message })
      }
    }

    if (!type || type === 'feeding') {
      try {
        const feedWhere = { ownerId: _.in(invitedOpenids) }
        const feedRes = await db.collection('feedingOrders').where(feedWhere)
          .orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
        ;(feedRes.data || []).forEach(o => orders.push({ ...o, orderType: 'feeding', buyerNick: nickMap[o.ownerId] || '' }))
      } catch (e) {
        logger.warn('getReferralOrders.feedingOrders', { code: e.errCode, msg: e.message })
      }
    }

    if (!type || type === 'tuan') {
      try {
        const tuanWhere = { ownerId: _.in(invitedOpenids) }
        const tuanRes = await db.collection('tuan_orders').where(tuanWhere)
          .orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
        ;(tuanRes.data || []).forEach(o => orders.push({ ...o, orderType: 'tuan', buyerNick: nickMap[o.ownerId] || '' }))
      } catch (e) {
        logger.warn('getReferralOrders.tuan_orders', { code: e.errCode, msg: e.message })
      }
    }

    if (!type || type === 'activity') {
      try {
        const actWhere = { ownerId: _.in(invitedOpenids) }
        const actRes = await db.collection('activity_registrations').where(actWhere)
          .orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
        ;(actRes.data || []).forEach(o => orders.push({ ...o, orderType: 'activity', buyerNick: nickMap[o.ownerId] || '' }))
      } catch (e) {
        logger.warn('getReferralOrders.activity_registrations', { code: e.errCode, msg: e.message })
      }
    }

    orders.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })

    return handleSuccess({ list: orders, total: orders.length })
  } catch (error) {
    logger.error('getReferralOrders', error)
    return handleError(error, `获取带货客户订单失败: ${error.message}`, ERROR_CODES.DATA)
  }
}

async function getReferralOrderStats(event, context, auth) {
  const { type = 'mall', targetOpenid } = event
  const _ = db.command

  try {
    let invitedOpenids = []

    if (targetOpenid) {
      // inviterId 现在直接存 openid，无需转换
      const invitedRes = await db.collection('users')
        .where({ inviterId: targetOpenid })
        .field({ _id: true })
        .limit(1000)
        .get()
      invitedOpenids = (invitedRes.data || []).map(u => u._id).filter(Boolean)
    } else if (auth.openid && !auth._isHttpAuth) {
      // inviterId 现在直接存 openid，无需转换
      const invitedRes = await db.collection('users')
        .where({ inviterId: auth.openid })
        .field({ _id: true })
        .limit(1000)
        .get()

      invitedOpenids = (invitedRes.data || []).map(u => u._id).filter(Boolean)
    } else {
      const invitedRes = await db.collection('users')
        .where({ inviterId: _.exists(true).and(_.neq('')) })
        .field({ _id: true })
        .limit(1000)
        .get()
      invitedOpenids = (invitedRes.data || []).map(u => u._id).filter(Boolean)
    }

    if (invitedOpenids.length === 0) {
      return handleSuccess({ totalAmount: 0, totalCount: 0, commissionRate: 0, estimatedCommission: 0 })
    }

    let totalAmount = 0
    let totalCount = 0

    if (type === 'mall') {
      try {
        const res = await db.collection('orders')
          .where({ type: 'mall', ownerId: _.in(invitedOpenids), status: _.in(['paid', 'shipped', 'completed']) })
          .get()
        ;(res.data || []).forEach(o => {
          totalAmount += Number(o.totalPrice) || Number(o.totalAmount) || 0
          totalCount++
        })
      } catch (e) {
        logger.warn('getReferralOrderStats.mall', { type, code: e.errCode, msg: e.message })
      }
    } else if (type === 'hosting') {
      try {
        const res = await db.collection('orders')
          .where({ ownerId: _.in(invitedOpenids), status: _.in(['paid', 'confirmed', 'completed']) })
          .get()
        ;(res.data || []).forEach(o => {
          if (o.type === 'mall') {return}
          totalAmount += Number(o.totalPrice) || Number(o.totalAmount) || 0
          totalCount++
        })
      } catch (e) {
        logger.warn('getReferralOrderStats.hosting', { type, code: e.errCode, msg: e.message })
      }
    } else if (type === 'feeding') {
      try {
        const res = await db.collection('feedingOrders')
          .where({ ownerId: _.in(invitedOpenids), status: _.in(['paid', 'completed']) })
          .get()
        ;(res.data || []).forEach(o => {
          totalAmount += Number(o.totalPrice) || Number(o.totalAmount) || 0
          totalCount++
        })
      } catch (e) {
        logger.warn('getReferralOrderStats.feedingOrders', { type, code: e.errCode, msg: e.message })
      }
    } else if (type === 'tuan') {
      try {
        const res = await db.collection('tuan_orders')
          .where({ ownerId: _.in(invitedOpenids), status: _.in(['paid', 'completed']) })
          .get()
        ;(res.data || []).forEach(o => {
          totalAmount += Number(o.totalPrice) || Number(o.totalAmount) || 0
          totalCount++
        })
      } catch (e) {
        logger.warn('getReferralOrderStats.tuan_orders', { type, code: e.errCode, msg: e.message })
      }
    } else if (type === 'activity') {
      try {
        const res = await db.collection('activity_registrations')
          .where({ ownerId: _.in(invitedOpenids), status: _.in(['paid', 'confirmed', 'completed']) })
          .get()
        ;(res.data || []).forEach(o => {
          totalAmount += Number(o.totalPrice) || Number(o.totalAmount) || 0
          totalCount++
        })
      } catch (e) {
        logger.warn('getReferralOrderStats.activity_registrations', { type, code: e.errCode, msg: e.message })
      }
    }

    totalAmount = Math.round(totalAmount * 100) / 100

    let commissionRate = 0
    if (targetOpenid) {
      try {
        // targetOpenid 是 openid（admins 集合 _id = openid）
        let admin = null
        try {
          const adminRes = await db.collection('admins').doc(targetOpenid).get()
          admin = adminRes.data
        } catch (e) {
          logger.warn('getReferralOrderStats.admins.fetch', { targetOpenid, code: e.errCode, msg: e.message })
        }
        if (admin && admin.commissionRates && admin.commissionRates[type] !== undefined) {
          commissionRate = Number(admin.commissionRates[type])
        } else {
          const configRes = await db.collection('system_config').doc('commission_rates').get()
          const config = configRes.data || {}
          commissionRate = config[type] !== undefined ? Number(config[type]) : 0
        }
      } catch (e) {
        try {
          const configRes = await db.collection('system_config').doc('commission_rates').get()
          const config = configRes.data || {}
          commissionRate = config[type] !== undefined ? Number(config[type]) : 0
        } catch (e2) {
          logger.warn('getReferralOrderStats.system_config.fallback', { targetOpenid, type, code: e2.errCode, msg: e2.message })
        }
      }
    } else {
      try {
        const configRes = await db.collection('system_config').doc('commission_rates').get()
        const config = configRes.data || {}
        commissionRate = config[type] !== undefined ? Number(config[type]) : 0
      } catch (e) {
        logger.warn('getReferralOrderStats.system_config', { type, code: e.errCode, msg: e.message })
      }
    }

    const estimatedCommission = Math.round(totalAmount * commissionRate / 100 * 100) / 100

    return handleSuccess({ totalAmount, totalCount, commissionRate, estimatedCommission })
  } catch (error) {
    logger.error('getReferralOrderStats', error)
    return handleError(error, '获取带货订单统计失败', ERROR_CODES.DATA)
  }
}

async function convertCloudAvatars(list) {
  const cloudAvatars = list.filter(u => u.avatarUrl && u.avatarUrl.startsWith('cloud://'))
  if (cloudAvatars.length === 0) {return}
  try {
    const uniqueFileIds = [...new Set(cloudAvatars.map(u => u.avatarUrl))]
    const urlRes = await cloud.getTempFileURL({ fileList: uniqueFileIds })
    const urlMap = {}
    ;(urlRes.fileList || []).forEach(f => {
      if (f.status === 0 && f.tempFileURL) {urlMap[f.fileID] = f.tempFileURL}
    })
    list.forEach(u => {
      if (u.avatarUrl && urlMap[u.avatarUrl]) {u.avatarUrl = urlMap[u.avatarUrl]}
    })
  } catch (e) {
    logger.warn('convertCloudAvatars', { count: cloudAvatars.length, code: e.errCode, msg: e.message })
  }
}

async function getPartnerCommissionRates(event, context, auth) {
  const targetOpenid = event.targetOpenid || event.data?.targetOpenid
  if (!targetOpenid) {throw err('INVALID_PARAMS', '缺少合作伙伴ID')}

  try {
    logger.info('getPartnerCommissionRates', { targetOpenid, authOpenid: auth.openid })
    // targetOpenid 是 openid（admins 集合 _id = openid）
    let admin = null
    try {
      const adminRes = await db.collection('admins').doc(targetOpenid).get()
      admin = adminRes.data
    } catch (e) {
      logger.warn('getPartnerCommissionRates.admins.fetch', { targetOpenid, code: e.errCode, msg: e.message })
    }

    let globalRates = {}
    try {
      const configRes = await db.collection('system_config').doc('commission_rates').get()
      globalRates = configRes.data || {}
    } catch (e) {
      logger.warn('getPartnerCommissionRates.system_config', { code: e.errCode, msg: e.message })
    }

    const customRates = (admin && admin.commissionRates) || {}
    const rates = {}
    ORDER_TYPES.forEach(type => {
      rates[type] = customRates[type] !== undefined ? Number(customRates[type]) : (globalRates[type] !== undefined ? Number(globalRates[type]) : 0)
    })

    return handleSuccess({ rates, hasCustomRates: Boolean(admin && admin.commissionRates) })
  } catch (error) {
    logger.error('getPartnerCommissionRates', error)
    return handleError(error, '获取合作伙伴佣金比例失败', ERROR_CODES.DATA)
  }
}

async function updatePartnerCommissionRates(event, context, auth) {
  const targetOpenid = event.targetOpenid || event.data?.targetOpenid
  const rates = event.rates || event.data?.rates
  if (!targetOpenid) {throw err('INVALID_PARAMS', '缺少合作伙伴ID')}
  if (!rates || typeof rates !== 'object') {throw err('INVALID_PARAMS', '配置格式错误')}

  try {
    logger.info('updatePartnerCommissionRates', { targetOpenid, rates, authOpenid: auth.openid })
    // targetOpenid 是 openid（admins 集合 _id = openid）
    const commissionRates = {}

    for (const type of Object.keys(rates)) {
      if (!ORDER_TYPES.includes(type)) {continue}
      const rate = Number(rates[type])
      if (isNaN(rate) || rate < 0 || rate > 100) {
        throw err('INVALID_PARAMS', `${ORDER_TYPE_NAMES[type]}分佣比例须在0-100之间`)
      }
      commissionRates[type] = rate
    }

    await db.collection('admins').doc(targetOpenid).update({
      data: {
        commissionRates,
        commissionRatesUpdatedAt: new Date(),
      },
    })

    return handleSuccess({ commissionRates })
  } catch (error) {
    logger.error('updatePartnerCommissionRates', error)
    return handleError(error, '更新合作伙伴佣金比例失败', ERROR_CODES.DATA)
  }
}

async function getMyCommissionRates(event, context, auth) {
  const openid = auth.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    logger.info('getMyCommissionRates', { openid })
    let admin = null
    try {
      const adminRes = await db.collection('admins').doc(openid).get()
      admin = adminRes.data
    } catch (e) {
      logger.warn('getMyCommissionRates.admins.fetch', { openid, code: e.errCode, msg: e.message })
    }

    let globalRates = {}
    try {
      const configRes = await db.collection('system_config').doc('commission_rates').get()
      globalRates = configRes.data || {}
    } catch (e) {
      logger.warn('getMyCommissionRates.system_config', { code: e.errCode, msg: e.message })
    }

    const customRates = (admin && admin.commissionRates) || {}
    const rates = {}
    ORDER_TYPES.forEach(type => {
      rates[type] = customRates[type] !== undefined ? Number(customRates[type]) : (globalRates[type] !== undefined ? Number(globalRates[type]) : 0)
    })

    return handleSuccess({ rates, hasCustomRates: Boolean(admin && admin.commissionRates) })
  } catch (error) {
    logger.error('getMyCommissionRates', error)
    return handleError(error, '获取佣金比例失败', ERROR_CODES.DATA)
  }
}

module.exports = { getUserList, getUserDetail, updateUserStatus, getDashboardStats, getEnhancedDashboardStats, getFinanceOverview, getReferralStats, getReferralList, getInvitedUsersByAdmin, getReferralOrders, getReferralOrderStats, getPartnerCommissionRates, updatePartnerCommissionRates, getMyCommissionRates }
