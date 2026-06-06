const { handleSuccess, handleError, ERROR_CODES, paginate } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:stats')

const ORDER_COLLECTIONS = {
  mall: 'orders',
  tuan: 'tuan_orders',
  feeding: 'feedingOrders',
  boarding: 'orders',
  activity: 'activity_registrations',
}

const ORDER_TYPE_FILTERS = {
  mall: { type: 'mall' },
  boarding: { ownerId: _.exists(true), type: _.or([_.exists(false), _.neq('mall')]) },
}

async function getOrderStats(event) {
  try {
    const { orderType, status, startDate, endDate } = event
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const where = {}
    if (status) {where.status = status}
    if (startDate) {where.createdAt = _.gte(new Date(startDate))}
    if (endDate) {where.createdAt = _.lte(new Date(endDate))}

    const typeStats = {}
    const allOrderTypes = ['mall', 'tuan', 'feeding', 'boarding', 'activity']
    for (const type of allOrderTypes) {
      const coll = ORDER_COLLECTIONS[type]
      const typeWhere = { ...where }

      if (type === 'mall') {typeWhere.type = 'mall'}
      if (type === 'boarding') {typeWhere.type = _.or([_.exists(false), _.neq('mall')])}

      const [count, amountAgg] = await Promise.all([
        db.collection(coll).where(typeWhere).count(),
        db.collection(coll).where(typeWhere).aggregate()
          .group({ _id: null, total: { $sum: { $toDouble: { $ifNull: ['$totalPrice', '$price', 0] } } } })
          .end(),
      ])

      const amount = amountAgg.data && amountAgg.data[0] ? amountAgg.data[0].total : 0
      typeStats[type] = { count: count.total, amount: Number(amount.toFixed(2)) }
    }

    const todayWhere = { ...where, createdAt: _.gte(todayStart) }
    let todayCount = 0
    let todayAmount = 0
    let totalCount = 0
    let totalAmount = 0

    for (const type of allOrderTypes) {
      const coll = ORDER_COLLECTIONS[type]
      const typeTodayWhere = { ...todayWhere }
      const typeAllWhere = { ...where }

      if (type === 'mall') {
        typeTodayWhere.type = 'mall'
        typeAllWhere.type = 'mall'
      }
      if (type === 'boarding') {
        typeTodayWhere.type = _.or([_.exists(false), _.neq('mall')])
        typeAllWhere.type = _.or([_.exists(false), _.neq('mall')])
      }

      const [todayCnt, todayAmtAgg, allCnt, allAmtAgg] = await Promise.all([
        db.collection(coll).where(typeTodayWhere).count(),
        db.collection(coll).where(typeTodayWhere).aggregate()
          .group({ _id: null, total: { $sum: { $toDouble: { $ifNull: ['$totalPrice', '$price', 0] } } } })
          .end(),
        db.collection(coll).where(typeAllWhere).count(),
        db.collection(coll).where(typeAllWhere).aggregate()
          .group({ _id: null, total: { $sum: { $toDouble: { $ifNull: ['$totalPrice', '$price', 0] } } } })
          .end(),
      ])

      const todayAmt = todayAmtAgg.data && todayAmtAgg.data[0] ? todayAmtAgg.data[0].total : 0
      const allAmt = allAmtAgg.data && allAmtAgg.data[0] ? allAmtAgg.data[0].total : 0

      todayCount += todayCnt.total
      todayAmount += todayAmt
      totalCount += allCnt.total
      totalAmount += allAmt
    }

    return handleSuccess({
      todayOrders: todayCount,
      todayAmount: Number(todayAmount.toFixed(2)),
      totalOrders: totalCount,
      totalAmount: Number(totalAmount.toFixed(2)),
      byType: typeStats,
    })
  } catch (e) {
    logger.error('getOrderStats', e)
    return handleSuccess({
      todayOrders: 0,
      todayAmount: 0,
      totalOrders: 0,
      totalAmount: 0,
      byType: {},
    })
  }
}

async function exportOrders(event) {
  try {
    const { orderType, status, startDate, endDate } = event
    let orders = []

    const typesToExport = orderType ? [orderType] : ['mall', 'tuan', 'feeding', 'boarding', 'activity']

    for (const type of typesToExport) {
      const coll = ORDER_COLLECTIONS[type]
      const where = {}
      if (status) {where.status = status}
      if (startDate) {where.createdAt = _.gte(new Date(startDate))}
      if (endDate) {where.createdAt = _.lte(new Date(endDate))}

      if (type === 'mall') {where.type = 'mall'}
      if (type === 'boarding') {where.type = _.or([_.exists(false), _.neq('mall')])}

      const res = await db.collection(coll).where(where).orderBy('createdAt', 'desc').limit(1000).get()
      const typeOrders = (res.data || []).map(o => ({
        ...o,
        orderType: type,
      }))
      orders = orders.concat(typeOrders)
    }

    return handleSuccess({ orders })
  } catch (e) {
    logger.error('exportOrders', e)
    return handleError(e, '导出订单失败')
  }
}

async function getOrderTrend(event) {
  try {
    const { days = 30 } = event
    const now = new Date()
    const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    startDate.setHours(0, 0, 0, 0)

    const trendData = []
    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      let dayCount = 0
      let dayAmount = 0

      for (const type of ['mall', 'tuan', 'feeding', 'boarding', 'activity']) {
        const coll = ORDER_COLLECTIONS[type]
        const where = { createdAt: _.and(_.gte(dayStart), _.lt(dayEnd)) }
        if (type === 'mall') {where.type = 'mall'}
        if (type === 'boarding') {where.type = _.or([_.exists(false), _.neq('mall')])}

        const [count, amtAgg] = await Promise.all([
          db.collection(coll).where(where).count(),
          db.collection(coll).where(where).aggregate()
            .group({ _id: null, total: { $sum: { $toDouble: { $ifNull: ['$totalPrice', '$price', 0] } } } })
            .end(),
        ])

        dayCount += count.total
        const amt = amtAgg.data && amtAgg.data[0] ? amtAgg.data[0].total : 0
        dayAmount += amt
      }

      const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`
      trendData.push({
        date: dateStr,
        count: dayCount,
        amount: Number(dayAmount.toFixed(2)),
      })
    }

    return handleSuccess({ trend: trendData })
  } catch (e) {
    logger.error('getOrderTrend', e)
    return handleSuccess({ trend: [] })
  }
}

async function getOrderTypeStats(event) {
  try {
    const byType = {}
    for (const type of ['mall', 'tuan', 'feeding', 'boarding', 'activity']) {
      const coll = ORDER_COLLECTIONS[type]
      const where = {}
      if (type === 'mall') {where.type = 'mall'}
      if (type === 'boarding') {where.type = _.or([_.exists(false), _.neq('mall')])}

      const count = await db.collection(coll).where(where).count()
      byType[type] = { count: count.total, name: type }
    }

    return handleSuccess({ byType })
  } catch (e) {
    logger.error('getOrderTypeStats', e)
    return handleSuccess({ byType: {} })
  }
}

async function getCouponStats(event) {
  try {
    const { startDate, endDate, templateId, days: daysParam } = event
    logger.info('getCouponStats', { startDate, endDate, templateId, days: daysParam })

    const userCouponWhere = {}
    if (templateId) { userCouponWhere.templateId = templateId }
    if (startDate) { userCouponWhere.createdAt = _.gte(new Date(startDate)) }
    if (endDate) { userCouponWhere.createdAt = _.lte(new Date(endDate)) }

    // 基础统计：用 where + count 替代 aggregate
    const [totalGranted, totalUsed] = await Promise.all([
      db.collection('user_coupons').where(userCouponWhere).count(),
      db.collection('user_coupons').where({ ...userCouponWhere, status: 'used' }).count(),
    ])

    // 使用记录统计
    const usageWhere = templateId ? { templateId } : {}
    const usageRes = await db.collection('coupon_usage').where(usageWhere).get()
    let totalUsedAmount = 0
    let discountAmount = 0
    for (const u of (usageRes.data || [])) {
      totalUsedAmount += Number(u.originalAmount) || 0
      discountAmount += Number(u.discountAmount) || 0
    }
    const drivenOrders = (usageRes.data || []).length

    // 按模板统计：先获取所有模板，再逐个 count + 领取明细
    const templatesRes = await db.collection('coupon_templates').limit(100).get()
    const byTemplate = []
    for (const t of (templatesRes.data || [])) {
      const [grantCount, usedCount] = await Promise.all([
        db.collection('user_coupons').where({ ...userCouponWhere, templateId: t._id }).count(),
        db.collection('user_coupons').where({ ...userCouponWhere, templateId: t._id, status: 'used' }).count(),
      ])
      if (grantCount.total > 0) {
        // 获取领取明细
        const detailsRes = await db.collection('user_coupons').where({
          ...userCouponWhere, templateId: t._id,
        }).field({ ownerId: true, source: true, status: true, receivedAt: true }).limit(100).get()

        // 批量查询用户昵称
        const ownerIds = [...new Set((detailsRes.data || []).map(d => d.ownerId).filter(Boolean))]
        const usersRes = ownerIds.length > 0
          ? await db.collection('users').where({ _id: _.in(ownerIds) }).field({ _id: true, nickName: true }).limit(100).get()
          : { data: [] }
        const userMap = {}
        ;(usersRes.data || []).forEach(u => { userMap[u._id] = u.nickName || '' })

        byTemplate.push({
          templateId: t._id,
          templateName: t.name || '',
          grantCount: grantCount.total,
          usedCount: usedCount.total,
          unusedCount: grantCount.total - usedCount.total,
          usageRate: grantCount.total > 0 ? Math.round((usedCount.total / grantCount.total) * 10000) / 100 : 0,
          details: (detailsRes.data || []).map(d => ({
            ownerId: d.ownerId,
            nickName: userMap[d.ownerId] || d.ownerId,
            source: d.source,
            status: d.status,
            receivedAt: d.receivedAt,
          })),
        })
      }
    }
    byTemplate.sort((a, b) => b.grantCount - a.grantCount)

    // 趋势数据
    const days = daysParam || 7
    const now = new Date()
    const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    const trendData = []

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`

      const [dayGranted, dayUsed] = await Promise.all([
        db.collection('user_coupons').where({
          createdAt: _.gte(dayStart).and(_.lt(dayEnd)),
        }).count(),
        db.collection('user_coupons').where({
          status: 'used',
          updatedAt: _.gte(dayStart).and(_.lt(dayEnd)),
        }).count(),
      ])

      trendData.push({
        date: dateStr,
        granted: dayGranted.total,
        used: dayUsed.total,
      })
    }

    const result = {
      totalGranted: totalGranted.total,
      totalUsed: totalUsed.total,
      totalUsedAmount: Math.round(totalUsedAmount * 100) / 100,
      usageRate: totalGranted.total > 0 ? Math.round((totalUsed.total / totalGranted.total) * 10000) / 100 : 0,
      drivenOrders,
      drivenRevenue: Math.round(totalUsedAmount * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      byTemplate,
      trend: trendData,
    }
    logger.info('getCouponStats result', { totalGranted: result.totalGranted, totalUsed: result.totalUsed, trendLen: trendData.length, byTemplateLen: byTemplate.length })
    return handleSuccess(result)
  } catch (e) {
    logger.error('getCouponStats', e)
    return handleSuccess({
      totalGranted: 0,
      totalUsed: 0,
      totalUsedAmount: 0,
      usageRate: 0,
      drivenOrders: 0,
      drivenRevenue: 0,
      discountAmount: 0,
      byTemplate: [],
      trend: [],
    })
  }
}

module.exports = {
  getOrderStats,
  exportOrders,
  getOrderTrend,
  getOrderTypeStats,
  getCouponStats,
  getCouponStatistics: getCouponStats,
}
