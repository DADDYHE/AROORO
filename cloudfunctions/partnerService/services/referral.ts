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
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   users: { inviterId: 1 }                                  - 覆盖 getReferralStats/getMyInvitedUsers 邀请人查询
 *   commissions: { inviterId: 1, status: 1, createdAt: -1 } - 覆盖 getReferralOrders/Stats
 *   orders: { ownerId: 1, status: 1, type: 1 }               - 覆盖 getReferralStats 邀请用户消费查询
 *   feedingOrders: { ownerId: 1, status: 1 }                 - 覆盖 feeding 消费查询
 *   tuan_orders: { ownerId: 1, status: 1 }                   - 覆盖 tuan 消费查询
 *   activity_registrations: { ownerId: 1, status: 1 }        - 覆盖 activity 消费查询
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('../common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud()
const _ = db.command
const logger = createLogger('partnerService:referral')

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

/** 文档金额解析（内存累加用）：totalAmount || totalPrice || price */
function resolveOrderAmount(o: { totalAmount?: number; totalPrice?: number; price?: number }): number {
  return Number(o.totalAmount) || Number(o.totalPrice) || Number(o.price) || 0
}

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
  // M6: 显式声明 nickName 字段（硬约束 #40）
  nickName?: string
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

// =====================================================================
// Handler 实现
// =====================================================================


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
    // M8: 用 count() 替代 limit(500).get().length，避免超过 500 时漏统计
    const countRes = await db.collection('users').where({ inviterId: openid }).count()
    const totalInvited = countRes.total || 0

    if (totalInvited === 0) {
      return handleSuccess({ totalInvited: 0, consumingCount: 0, totalSpent: '0.00' })
    }

    // M2+M8: 改用 aggregate 在数据库侧统计，避免 limit(1000) 静默截断
    //   优化前：5 次 limit(1000).get() + 内存累加，超过 1000 单时数据偏低
    //   优化后：5 次 aggregate sum，无截断风险，DB 侧完成计算
    const $ = _.aggregate
    const sumAggregate = async (collection: string, match: Record<string, unknown>): Promise<{ count: number; sum: number; openids: Set<string> }> => {
      try {
        const aggRes = await db.collection(collection)
          .aggregate()
          .match(match)
          .group({
            _id: null,
            total: $.sum(amountExpr()),
            count: $.sum(1),
            owners: ($ as any).addToSet('$ownerId'),
          })
          .end()
        if (aggRes.list && aggRes.list.length > 0) {
          const r = aggRes.list[0] as { total?: number; count?: number; owners?: string[] }
          // F10 修复：原 limit(5000).get() 拉订单列表再 build Set，头部 KOL(消费>5000单) 的 consumingCount 系统性低估。
          //   改为服务端 addToSet('$ownerId') 聚合，彻底消除截断。
          const openids = new Set<string>()
          ;(r.owners || []).forEach((id) => { if (id) { openids.add(id) } })
          return { count: Number(r.count) || 0, sum: Number(r.total) || 0, openids }
        }
      } catch (e) {
        logger.warn(`getReferralStats.${collection}.aggregate`, {
          openid, msg: (e as Error).message,
        })
      }
      return { count: 0, sum: 0, openids: new Set<string>() }
    }

    const spenderOpenids = new Set<string>()
    let totalSpent = 0

    // M2: 一次性查询所有被邀请人 openids，避免重复查询
    const invitedOpenids = await getInvitedOpenids(openid || '')
    if (invitedOpenids.length === 0) {
      return handleSuccess({ totalInvited, consumingCount: 0, totalSpent: '0.00' })
    }

    // 统一口径（2026-08-04 治理）：每个板块只从一个权威集合取数，
    //   团购从 orders.type='group_buy'（不再双查 tuan_orders），
    //   状态=已支付且未取消，金额 totalAmount || totalPrice || price。
    for (const board of REFERRAL_BOARDS) {
      const agg = await sumAggregate(board.collection, { ownerId: _.in(invitedOpenids), status: _.in(board.statuses), ...board.where })
      totalSpent += agg.sum
      agg.openids.forEach(id => spenderOpenids.add(id))
    }

    const consumingCount = spenderOpenids.size

    return handleSuccess({ totalInvited, consumingCount, totalSpent: totalSpent.toFixed(2) })
  } catch (error) {
    logger.error('getReferralStats', error)
    return handleError(error, '获取带货统计失败', ERROR_CODES.DATA)
  }
}

// M2: 缓存当前用户的被邀请人 openids 列表（同一次请求内复用）
// F10 修复：原 limit(5000) 截断，受邀>5000 的头部 KOL 其受邀 openid 列表被截断，连带 consumingCount/totalSpent 低估。
//   改为游标分页拉全量。
async function getInvitedOpenids(inviterId: string): Promise<string[]> {
  const ids: string[] = []
  let skip = 0
  const BATCH = 500
  while (true) {
    const res = await db.collection('users')
      .where({ inviterId })
      .field({ _id: true })
      .skip(skip)
      .limit(BATCH)
      .get()
    const batch = (res.data || []).map((u: { _id?: string }) => u._id).filter((id: string | undefined): id is string => Boolean(id))
    ids.push(...batch)
    if (batch.length < BATCH) { break }
    skip += BATCH
  }
  return ids
}

export async function getMyInvitedUsers(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  // M9: 分页参数边界校验——page >= 1，pageSize 范围 [1, 100]
  //   原：未限制上限，传入 pageSize=9999 会拉取全表数据
  //   原：page=0 / -1 会导致 skip 负数（CloudBase 会按 0 处理，但行为不明确）
  const page = Math.max(1, Math.floor(Number(event.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(event.pageSize) || 20)))

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

    const invitedUsers = (invitedRes.data || []) as Array<InvitedUser & { _id: string }>
    // M2: 批量查询——一次性拉取所有被邀请用户的订单，按 ownerId 分组在内存累加
    //   优化前：N 个用户 × 5 次 DB 查询 = 100 次（N=20）
    //   优化后：5 次 DB 查询（用 _.in() 批量查所有用户）
    const invitedOpenids = invitedUsers.map(u => u._id).filter(Boolean)
    const statsByUser = new Map<string, { orderCount: number; totalSpent: number }>()

    if (invitedOpenids.length > 0) {
      // 统一口径（2026-08-04 治理）：每个板块只从一个权威集合取数，
      //   团购从 orders.type='group_buy'（不再双查 tuan_orders），
      //   状态=已支付且未取消，金额 totalAmount || totalPrice || price。
      for (const board of REFERRAL_BOARDS) {
        const where = { ownerId: _.in(invitedOpenids), status: _.in(board.statuses), ...board.where }
        const res = await db.collection(board.collection).where(where).limit(5000).get()
          .catch((e: unknown) => { logger.warn(`getMyInvitedUsers.${board.type}`, { msg: (e as Error).message }); return { data: [] as OrderLike[] } })
        for (const o of (res.data || [])) {
          if (!o.ownerId) continue
          const s = statsByUser.get(o.ownerId) || { orderCount: 0, totalSpent: 0 }
          s.orderCount++
          s.totalSpent += resolveOrderAmount(o)
          statsByUser.set(o.ownerId, s)
        }
      }
    }

    const invitedList: InvitedUser[] = invitedUsers.map((u) => {
      const s = statsByUser.get(u._id) || { orderCount: 0, totalSpent: 0 }
      return {
        _id: u._id,
        nickName: u.nickName || '',
        avatarUrl: u.avatarUrl || '',
        createdAt: u.createdAt,
        orderCount: s.orderCount,
        totalSpent: Math.round(s.totalSpent * 100) / 100,
      }
    })

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
  // M9: 参数白名单与范围校验
  //   type: 业务支持的 orderType（tuan/mall 等）+ 'all' 全部
  //   status: 限制为业务有效状态，避免任意字符串注入
  //   page/pageSize: 与 getMyInvitedUsers 一致的边界
  // 佣金为全类型（团购/商城/活动/寄养/服务），白名单须覆盖全部 orderType。
  // 寄养佣金历史上存在 'hosting'（hosting.js 完成路径）与 'boarding'（orderService 完成路径）双值，
  // 两个键都放行，并在下方统一映射为 _.in(['hosting','boarding']) 查询，兼容历史数据。
  const ALLOWED_TYPES = ['all', 'tuan', 'mall', 'activity', 'hosting', 'boarding', 'feeding']
  const ALLOWED_STATUSES = ['pending', 'settled', 'cancelled']
  const type = typeof event.type === 'string' && ALLOWED_TYPES.includes(event.type) ? event.type : 'all'
  const status = typeof event.status === 'string' && ALLOWED_STATUSES.includes(event.status) ? event.status : null
  const page = Math.max(1, Math.floor(Number(event.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(event.pageSize) || 20)))

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

    // inviterId 现在存的是 openid，直接用 openid 查询 commissions
    // M9: status 逻辑冲突修复——原代码同时设置 status: _.neq('cancelled') 与 status: event.status
    //   会导致 where.status 字段被覆盖，最终行为不确定（取决于 CloudBase 实现）
    //   新逻辑：未传 status 时默认排除 cancelled；传 status 时按用户指定值精确查询
    const where: Record<string, unknown> = { inviterId: openid }
    // 寄养佣金双值归一：hosting / boarding 都映射为同一查询
    if (type !== 'all') { where.orderType = (type === 'hosting' || type === 'boarding') ? _.in(['hosting', 'boarding']) : type }
    if (status) {
      where.status = status
    } else {
      where.status = _.neq('cancelled')
    }

    const countRes = await db.collection('commissions').where(where).count()
    const total = countRes.total || 0

    const res = await db.collection('commissions')
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
  // 佣金为全类型，白名单覆盖全部 orderType（寄养 hosting/boarding 双值均放行，见下方归一）
  const ALLOWED_TYPES = ['all', 'tuan', 'mall', 'activity', 'hosting', 'boarding', 'feeding']
  const rawType = typeof event.type === 'string' ? event.type : 'all'
  if (!ALLOWED_TYPES.includes(rawType)) {
    throw err('INVALID_PARAMS', `无效的 type，仅支持：${ALLOWED_TYPES.join(', ')}`)
  }
  const type = rawType

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

    // inviterId 现在存的是 openid，直接用 openid 查询 commissions
    const where: Record<string, unknown> = { inviterId: openid }
    // 寄养佣金双值归一：hosting / boarding 都映射为同一查询
    if (type !== 'all') { where.orderType = (type === 'hosting' || type === 'boarding') ? _.in(['hosting', 'boarding']) : type }

    // M2: 改用 aggregate 在数据库侧统计，避免全量 get() 导致的 OOM 风险
    //   原：db.collection().where().get() 后内存累加（无 limit，大数据集会 OOM）
    //   新：3 次 aggregate（按 status 分组），DB 侧完成计算
    //   参考 getReferralStats 中的 sumAggregate 模式
    const $ = _.aggregate
    const statsByStatus = async (statusFilter: Record<string, unknown>): Promise<{ count: number; sum: number }> => {
      try {
        const aggRes = await db.collection('commissions')
          .aggregate()
          .match({ ...where, ...statusFilter })
          .group({ _id: null, total: $.sum('$commissionAmount'), count: $.sum(1) })
          .end()
        if (aggRes.list && aggRes.list.length > 0) {
          const r = aggRes.list[0] as { total?: number; count?: number }
          return { count: Number(r.count) || 0, sum: Number(r.total) || 0 }
        }
      } catch (e) {
        logger.warn('getReferralOrderStats.aggregate', {
          openid, msg: (e as Error).message,
        })
      }
      return { count: 0, sum: 0 }
    }

    // status 白名单排除 cancelled/reversed（退款冲销的佣金不再计入统计）
    const [allAgg, pendingAgg, settledAgg] = await Promise.all([
      statsByStatus({ status: _.in(['pending', 'settled']) }),
      statsByStatus({ status: 'pending' }),
      statsByStatus({ status: 'settled' }),
    ])

    return handleSuccess({
      totalOrders: allAgg.count,
      totalCommission: allAgg.sum,
      pendingCommission: pendingAgg.sum,
      settledCommission: settledAgg.sum,
    })
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
