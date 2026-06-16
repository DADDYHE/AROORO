/**
 * referral.ts - 合作伙伴邀请统计服务（TypeScript 源文件 - Sprint 36 迁移）
 *
 * 业务功能：
 *   - 获取带货统计（getReferralStats）
 *   - 获取邀请用户列表（getMyInvitedUsers）
 *   - 获取带货订单（getReferralOrders）
 *   - 获取带货订单统计（getReferralOrderStats）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 统一统计函数（countAndSum）复用代码
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud()
const _ = db.command
const logger = createLogger('partnerService:referral')

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
  status?: string
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

export interface InvitedUser {
  _id: string
  nickName: string
  avatarUrl: string
  createdAt: Date
  orderCount?: number
  totalSpent?: number
}

export interface CommissionItem {
  _id: string
  orderNo: string
  orderType: string
  commissionAmount: number
  orderAmount: number
  status: string
  createdAt: Date
}

export interface ReferralStats {
  totalInvited: number
  consumingCount: number
  totalSpent: string
}

export interface ReferralOrderStats {
  totalOrders: number
  totalCommission: number
  pendingCommission: number
  settledCommission: number
}

interface OrderLike {
  ownerId?: string
  totalPrice?: number | string
  price?: number | string
  totalAmount?: number | string
  [k: string]: unknown
}

interface DbQueryResult {
  data?: OrderLike[]
}

// =====================================================================
// Handler 实现
// =====================================================================

/** 累加一组订单的数量和总金额 */
function countAndSum(res: DbQueryResult): { c: number; s: number } {
  let c = 0
  let s = 0
  ;(res.data || []).forEach((o) => {
    c++
    s += Number(o.totalPrice) || Number(o.totalAmount) || Number(o.price) || 0
  })
  return { c, s }
}

export async function getReferralStats(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  try {
    let user: unknown = null
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
    if (!user) {
      return handleSuccess({ totalInvited: 0, consumingCount: 0, totalSpent: '0.00' })
    }

    // inviterId 现在存的是 openid，直接用 openid 查询
    const invitedUsersRes = await db.collection('users')
      .where({ inviterId: openid })
      .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
      .get()

    const invitedUsers = (invitedUsersRes.data || []) as Array<{ _id?: string }>
    const totalInvited = invitedUsers.length

    const invitedOpenids = invitedUsers.map((u) => u._id).filter((id): id is string => Boolean(id))
    let consumingCount = 0
    let totalSpent = 0

    if (invitedOpenids.length > 0) {
      const spenderOpenids = new Set<string>()

      const [ordersRes, mallRes] = await Promise.all([
        db.collection('orders').where({ ownerId: _.in(invitedOpenids), status: 'completed' }).limit(1000).get(),
        db.collection('orders').where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' }).limit(1000).get(),
      ])

      ;(ordersRes.data || []).forEach((o: OrderLike) => {
        if (o.ownerId) { spenderOpenids.add(o.ownerId) }
        totalSpent += Number(o.totalPrice) || Number(o.price) || 0
      })
      ;(mallRes.data || []).forEach((o: OrderLike) => {
        if (o.ownerId) { spenderOpenids.add(o.ownerId) }
        totalSpent += Number(o.totalPrice) || Number(o.price) || 0
      })

      try {
        const feedRes = await db.collection('feedingOrders').where({ ownerId: _.in(invitedOpenids), status: 'completed' }).limit(1000).get()
        ;(feedRes.data || []).forEach((o: OrderLike) => {
          if (o.ownerId) { spenderOpenids.add(o.ownerId) }
          totalSpent += Number(o.totalPrice) || Number(o.price) || 0
        })
      } catch (e) {
        logger.warn('getReferralStats.feedingOrders', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
        })
      }

      try {
        const tuanRes = await db.collection('tuan_orders').where({ ownerId: _.in(invitedOpenids), status: 'completed' }).limit(1000).get()
        ;(tuanRes.data || []).forEach((o: OrderLike) => {
          if (o.ownerId) { spenderOpenids.add(o.ownerId) }
          totalSpent += Number(o.totalPrice) || Number(o.price) || 0
        })
      } catch (e) {
        logger.warn('getReferralStats.tuan_orders', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
        })
      }

      try {
        const actRes = await db.collection('activity_registrations').where({ ownerId: _.in(invitedOpenids), status: 'completed' }).limit(1000).get()
        ;(actRes.data || []).forEach((o: OrderLike) => {
          if (o.ownerId) { spenderOpenids.add(o.ownerId) }
          totalSpent += Number(o.totalPrice) || Number(o.price) || 0
        })
      } catch (e) {
        logger.warn('getReferralStats.activity_registrations', {
          openid,
          code: (e as { errCode?: unknown }).errCode,
          msg: (e as Error).message,
        })
      }

      consumingCount = spenderOpenids.size
    }

    return handleSuccess({ totalInvited, consumingCount, totalSpent: totalSpent.toFixed(2) })
  } catch (error) {
    logger.error('getReferralStats', error)
    return handleError(error, '获取带货统计失败', ERROR_CODES.DATA)
  }
}

export async function getMyInvitedUsers(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { page = 1, pageSize = 20 } = event

  try {
    let user: unknown = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getMyInvitedUsers.users.fetch', {
        openid,
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }
    if (!user) {
      return handleSuccess({ list: [], total: 0 })
    }

    // inviterId 现在存的是 openid，直接用 openid 查询
    const countRes = await db.collection('users').where({ inviterId: openid }).count()
    const total = countRes.total || 0

    const invitedRes = await db.collection('users')
      .where({ inviterId: openid })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .field({ nickName: true, avatarUrl: true, createdAt: true })
      .get()

    const invitedList: InvitedUser[] = []
    for (const u of (invitedRes.data || []) as Array<InvitedUser & { _id: string }>) {
      let orderCount = 0
      let totalSpent = 0

      try {
        const [mallRes, feedingRes, tuanRes, activityRes, boardingRes] = await Promise.all([
          db.collection('orders').where({ ownerId: u._id, type: 'mall', status: _.in(['paid', 'shipped', 'completed']) }).get(),
          db.collection('feedingOrders').where({ ownerId: u._id, status: 'completed' }).get(),
          db.collection('tuan_orders').where({ ownerId: u._id, status: _.in(['paid', 'completed']) }).get(),
          db.collection('activity_registrations').where({ ownerId: u._id, status: 'confirmed' }).get(),
          db.collection('orders').where({ ownerId: u._id, status: 'completed', type: 'boarding' }).get(),
        ])

        const mall = countAndSum(mallRes)
        const feeding = countAndSum(feedingRes)
        const tuan = countAndSum(tuanRes)
        const activity = countAndSum(activityRes)
        const boarding = countAndSum(boardingRes)

        orderCount = mall.c + feeding.c + tuan.c + activity.c + boarding.c
        totalSpent = mall.s + feeding.s + tuan.s + activity.s + boarding.s
      } catch (e) {
        logger.warn('getMyInvitedUsers.consume', { msg: (e as Error).message })
      }

      invitedList.push({
        _id: u._id,
        nickName: u.nickName || '',
        avatarUrl: u.avatarUrl || '',
        createdAt: u.createdAt,
        orderCount,
        totalSpent: Math.round(totalSpent * 100) / 100,
      })
    }

    return handleSuccess({ list: invitedList, total })
  } catch (error) {
    logger.error('getMyInvitedUsers', error)
    return handleError(error, '获取带货用户失败', ERROR_CODES.DATA)
  }
}

export async function getReferralOrders(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { type = 'all', status, page = 1, pageSize = 20 } = event

  try {
    let user: unknown = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getReferralOrders.users.fetch', {
        openid,
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }
    if (!user) {
      return handleSuccess({ list: [], total: 0 })
    }

    // inviterId 现在存的是 openid，直接用 openid 查询 tuan_commissions
    const where: Record<string, unknown> = { inviterId: openid, status: _.neq('cancelled') }
    if (type && type !== 'all') { where.orderType = type }
    if (status) { where.status = status }

    const countRes = await db.collection('tuan_commissions').where(where).count()
    const total = countRes.total || 0

    const res = await db.collection('tuan_commissions')
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    const list: CommissionItem[] = ((res.data || []) as Array<Record<string, unknown>>).map((c) => ({
      _id: (c._id as string) || '',
      orderNo: (c.orderNo as string) || '',
      orderType: (c.orderType as string) || '',
      commissionAmount: Number(c.commissionAmount) || 0,
      orderAmount: Number(c.orderAmount) || 0,
      status: (c.status as string) || 'pending',
      createdAt: c.createdAt as Date,
    }))

    return handleSuccess({ list, total })
  } catch (error) {
    logger.error('getReferralOrders', error)
    return handleError(error, '获取带货订单失败', ERROR_CODES.DATA)
  }
}

export async function getReferralOrderStats(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { type = 'all' } = event

  try {
    let user: unknown = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getReferralOrderStats.users.fetch', {
        openid,
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }
    if (!user) {
      return handleSuccess({ totalOrders: 0, totalCommission: 0, pendingCommission: 0, settledCommission: 0 })
    }

    // inviterId 现在存的是 openid，直接用 openid 查询 tuan_commissions
    const where: Record<string, unknown> = { inviterId: openid }
    if (type && type !== 'all') { where.orderType = type }

    const res = await db.collection('tuan_commissions').where(where).get()

    let totalOrders = 0
    let totalCommission = 0
    let pendingCommission = 0
    let settledCommission = 0
    ;((res.data || []) as Array<Record<string, unknown>>).forEach((c) => {
      totalOrders++
      const amt = Number(c.commissionAmount) || 0
      totalCommission += amt
      if (c.status === 'pending') { pendingCommission += amt }
      if (c.status === 'settled') { settledCommission += amt }
    })

    return handleSuccess({ totalOrders, totalCommission, pendingCommission, settledCommission })
  } catch (error) {
    logger.error('getReferralOrderStats', error)
    return handleError(error, '获取带货统计失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  getReferralStats,
  getMyInvitedUsers,
  getReferralOrders,
  getReferralOrderStats,
}
_mod.exports.default = _mod.exports

export default {
  getReferralStats,
  getMyInvitedUsers,
  getReferralOrders,
  getReferralOrderStats,
}
