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
 *
 * L6: 喂养师体系已废弃——统一从 service_incomes 集合查询（providerId = openid），
 *   不再中转 feeders 集合，也不再直接查 feedingOrders.ownerId
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

    // 从 service_incomes 表统一查询，确保与明细查询数据源一致
    const [activityRes, boardingRes, feedingRes] = await Promise.all([
      // 活动收入
      db.collection('service_incomes')
        .where({
          providerId: openid,
          type: 'activity',
          status: _.neq('cancelled')
        })
        .field({ amount: true, createdAt: true, settledAt: true })
        .limit(500)
        .get(),

      // 寄养收入
      db.collection('service_incomes')
        .where({
          providerId: openid,
          type: 'boarding',
          status: _.neq('cancelled')
        })
        .field({ amount: true, createdAt: true, settledAt: true })
        .limit(500)
        .get(),

      // 上门服务收入
      db.collection('service_incomes')
        .where({
          providerId: openid,
          type: 'feeding',
          status: _.neq('cancelled')
        })
        .field({ amount: true, createdAt: true, settledAt: true })
        .limit(500)
        .get()
    ])

    // 处理活动收入（使用 settledAt 或 createdAt）
    const activityItems = (activityRes.data || []).map((o: Record<string, unknown>) => ({
      amount: Number(o.amount) || 0,
      date: (o.settledAt || o.createdAt) as Date,
    }))
    const activity = calculateAggregate(activityItems, monthStart, todayStart)

    // 处理寄养收入
    const boardingItems = (boardingRes.data || []).map((o: Record<string, unknown>) => ({
      amount: Number(o.amount) || 0,
      date: (o.settledAt || o.createdAt) as Date,
    }))
    const boarding = calculateAggregate(boardingItems, monthStart, todayStart)

    // 处理上门服务收入
    const feedingItems = (feedingRes.data || []).map((o: Record<string, unknown>) => ({
      amount: Number(o.amount) || 0,
      date: (o.settledAt || o.createdAt) as Date,
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
 * @param event.page - 页码（从1开始）
 * @param event.pageSize - 每页数量
 *
 * L6: 喂养师体系已废弃——统一从 service_incomes 集合查询（providerId = openid），
 *   不再中转 feeders 集合，也不再直接查 feedingOrders.ownerId
 */
export async function getServiceIncomeDetails(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { type = 'all', page = 1, pageSize = 20 } = event

  try {
    // 构建查询条件（排除已取消的收入）
    const where: Record<string, unknown> = {
      providerId: openid,
      status: _.neq('cancelled')
    }
    if (type !== 'all') {
      where.type = type
    }

    // 查询总数
    const countRes = await db.collection('service_incomes')
      .where(where)
      .count()
    const total = countRes.total

    // 查询分页数据
    const skip = (page - 1) * pageSize
    const incomesRes = await db.collection('service_incomes')
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    // 格式化返回数据
    const typeNameMap: Record<string, string> = {
      'activity': '活动',
      'boarding': '寄养',
      'feeding': '上门服务'
    }
    const list = ((incomesRes.data || []) as Array<Record<string, unknown>>).map(income => {
      const incomeType = (income.type as string) || ''
      return {
        id: (income._id as string) || '',
        type: incomeType,
        typeName: typeNameMap[incomeType] || incomeType,
        amount: Number(income.amount) || 0,
        orderNo: (income.orderNo as string) || '',
        description: (income.description as string) || `${typeNameMap[incomeType] || incomeType}收入`,
        status: (income.status as string) || '',
        createdAt: income.createdAt as Date,
        orderId: (income.orderId as string) || '',
      } as ServiceIncomeDetailItem
    })

    // 计算总金额（所有符合条件的记录）
    const allIncomesRes = await db.collection('service_incomes')
      .where(where)
      .field({ amount: true })
      .limit(500)
      .get()
    const totalAmount = ((allIncomesRes.data || []) as Array<Record<string, unknown>>).reduce((sum, item) => {
      return sum + (Number(item.amount) || 0)
    }, 0)

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
