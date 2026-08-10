const { handleSuccess, handleError, ERROR_CODES, paginate } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { parseBJTime, bjDayStart, bjFormat } = require('./_bjtime')
const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:stats')

const ORDER_COLLECTIONS = {
  mall: 'orders',
  tuan: 'orders',
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
    const todayStart = bjDayStart(now)
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    const where = {}
    if (status) {
      where.status = status
    } else {
      // 默认排除已取消的订单
      where.status = _.ne('cancelled')
    }
    if (startDate) {where.createdAt = _.gte(parseBJTime(startDate))}
    if (endDate) {where.createdAt = _.lte(parseBJTime(endDate))}

    const allOrderTypes = ['mall', 'tuan', 'feeding', 'boarding', 'activity']

    // 工具：拉取并内存聚合（CloudBase SDK 不支持 where().aggregate()）
    async function loadAndAggregate(coll, typeWhere, range) {
      const res = await db.collection(coll).where(typeWhere).limit(1000).get()
      const list = res.data || []
      let count = 0
      let amount = 0
      for (const o of list) {
        if (range) {
          const t = new Date(o.createdAt)
          if (t < range.start || t >= range.end) continue
        }
        count++
        amount += Number(o.totalAmount || o.totalPrice || o.price || 0)
      }
      return { count, amount: Number(amount.toFixed(2)), total: res.data?.length === 1000 ? null : count }
    }

    const typeStats = {}
    let totalCount = 0
    let totalAmount = 0
    let todayCount = 0
    let todayAmount = 0

    for (const type of allOrderTypes) {
      const coll = ORDER_COLLECTIONS[type]
      const baseWhere = { ...where }

      if (type === 'mall') {baseWhere.type = 'mall'}
      if (type === 'tuan') {baseWhere.type = 'group_buy'}
      if (type === 'boarding') {
        // 排除 mall + group_buy（团订单另算），避免与 tuan 重复计数
        baseWhere.type = _.or([
          _.exists(false),
          _.and(_.neq('mall'), _.neq('group_buy')),
        ])
      }

      // 全量统计
      const all = await loadAndAggregate(coll, baseWhere)
      // 今日统计：基于 baseWhere 过滤
      const today = await loadAndAggregate(coll, baseWhere, { start: todayStart, end: tomorrowStart })

      typeStats[type] = { count: all.count, amount: all.amount }
      totalCount += all.count
      totalAmount += all.amount
      todayCount += today.count
      todayAmount += today.amount
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
      if (type === 'tuan') {where.type = 'group_buy'}
      if (type === 'boarding') {
        where.type = _.or([
          _.exists(false),
          _.and(_.neq('mall'), _.neq('group_buy')),
        ])
      }

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
    const todayBJ = bjDayStart(now)
    const startDate = new Date(todayBJ.getTime() - (days - 1) * 24 * 60 * 60 * 1000)

    // 一次性拉取所有订单（按时间窗口过滤），按天分组内存聚合
    const allTypes = ['mall', 'tuan', 'feeding', 'boarding', 'activity']
    const countsByDay = {}
    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
      const key = bjFormat(dayStart)
      countsByDay[key] = 0
    }

    for (const type of allTypes) {
      const coll = ORDER_COLLECTIONS[type]
      const where = { createdAt: _.gte(startDate), status: _.ne('cancelled') }
      if (type === 'mall') {where.type = 'mall'}
      if (type === 'tuan') {where.type = 'group_buy'}
      if (type === 'boarding') {
        where.type = _.or([
          _.exists(false),
          _.and(_.neq('mall'), _.neq('group_buy')),
        ])
      }
      const res = await db.collection(coll).where(where).limit(1000).get()
      for (const o of (res.data || [])) {
        const t = new Date(o.createdAt)
        const key = bjFormat(t)
        if (countsByDay[key] !== undefined) countsByDay[key]++
      }
    }

    const trendData = Object.keys(countsByDay).sort().map(date => ({
      date, count: countsByDay[date], amount: 0,
    }))

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
      const where = { status: _.ne('cancelled') }
      if (type === 'mall') {where.type = 'mall'}
      if (type === 'tuan') {where.type = 'group_buy'}
      if (type === 'boarding') {
        where.type = _.or([
          _.exists(false),
          _.and(_.neq('mall'), _.neq('group_buy')),
        ])
      }

      const count = await db.collection(coll).where(where).count()
      byType[type] = { count: count.total, name: type }
    }

    return handleSuccess({ byType })
  } catch (e) {
    logger.error('getOrderTypeStats', e)
    return handleSuccess({ byType: {} })
  }
}

/**
 * P2 修复：CloudBase get() 默认单次上限 100 条，统计数据必须分批取全，
 *   否则 coupon_usage/模板排行会被静默截断（核销金额/带动订单数偏小）。
 */
async function fetchAllPaged(collectionName, where = {}, pageSize = 1000, maxPages = 50) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const res = await db.collection(collectionName).where(where).skip(page * pageSize).limit(pageSize).get()
    const rows = res.data || []
    all.push(...rows)
    if (rows.length < pageSize) { break }
  }
  return all
}

async function getCouponStats(event) {
  try {
    const { startDate, endDate, templateId, days: daysParam } = event
    logger.info('getCouponStats', { startDate, endDate, templateId, days: daysParam })

    const userCouponWhere = {}
    if (templateId) { userCouponWhere.templateId = templateId }
    if (startDate) { userCouponWhere.createdAt = _.gte(parseBJTime(startDate)) }
    if (endDate) { userCouponWhere.createdAt = _.lte(parseBJTime(endDate)) }

    // 基础统计：用 where + count 替代 aggregate
    const [totalGranted, totalUsed] = await Promise.all([
      db.collection('user_coupons').where(userCouponWhere).count(),
      db.collection('user_coupons').where({ ...userCouponWhere, status: 'used' }).count(),
    ])

    // 使用记录统计（分批取全，避免 100 条截断导致金额/订单数失真）
    const usageWhere = templateId ? { templateId } : {}
    const usageRecords = await fetchAllPaged('coupon_usage', usageWhere)
    let totalUsedAmount = 0
    let discountAmount = 0
    for (const u of usageRecords) {
      totalUsedAmount += Number(u.originalAmount) || 0
      discountAmount += Number(u.discountAmount) || 0
    }
    const drivenOrders = usageRecords.length

    // 按模板统计：先分批获取全部模板，再逐个 count + 领取明细
    const templates = await fetchAllPaged('coupon_templates', {})
    const byTemplate = []
    for (const t of templates) {
      const [grantCount, usedCount] = await Promise.all([
        db.collection('user_coupons').where({ ...userCouponWhere, templateId: t._id }).count(),
        db.collection('user_coupons').where({ ...userCouponWhere, templateId: t._id, status: 'used' }).count(),
      ])
      if (grantCount.total > 0) {
        // 获取领取明细（页面展开表格无分页，展示侧保留 100 条上限；
        //   统计口径 grantCount/usedCount 用 count() 不受此限制）
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
    const todayBJ = bjDayStart(now)
    const start = new Date(todayBJ.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    const trendData = []

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const dateStr = bjFormat(dayStart)

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
