/**
 * referral.ts - 用户邀请服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 获取邀请统计（getReferralStats）
 *   - 获取邀请用户列表（getInvitedUsers）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 OrderLike / OwnerSummary 类型
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, ERROR_CODES, maskOpenid } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud()
const _ = db.command
// L3 修复：统计改用服务端聚合，需要聚合运算符（sum / addToSet）
interface AggregateOps {
  sum: (field: number | string) => unknown
  addToSet: (field: string) => unknown
}
const $ = (db.command as { aggregate: AggregateOps }).aggregate
const logger = createLogger('userService:referral')

// =====================================================================
// 类型定义（AuthLike / CloudEvent / CloudContext 抽至 common/types.ts）
// =====================================================================
import type { AuthLike, CloudEvent, CloudContext } from './common/types'

export type ReferralHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

export interface UserRecord {
  _id: string
  openid: string
  nickName?: string
  avatarUrl?: string
  inviterId?: string
  createdAt?: Date
  [k: string]: unknown
}

export interface InvitedUserView {
  _id: string
  nickName: string
  avatarUrl: string
  createdAt: Date
  orderCount: number
  totalSpent: string
}

export interface ReferralStatsResult {
  totalInvited: number
  consumingCount: number
  totalSpent: string
}

export interface InvitedUsersResult {
  list: InvitedUserView[]
  total: number
}

// L3 修复：统计改用服务端聚合（group），不再逐条 limit 累加，避免大流量 KOL 截断
interface AggRow {
  _id: string | null
  total?: number | string
  owners?: string[]
}

interface AggUserRow {
  _id: string | null
  count?: number
  total?: number | string
}

interface OwnerSummary {
  orderCount: number
  totalSpent: number
}

// =====================================================================
// 辅助函数
// =====================================================================

// =====================================================================
// Handler 实现
// =====================================================================

export async function getReferralStats(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  try {
    let user: UserRecord | null = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getReferralStats.users.fetch', {
        openid: maskOpenid(openid),
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }
    if (!user) { throw err('NOT_FOUND', '用户不存在') }

    // inviterId 现在存的是 openid，直接用 openid 查询
    const invitedUsersRes = await db.collection('users')
      .where({ inviterId: openid })
      .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
      .limit(500)
      .get()

    const invitedUsers = (invitedUsersRes.data || []) as UserRecord[]
    const totalInvited = invitedUsers.length

    const invitedOpenids = invitedUsers.map((u) => u._id).filter((id): id is string => Boolean(id))
    let consumingCount = 0
    let totalSpent = 0

      if (invitedOpenids.length > 0) {
        const spenderOpenids = new Set<string>()

        // L3 修复：原 5 个查询各 limit(1000) 累加，大流量 KOL 统计系统性偏低。
        //   改为服务端聚合（group + sum + addToSet），彻底消除截断。并行 Promise.all + 独立 .catch 容错（沿用 M5）。
        //   ⚠️ orders 集合真实字段是 orderType（非 type）；原 type/type:'mall' 过滤对所有文档恒匹配/恒不匹配，
        //      此处修正为 orderType，mall 桶统计才正确。tuan_orders 金额字段是 totalAmount（L4 修正，原取 totalPrice/price 恒为 0）。
        const [ordersAgg, mallAgg, feedAgg, tuanAgg, actAgg] = await Promise.all([
          db.collection('orders').aggregate()
            .match({ ownerId: _.in(invitedOpenids), status: 'completed', orderType: _.ne('mall') })
            .group({ _id: null, total: $.sum('$totalPrice'), owners: $.addToSet('$ownerId') })
            .end()
            .catch((e: unknown) => { logger.warn('getReferralStats.orders', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggRow[] } }),
          db.collection('orders').aggregate()
            .match({ ownerId: _.in(invitedOpenids), status: 'completed', orderType: 'mall' })
            .group({ _id: null, total: $.sum('$totalPrice'), owners: $.addToSet('$ownerId') })
            .end()
            .catch((e: unknown) => { logger.warn('getReferralStats.mall', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggRow[] } }),
          db.collection('feedingOrders').aggregate()
            .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
            .group({ _id: null, total: $.sum('$totalPrice'), owners: $.addToSet('$ownerId') })
            .end()
            .catch((e: unknown) => { logger.warn('getReferralStats.feedingOrders', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggRow[] } }),
          // L4 修正：tuan_orders 金额字段是 totalAmount（元），原 sumOrderTotal 取 totalPrice/price 恒为 0，团购消费从未计入
          db.collection('tuan_orders').aggregate()
            .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
            .group({ _id: null, total: $.sum('$totalAmount'), owners: $.addToSet('$ownerId') })
            .end()
            .catch((e: unknown) => { logger.warn('getReferralStats.tuan_orders', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggRow[] } }),
          db.collection('activity_registrations').aggregate()
            .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
            .group({ _id: null, total: $.sum('$totalPrice'), owners: $.addToSet('$ownerId') })
            .end()
            .catch((e: unknown) => { logger.warn('getReferralStats.activity_registrations', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggRow[] } }),
        ])

        const aggRows = [ordersAgg, mallAgg, feedAgg, tuanAgg, actAgg]
        for (const r of aggRows) {
          const row = (r.data || [])[0] as AggRow | undefined
          if (row) {
            totalSpent += Number(row.total) || 0
            ;(row.owners || []).forEach((o: string) => { if (o) { spenderOpenids.add(o) } })
          }
        }
        consumingCount = spenderOpenids.size
      }

    const result: ReferralStatsResult = {
      totalInvited,
      consumingCount,
      totalSpent: totalSpent.toFixed(2),
    }
    return handleSuccess(result)
  } catch (error) {
    logger.error('getReferralStats', error)
    return handleError(error, '获取带货统计失败', ERROR_CODES.DATA)
  }
}

export async function getInvitedUsers(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { page = 1, pageSize = 20 } = event
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  try {
    let user: UserRecord | null = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getInvitedUsers.users.fetch', {
        openid: maskOpenid(openid),
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }
    if (!user) { throw err('NOT_FOUND', '用户不存在') }

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

    const invitedUsers = (listRes.data || []) as UserRecord[]

    const invitedOpenids = invitedUsers.map((u) => u._id).filter((id): id is string => Boolean(id))
    const orderMap: Record<string, OwnerSummary> = {}

    if (invitedOpenids.length > 0) {
      // L3 修复：原 collectInto 逐条 limit(1000) 累加，大流量 KOL 的受邀用户订单被截断。
      //   改为按 ownerId 的 per-user 聚合（group + sum + count），彻底消除截断。
      //   orderType / tuan.totalAmount 字段修正同 getReferralStats（L3/L4）。
      const mergeAgg = (r: { data?: AggUserRow[] }): void => {
        ;(r.data || []).forEach((g) => {
          const key = g._id
          if (!key) { return }
          if (!orderMap[key]) { orderMap[key] = { orderCount: 0, totalSpent: 0 } }
          orderMap[key].orderCount += Number(g.count) || 0
          orderMap[key].totalSpent += Number(g.total) || 0
        })
      }

      const [ordersAgg, mallAgg, feedAgg, tuanAgg, actAgg] = await Promise.all([
        db.collection('orders').aggregate()
          .match({ ownerId: _.in(invitedOpenids), status: 'completed', orderType: _.ne('mall') })
          .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalPrice') })
          .end()
          .catch((e: unknown) => { logger.warn('getInvitedUsers.orders', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggUserRow[] } }),
        db.collection('orders').aggregate()
          .match({ ownerId: _.in(invitedOpenids), status: 'completed', orderType: 'mall' })
          .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalPrice') })
          .end()
          .catch((e: unknown) => { logger.warn('getInvitedUsers.mall', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggUserRow[] } }),
        db.collection('feedingOrders').aggregate()
          .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalPrice') })
          .end()
          .catch((e: unknown) => { logger.warn('getInvitedUsers.feedingOrders', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggUserRow[] } }),
        // L4 修正：tuan_orders 金额字段是 totalAmount（元）
        db.collection('tuan_orders').aggregate()
          .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalAmount') })
          .end()
          .catch((e: unknown) => { logger.warn('getInvitedUsers.tuan_orders', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggUserRow[] } }),
        db.collection('activity_registrations').aggregate()
          .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalPrice') })
          .end()
          .catch((e: unknown) => { logger.warn('getInvitedUsers.activity_registrations', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggUserRow[] } }),
      ])

      mergeAgg(ordersAgg)
      mergeAgg(mallAgg)
      mergeAgg(feedAgg)
      mergeAgg(tuanAgg)
      mergeAgg(actAgg)
    }

    const list: InvitedUserView[] = invitedUsers.map((u) => {
      const stats = orderMap[u._id] || { orderCount: 0, totalSpent: 0 }
      return {
        _id: u._id,
        nickName: u.nickName || '未知用户',
        avatarUrl: u.avatarUrl || '',
        createdAt: u.createdAt as Date,
        orderCount: stats.orderCount,
        totalSpent: stats.totalSpent.toFixed(2),
      }
    })

    const result: InvitedUsersResult = { list, total: countRes.total }
    return handleSuccess(result)
  } catch (error) {
    logger.error('getInvitedUsers', error)
    return handleError(error, '获取邀请用户失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  getReferralStats,
  getInvitedUsers,
}
_mod.exports.default = _mod.exports

export default {
  getReferralStats,
  getInvitedUsers,
}
