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
  sum: (field: number | string | Record<string, unknown>) => unknown
  addToSet: (field: string) => unknown
}
const $ = (db.command as { aggregate: AggregateOps }).aggregate
const logger = createLogger('userService:referral')

// 推广/邀请统计统一口径（2026-08-04 治理）：
//   - 每个板块只从一个权威集合取数：商城/寄养/团购从 orders（按 type 区分），
//     上门喂养从 feedingOrders，活动从 activity_registrations（镜像单不重复计）
//   - 状态集 = 已支付且未取消；金额统一按 totalAmount || totalPrice || price 解析
const REFERRAL_BOARDS = [
  { type: 'mall', collection: 'orders', where: { type: 'mall' }, statuses: ['paid', 'shipped', 'completed'] },
  { type: 'boarding', collection: 'orders', where: { type: 'boarding' }, statuses: ['paid', 'confirmed', 'in_progress', 'completed'] },
  { type: 'tuan', collection: 'orders', where: { type: 'group_buy' }, statuses: ['paid', 'shipped', 'completed'] },
  { type: 'feeding', collection: 'feedingOrders', where: {}, statuses: ['paid', 'confirmed', 'in_progress', 'completed'] },
  { type: 'activity', collection: 'activity_registrations', where: {}, statuses: ['confirmed'] },
] as const

/** 聚合金额表达式：totalAmount || totalPrice || price */
function amountExpr(): Record<string, unknown> {
  return { $ifNull: ['$totalAmount', { $ifNull: ['$totalPrice', { $ifNull: ['$price', 0] }] }] }
}

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

    // F10 修复：原 limit(500).get() 再取 .length / .map，头部 KOL（受邀>500）统计系统性低估。
    //   改为游标分页拉全量受邀 openid（避免大 limit 截断），totalInvited 用全量长度。
    const invitedOpenids: string[] = []
    let invitedSkip = 0
    const INVITE_BATCH = 500
    while (true) {
      const res = await db.collection('users')
        .where({ inviterId: openid })
        .field({ _id: true })
        .skip(invitedSkip)
        .limit(INVITE_BATCH)
        .get()
      const batch = (res.data || []).map((u: { _id?: string }) => u._id).filter((id: string | undefined): id is string => Boolean(id))
      invitedOpenids.push(...batch)
      if (batch.length < INVITE_BATCH) { break }
      invitedSkip += INVITE_BATCH
    }
    const totalInvited = invitedOpenids.length
    let consumingCount = 0
    let totalSpent = 0

      if (invitedOpenids.length > 0) {
        const spenderOpenids = new Set<string>()

        // 统一口径（2026-08-04 治理）：每个板块只从一个权威集合取数，
        //   团购从 orders.type='group_buy'（不再双查 tuan_orders），
        //   状态=已支付且未取消，金额 totalAmount || totalPrice || price。
        for (const board of REFERRAL_BOARDS) {
          const agg = await db.collection(board.collection).aggregate()
            .match({ ownerId: _.in(invitedOpenids), status: _.in(board.statuses), ...board.where })
            .group({ _id: null, total: $.sum(amountExpr()), owners: $.addToSet('$ownerId') })
            .end()
            .catch((e: unknown) => { logger.warn(`getReferralStats.${board.type}`, { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggRow[] } })
          const row = (agg.data || [])[0] as AggRow | undefined
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
      // 统一口径（2026-08-04 治理）：每个板块只从一个权威集合取数，
      //   团购从 orders.type='group_buy'（不再双查 tuan_orders），
      //   状态=已支付且未取消，金额 totalAmount || totalPrice || price。
      for (const board of REFERRAL_BOARDS) {
        const agg = await db.collection(board.collection).aggregate()
          .match({ ownerId: _.in(invitedOpenids), status: _.in(board.statuses), ...board.where })
          .group({ _id: '$ownerId', count: $.sum(1), total: $.sum(amountExpr()) })
          .end()
          .catch((e: unknown) => { logger.warn(`getInvitedUsers.${board.type}`, { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode }); return { data: [] as AggUserRow[] } })
        ;(agg.data || []).forEach((g: AggUserRow) => {
          const key = g._id
          if (!key) { return }
          if (!orderMap[key]) { orderMap[key] = { orderCount: 0, totalSpent: 0 } }
          orderMap[key].orderCount += Number(g.count) || 0
          orderMap[key].totalSpent += Number(g.total) || 0
        })
      }
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
