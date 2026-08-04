/**
 * orderService/stats.ts - 统计服务（TypeScript 源文件 - Sprint 30 迁移）
 *
 * 业务功能（2 个 handler）：
 *   1. getStats        通用统计（owner / host 双视角）
 *   2. getIncomeStats  收入统计（host 视角，含按状态 + 日期范围聚合）
 *
 * 关键设计：
 *   - 鉴权：所有 handler 都需 auth
 *   - 错误：使用 err() 工厂（参数校验），handleError 包装（统一响应）
 *   - 业务错误：isBusinessError 类型守卫（替代裸字符串 e.code === 'X'）
 *   - 聚合：使用 db.collection.aggregate().group() 计算 bookingCount / totalSpent / totalIncome
 *   - 日期范围：today / week / month / last_month / default（与 orders.ts 共享语义）
 *
 * 迁移目标：
 *   - 强类型化 2 个 handler 的 event / context / auth
 *   - 强类型化聚合查询的输入/输出（消除聚合字段拼写错误）
 *   - 编译产物（stats.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 *
 * 后续计划：
 *   - Sprint 31: orderService 完成 TS 迁移
 */

// Sprint 30 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/orderService/stats.js）
//   - 对 .js 文件（utils / errors）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - handler 在 module.exports 时统一用 withErrorHandling 包装

import { initCloud, handleSuccess, handleError, ERROR_CODES } from './common/utils'
import { createLogger, type ServiceLogger } from './common/logger'
import type { CloudBaseDB, ApiResponse } from './common/types'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, withErrorHandling } = require('./common/errors')

// =====================================================================
// 类型定义
// =====================================================================

/** 通用 handler 签名（event / context / auth） */
type AuthLike = { openid?: string, [k: string]: unknown }
type EventLike = Record<string, unknown>
type ContextLike = Record<string, unknown>
type HandlerResult = Promise<ApiResponse<unknown> | unknown>

/** 通用统计（bookingCount / totalSpent / totalIncome） */
interface GeneralStats {
  bookingCount: number
  totalSpent: number
  totalIncome: number
}

/** 收入统计聚合结果 - 通用 */
interface AggregateSumResult {
  list?: Array<Record<string, number>>
}

/** 收入统计聚合结果 - 月度 */
interface AggregateMonthlyResult {
  list?: Array<Record<string, number>>
}

/** 收入统计聚合结果 - 待结算 */
interface AggregatePendingResult {
  list?: Array<Record<string, number>>
}

/** 收入统计返回数据 */
interface IncomeStatsData {
  totalIncome: number
  monthlyIncome: number
  pendingIncome: number
  incomeList: IncomeListItem[]
}

/** 收入明细 */
interface IncomeListItem {
  id: string
  title: string
  date: string
  orderId: string
  status: string
  statusText: string
  amount: number
}

/** 日期范围预设 */
type DateRangePreset = 'today' | 'week' | 'month' | 'last_month' | string

/** 状态文本映射（订单状态通知）
 *
 * P0 修复（H6）：与 orders.ts 实际写入的状态值对齐
 *   - pending_payment / paid / confirmed / in_progress / completed / cancelled / refunded
 *   - 删除原 pending / ongoing（订单文档从不使用这两个值）
 */
const STATUS_TEXT_MAP: Record<string, string> = {
  pending_payment: '待支付',
  paid: '已支付',
  confirmed: '已确认',
  in_progress: '进行中',
  completed: '已结算',
  cancelled: '已取消',
  refunded: '已退款',
}

/** CloudBase 聚合操作符 - 简化版 */
interface AggregateOps {
  sum: (v: number | Record<string, unknown>) => unknown
}

interface AggregateCommand {
  command: { aggregate?: AggregateOps, [k: string]: unknown }
}

// =====================================================================
// 模块初始化
// =====================================================================

const { db } = initCloud() as { cloud: unknown, db: CloudBaseDB }
// L2 修复：删除未使用的 const _（死代码）
const $: AggregateOps = (db as unknown as AggregateCommand).command.aggregate || { sum: () => 0 }
const logger: ServiceLogger = createLogger('orderService')

// =====================================================================
// 内部辅助
// =====================================================================

/** 计算日期范围（today / week / month / last_month） */
function getDateRangeFromPreset(range: DateRangePreset): { startDate: Date | null, endDate: Date | null } {
  const now = new Date()
  let startDate: Date | null = null
  let endDate: Date | null = null
  switch (range) {
  case 'today':
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    break
  case 'week': {
    // L3 修复：中文业务以周一为一周起点（getDay() 周日=0 → 周一=0，周日=6）
    const dayOfWeek = (now.getDay() + 6) % 7
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek)
    weekStart.setHours(0, 0, 0, 0)
    startDate = weekStart
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    break
  }
  case 'month':
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    break
  case 'last_month': {
    const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    startDate = new Date(lastMonthYear, lastMonth, 1)
    endDate = new Date(lastMonthYear, lastMonth + 1, 0, 23, 59, 59)
    break
  }
  default:
    startDate = null
    endDate = null
  }
  return { startDate, endDate }
}

/** 安全地从聚合结果中提取数值（默认 0） */
function pickSum(result: AggregateSumResult, key: string): number {
  if (!result || !result.list || result.list.length === 0) {return 0}
  const first = result.list[0] as Record<string, number>
  return Number(first[key] || 0)
}

// =====================================================================
// Handler 实现
// =====================================================================

/**
 * 1. getStats - 通用统计（owner / host 双视角）
 */
export async function getStats(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { userRole } = event as { userRole?: 'owner' | 'host' | string }
  if (!userRole) {throw err('INVALID_PARAMS', '缺少角色参数')}

  const stats: GeneralStats = { bookingCount: 0, totalSpent: 0, totalIncome: 0 }

  try {
    if (userRole === 'owner') {
      const ownerStatsRes = await db.collection('orders')
        .where({ ownerId: openid })
        .aggregate()
        .group({
          _id: null,
          bookingCount: $.sum(1),
          totalSpent: $.sum({ $cond: [{ $ne: ['$totalPrice', null] }, '$totalPrice', 0] }),
        })
        .end() as unknown as AggregateSumResult

      if (ownerStatsRes.list && ownerStatsRes.list.length > 0) {
        const statsData = ownerStatsRes.list[0] as Record<string, number>
        stats.bookingCount = Number(statsData.bookingCount || 0)
        stats.totalSpent = Number(statsData.totalSpent || 0)
      }
    } else if (userRole === 'host') {
      // P0 修复（H5）：host 视角应按 organizerId（寄养家庭 openid）查询，
      //   而非 hostId（寄养家庭档案 _id），否则统计永远为 0
      const hostStatsRes = await db.collection('orders')
        .where({ organizerId: openid, status: 'completed' })
        .aggregate()
        .group({
          _id: null,
          bookingCount: $.sum(1),
          totalIncome: $.sum({ $cond: [{ $ne: ['$totalPrice', null] }, '$totalPrice', 0] }),
        })
        .end() as unknown as AggregateSumResult

      if (hostStatsRes.list && hostStatsRes.list.length > 0) {
        const statsData = hostStatsRes.list[0] as Record<string, number>
        stats.bookingCount = Number(statsData.bookingCount || 0)
        stats.totalIncome = Number(statsData.totalIncome || 0)
      }
    } else {
      throw err('INVALID_PARAMS', `无效的角色类型: ${userRole}`)
    }

    return handleSuccess(stats, '获取成功')
  } catch (error: unknown) {
    // L9 修复：两个分支返回完全相同，if (isBusinessError) 判断冗余，简化为单一 return
    logger.error('getStats', { msg: (error as Error)?.message })
    return handleError(error as Error, '获取统计数据失败', ERROR_CODES.DATA)
  }
}

/**
 * 2. getIncomeStats - 收入统计（host 视角）
 *
 * 支持：
 *   - status: 'all' | 'completed' | 'pending'
 *   - dateRange: 'today' | 'week' | 'month' | 'last_month' | 'all' | '全部'
 *   - limit: 单次返回的最大订单数（默认 500，上限 1000）
 */
export async function getIncomeStats(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  // P2 修复（M13）：limit 在解构中声明，避免直接 event.limit 取值（风格不一致）
  const { status, dateRange, limit: requestLimit } = event as { status?: string, dateRange?: DateRangePreset, limit?: number }
  const now = new Date()

  const { startDate, endDate } = getDateRangeFromPreset(dateRange || '')

  try {
    // P0 修复（H5）：host 视角应按 organizerId 查询；与 getStats 保持一致
    const query: Record<string, unknown> = { organizerId: openid }
    if (status && status !== 'all') {
      if (status === 'completed') {
        query.status = 'completed'
      } else if (status === 'pending') {
        // P0 修复（H6）：待结算状态含未支付/已支付/已确认/进行中（与 orders.ts 状态命名对齐）
        query.status = (db.command as { in: (arr: string[]) => unknown }).in(['pending_payment', 'paid', 'confirmed', 'in_progress'])
      }
    }

    if (startDate && endDate && dateRange && dateRange !== 'all' && dateRange !== '全部') {
      const gteOp = (db.command as unknown as { gte: (v: number) => unknown }).gte(startDate.getTime()) as { and: (other: unknown) => unknown }
      const lteOp = (db.command as unknown as { lte: (v: number) => unknown }).lte(endDate.getTime())
      query.createdAt = gteOp.and(lteOp)
    }

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime()

    const completedQuery: Record<string, unknown> = { ...query, status: 'completed' }
    // P0 修复（H6）：pendingQuery 状态值与 orders.ts 实际写入对齐（移除 ongoing/pending）
    const inOp = (db.command as { in: (arr: string[]) => unknown }).in(['pending_payment', 'paid', 'confirmed', 'in_progress'])
    const pendingQuery: Record<string, unknown> = { ...query, status: inOp }

    // P0 修复（H7）：monthlyIncome 应独立于 dateRange 计算（始终是当月已完成订单），
    //   不复用 completedQuery（其 createdAt 是 dateRange 范围，会导致 last_month 等场景下 monthlyIncome=0）
    const monthlyQuery: Record<string, unknown> = {
      organizerId: openid,
      status: 'completed',
      createdAt: ((db.command as unknown as { gte: (v: number) => unknown }).gte(monthStart) as { and: (other: unknown) => unknown }).and((db.command as unknown as { lte: (v: number) => unknown }).lte(monthEnd)),
    }

    const [totalRes, monthlyRes, pendingRes] = await Promise.all([
      db.collection('orders').where(completedQuery).aggregate()
        .group({ _id: null, totalIncome: $.sum({ $cond: [{ $ne: ['$totalPrice', null] }, '$totalPrice', 0] }) })
        .end() as unknown as AggregateSumResult,
      db.collection('orders').where(monthlyQuery).aggregate()
        .group({ _id: null, monthlyIncome: $.sum({ $cond: [{ $ne: ['$totalPrice', null] }, '$totalPrice', 0] }) })
        .end() as unknown as AggregateMonthlyResult,
      db.collection('orders').where(pendingQuery).aggregate()
        .group({ _id: null, pendingIncome: $.sum({ $cond: [{ $ne: ['$totalPrice', null] }, '$totalPrice', 0] }) })
        .end() as unknown as AggregatePendingResult,
    ])

    const totalIncome = pickSum(totalRes, 'totalIncome')
    const monthlyIncome = pickSum(monthlyRes, 'monthlyIncome')
    const pendingIncome = pickSum(pendingRes, 'pendingIncome')

    const limit = Math.min(Number(requestLimit) || 500, 1000)
    const ordersResult = await db.collection('orders').where(query as never)
      .field({ _id: true, totalPrice: true, status: true, createdAt: true, type: true })
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    const incomeList: IncomeListItem[] = ((ordersResult.data || []) as Array<{ _id: string, totalPrice?: number, status?: string, createdAt?: Date | string }>).map((order) => {
      const orderPrice = Number(order.totalPrice || 0)
      let dateStr = ''
      if (order.createdAt) {
        const orderDate = new Date(order.createdAt)
        dateStr = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}-${String(orderDate.getDate()).padStart(2, '0')}`
      }
      const statusValue = order.status || ''
      return {
        id: order._id,
        title: '寄养服务收入',
        date: dateStr,
        orderId: `${order._id.substring(0, 8)}...`,
        status: statusValue === 'completed' ? 'completed' : statusValue,
        statusText: STATUS_TEXT_MAP[statusValue] || '未知',
        amount: orderPrice,
      }
    })

    const data: IncomeStatsData = {
      totalIncome,
      monthlyIncome,
      pendingIncome,
      incomeList,
    }
    return handleSuccess(data, '获取成功')
  } catch (error: unknown) {
    if (isBusinessError(error)) {
      return handleError(error as Error, '获取收入统计失败', ERROR_CODES.DATA)
    }
    logger.error('getIncomeStats', { msg: (error as Error)?.message })
    return handleError(error as Error, '获取收入统计失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// 默认导出（保持 CommonJS 兼容：module.exports = { handler: withErrorHandling(...) }）
// =====================================================================

const _handlers = {
  getStats: withErrorHandling(getStats),
  getIncomeStats: withErrorHandling(getIncomeStats),
}

// Runtime shim: 把 module.exports 指向包装后的 handlers
// (兼容原 CommonJS 模式 `module.exports = { ... }`，
//  避免消费方需用 .default 才能取到包装后的 handler)
// index.js 使用 `require('./stats').getStats` 和 `require('./stats').getIncomeStats`，
// 因此需要这个 shim。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = _handlers
// 同步设置 default 以保持 ESM 互操作
;(_handlers as Record<string, unknown>).default = _handlers

export default _handlers
