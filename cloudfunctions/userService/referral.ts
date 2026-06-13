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
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud()
const _ = db.command
const logger = createLogger('userService:referral')

// =====================================================================
// 类型定义
// =====================================================================

export interface AuthLike {
  openid?: string
  [k: string]: unknown
}

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  page?: number
  pageSize?: number
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

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

interface OrderLike {
  ownerId?: string
  totalPrice?: number | string
  price?: number | string
  [k: string]: unknown
}

interface OwnerSummary {
  orderCount: number
  totalSpent: number
}

// =====================================================================
// 辅助函数
// =====================================================================

function sumOrderTotal(orders: OrderLike[]): number {
  let total = 0
  orders.forEach((o) => {
    total += Number(o.totalPrice) || Number(o.price) || 0
  })
  return total
}

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
        openid,
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }
    if (!user) { throw err('NOT_FOUND', '用户不存在') }

    // inviterId 现在存的是 openid，直接用 openid 查询
    const invitedUsersRes = await db.collection('users')
      .where({ inviterId: openid })
      .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
      .get()

    const invitedUsers = (invitedUsersRes.data || []) as UserRecord[]
    const totalInvited = invitedUsers.length

    const invitedOpenids = invitedUsers.map((u) => u._id).filter((id): id is string => Boolean(id))
    let consumingCount = 0
    let totalSpent = 0

    if (invitedOpenids.length > 0) {
      const spenderOpenids = new Set<string>()

      // 查询非 mall 类型的已完成订单（mall 类型单独查询，避免重复计算）
      const ordersRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), status: 'completed', type: _.ne('mall') })
        .limit(1000)
        .get()
      ;(ordersRes.data || []).forEach((o: OrderLike) => {
        if (o.ownerId) { spenderOpenids.add(o.ownerId) }
      })
      totalSpent += sumOrderTotal((ordersRes.data || []) as OrderLike[])

      const mallRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' })
        .limit(1000)
        .get()
      ;(mallRes.data || []).forEach((o: OrderLike) => {
        if (o.ownerId) { spenderOpenids.add(o.ownerId) }
      })
      totalSpent += sumOrderTotal((mallRes.data || []) as OrderLike[])

      try {
        const feedRes = await db.collection('feedingOrders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(feedRes.data || []).forEach((o: OrderLike) => {
          if (o.ownerId) { spenderOpenids.add(o.ownerId) }
        })
        totalSpent += sumOrderTotal((feedRes.data || []) as OrderLike[])
      } catch (e) {
        logger.warn('getReferralStats.feedingOrders', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
        })
      }

      try {
        const tuanRes = await db.collection('tuan_orders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(tuanRes.data || []).forEach((o: OrderLike) => {
          if (o.ownerId) { spenderOpenids.add(o.ownerId) }
        })
        totalSpent += sumOrderTotal((tuanRes.data || []) as OrderLike[])
      } catch (e) {
        logger.warn('getReferralStats.tuan_orders', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
        })
      }

      try {
        const actRes = await db.collection('activity_registrations')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        ;(actRes.data || []).forEach((o: OrderLike) => {
          if (o.ownerId) { spenderOpenids.add(o.ownerId) }
        })
        totalSpent += sumOrderTotal((actRes.data || []) as OrderLike[])
      } catch (e) {
        logger.warn('getReferralStats.activity_registrations', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
        })
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
        openid,
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
      const collectInto = (orders: OrderLike[]): void => {
        orders.forEach((o) => {
          const key = o.ownerId
          if (!key) { return }
          if (!orderMap[key]) { orderMap[key] = { orderCount: 0, totalSpent: 0 } }
          orderMap[key].orderCount += 1
          orderMap[key].totalSpent += Number(o.totalPrice) || Number(o.price) || 0
        })
      }

      // 查询非 mall 类型的已完成订单（mall 类型单独查询，避免重复计算）
      const ordersRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), status: 'completed', type: _.ne('mall') })
        .limit(1000)
        .get()
      collectInto((ordersRes.data || []) as OrderLike[])

      const mallRes = await db.collection('orders')
        .where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' })
        .limit(1000)
        .get()
      collectInto((mallRes.data || []) as OrderLike[])

      try {
        const feedRes = await db.collection('feedingOrders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        collectInto((feedRes.data || []) as OrderLike[])
      } catch (e) {
        logger.warn('getInvitedUsers.feedingOrders', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
        })
      }

      try {
        const tuanRes = await db.collection('tuan_orders')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        collectInto((tuanRes.data || []) as OrderLike[])
      } catch (e) {
        logger.warn('getInvitedUsers.tuan_orders', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
        })
      }

      try {
        const actRes = await db.collection('activity_registrations')
          .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
          .limit(1000)
          .get()
        collectInto((actRes.data || []) as OrderLike[])
      } catch (e) {
        logger.warn('getInvitedUsers.activity_registrations', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
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
