/**
 * income.ts - 服务收入服务（活动创建者、寄养服务者、上门服务者）
 *
 * 业务功能：
 *   - 获取服务收入概览（getServiceIncomeOverview）
 *   - 获取服务收入明细（getServiceIncomeDetails）
 *
 * 收入类型：
 *   - 活动收入：活动创建者通过创建活动获得的报名费收入
 *   - 寄养收入：寄养家庭提供服务获得的报酬
 *   - 上门服务收入：服务师提供上门服务获得的报酬
 *
 * 与佣金的区别：
 *   - 佣金：推广奖励（推荐他人消费获得的分成）
 *   - 收入：服务报酬（提供服务直接获得的报酬）
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('partnerService:income')

// =====================================================================
// 类型定义
// =====================================================================

export interface AuthLike {
  openid?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  roles?: string[]
  permissions?: string[]
  [k: string]: unknown
}

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  type?: string
  page?: number
  pageSize?: number
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export interface ServiceIncomeAggregate {
  total: number
  monthly: number
  today: number
  count: number
}

export interface ServiceIncomeOverview {
  activity: ServiceIncomeAggregate
  boarding: ServiceIncomeAggregate
  feeding: ServiceIncomeAggregate
  totalIncome: number
  monthlyIncome: number
  todayIncome: number
}

export interface ServiceIncomeDetailItem {
  id: string
  type: 'activity' | 'boarding' | 'feeding'
  typeName: string
  amount: number
  orderNo: string
  description: string
  status: string
  createdAt: Date
  orderId?: string
}

// =====================================================================
// 辅助函数
// =====================================================================

const EMPTY_AGGREGATE: ServiceIncomeAggregate = { total: 0, monthly: 0, today: 0, count: 0 }

/** 计算月度/当日收入统计 */
function calculateAggregate(
  items: Array<{ amount: number; date?: Date | string }>,
  monthStart: Date,
  todayStart: Date
): ServiceIncomeAggregate {
  let total = 0
  let monthly = 0
  let today = 0
  let count = 0

  items.forEach((item) => {
    const amt = Number(item.amount) || 0
    total += amt
    count++

    if (item.date) {
      const itemDate = new Date(item.date)
      if (itemDate >= monthStart) {
        monthly += amt
      }
      if (itemDate >= todayStart) {
        today += amt
      }
    }
  })

  return { total, monthly, today, count }
}

// =====================================================================
// Handler 实现
// =====================================================================

/**
 * 获取服务收入概览
 * 包含：活动收入、寄养收入、上门服务收入
 */
export async function getServiceIncomeOverview(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth

  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // 并行查询三种收入
    const [activityRes, boardingRes, feedingRes] = await Promise.all([
      // 活动收入：查询该用户创建的活动的所有已支付订单
      (async () => {
        const activitiesRes = await db.collection('activities')
          .where({ createdBy: openid, status: _.in(['published', 'registration_stopped', 'ended']) })
          .field({ _id: true })
          .get()

        if (!activitiesRes.data || activitiesRes.data.length === 0) {
          return { data: [] }
        }

        const activityIds = activitiesRes.data.map((a: { _id: string }) => a._id)

        // 查询这些活动的所有已支付订单
        const ordersRes = await db.collection('orders')
          .where({
            activityId: _.in(activityIds),
            orderType: 'activity',
            paymentStatus: 'paid',
          })
          .field({ _id: true, totalPrice: true, paidAt: true, createdAt: true })
          .get()

        return ordersRes
      })(),

      // 寄养收入：查询该用户作为寄养家庭的已完成订单
      db.collection('orders')
        .where({
          type: 'boarding',
          status: 'completed',
          organizerId: openid, // 寄养家庭是订单的服务提供者
        })
        .field({ _id: true, totalPrice: true, completedAt: true, updatedAt: true })
        .get(),

      // 上门服务收入：查询该用户作为服务师的已完成订单
      (async () => {
        // 先查询该用户创建的服务师记录
        const feederRes = await db.collection('feeders')
          .where({ createdBy: openid })
          .field({ _id: true })
          .limit(1)
          .get()

        if (!feederRes.data || feederRes.data.length === 0) {
          return { data: [] }
        }

        const feederId = feederRes.data[0]._id

        // 查询该服务师的已完成订单
        const ordersRes = await db.collection('feedingOrders')
          .where({
            feederId,
            status: 'completed',
          })
          .field({ _id: true, totalPrice: true, completedAt: true, updatedAt: true })
          .get()

        return ordersRes
      })(),
    ])

    // 处理活动收入
    const activityItems = (activityRes.data || []).map((o: Record<string, unknown>) => ({
      amount: Number(o.totalPrice) || 0,
      date: (o.paidAt || o.createdAt) as Date,
    }))
    const activity = calculateAggregate(activityItems, monthStart, todayStart)

    // 处理寄养收入
    const boardingItems = (boardingRes.data || []).map((o: Record<string, unknown>) => ({
      amount: Number(o.totalPrice) || 0,
      date: (o.completedAt || o.updatedAt) as Date,
    }))
    const boarding = calculateAggregate(boardingItems, monthStart, todayStart)

    // 处理上门服务收入
    const feedingItems = (feedingRes.data || []).map((o: Record<string, unknown>) => ({
      amount: Number(o.totalPrice) || 0,
      date: (o.completedAt || o.updatedAt) as Date,
    }))
    const feeding = calculateAggregate(feedingItems, monthStart, todayStart)

    const overview: ServiceIncomeOverview = {
      activity,
      boarding,
      feeding,
      totalIncome: activity.total + boarding.total + feeding.total,
      monthlyIncome: activity.monthly + boarding.monthly + feeding.monthly,
      todayIncome: activity.today + boarding.today + feeding.today,
    }

    return handleSuccess(overview)
  } catch (error) {
    logger.error('getServiceIncomeOverview', error)
    return handleError(error, '获取服务收入概览失败', { code: 'DATA_ERROR' })
  }
}

/**
 * 获取服务收入明细
 * @param event.type - 收入类型筛选：all | activity | boarding | feeding
 */
export async function getServiceIncomeDetails(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { type = 'all', page = 1, pageSize = 20 } = event

  try {
    const allItems: ServiceIncomeDetailItem[] = []

    // 活动收入明细
    if (type === 'all' || type === 'activity') {
      const activitiesRes = await db.collection('activities')
        .where({ createdBy: openid, status: _.in(['published', 'registration_stopped', 'ended']) })
        .field({ _id: true, title: true })
        .get()

      if (activitiesRes.data && activitiesRes.data.length > 0) {
        const activityIds = activitiesRes.data.map((a: { _id: string }) => a._id)
        const activityMap = new Map(activitiesRes.data.map((a: { _id: string; title: string }) => [a._id, a.title]))

        const ordersRes = await db.collection('orders')
          .where({
            activityId: _.in(activityIds),
            orderType: 'activity',
            paymentStatus: 'paid',
          })
          .field({ _id: true, activityId: true, totalPrice: true, orderNo: true, paidAt: true, createdAt: true })
          .get()

        ;(ordersRes.data || []).forEach((o: Record<string, unknown>) => {
          const activityTitle = activityMap.get(o.activityId as string) || '活动'
          allItems.push({
            id: o._id as string,
            type: 'activity',
            typeName: '活动',
            amount: Number(o.totalPrice) || 0,
            orderNo: (o.orderNo as string) || '',
            description: `活动收入-${activityTitle}`,
            status: 'completed',
            createdAt: (o.paidAt || o.createdAt) as Date,
            orderId: o._id as string,
          })
        })
      }
    }

    // 寄养收入明细
    if (type === 'all' || type === 'boarding') {
      const ordersRes = await db.collection('orders')
        .where({
          type: 'boarding',
          status: 'completed',
          organizerId: openid,
        })
        .field({ _id: true, totalPrice: true, orderNo: true, completedAt: true, updatedAt: true, createdAt: true })
        .get()

      ;(ordersRes.data || []).forEach((o: Record<string, unknown>) => {
        allItems.push({
          id: o._id as string,
          type: 'boarding',
          typeName: '寄养',
          amount: Number(o.totalPrice) || 0,
          orderNo: (o.orderNo as string) || '',
          description: '寄养服务收入',
          status: 'completed',
          createdAt: (o.completedAt || o.updatedAt || o.createdAt) as Date,
          orderId: o._id as string,
        })
      })
    }

    // 上门服务收入明细
    if (type === 'all' || type === 'feeding') {
      const feederRes = await db.collection('feeders')
        .where({ createdBy: openid })
        .field({ _id: true })
        .limit(1)
        .get()

      if (feederRes.data && feederRes.data.length > 0) {
        const feederId = feederRes.data[0]._id

        const ordersRes = await db.collection('feedingOrders')
          .where({
            feederId,
            status: 'completed',
          })
          .field({ _id: true, totalPrice: true, orderNo: true, completedAt: true, updatedAt: true, createdAt: true })
          .get()

        ;(ordersRes.data || []).forEach((o: Record<string, unknown>) => {
          allItems.push({
            id: o._id as string,
            type: 'feeding',
            typeName: '上门服务',
            amount: Number(o.totalPrice) || 0,
            orderNo: (o.orderNo as string) || '',
            description: '上门服务收入',
            status: 'completed',
            createdAt: (o.completedAt || o.updatedAt || o.createdAt) as Date,
            orderId: o._id as string,
          })
        })
      }
    }

    // 按时间倒序排序
    allItems.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })

    const total = allItems.length
    const totalAmount = allItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const start = (page - 1) * pageSize
    const list = allItems.slice(start, start + pageSize)

    return handleSuccess({ list, total, totalAmount })
  } catch (error) {
    logger.error('getServiceIncomeDetails', error)
    return handleError(error, '获取服务收入明细失败', { code: 'DATA_ERROR' })
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  getServiceIncomeOverview,
  getServiceIncomeDetails,
}
_mod.exports.default = _mod.exports

export default {
  getServiceIncomeOverview,
  getServiceIncomeDetails,
}

// 避免 unused 警告
void cloud
