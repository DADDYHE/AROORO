/**
 * orderService/orders.ts - 订单服务（TypeScript 源文件 - Sprint 28 迁移）
 *
 * 业务功能（14 个 handler + 7 个内部 helper）：
 *   1. getOrders                  订单列表（owner / host 双视角）
 *   2. enrichOrders               订单冗余信息补全（pets / host）
 *   3. createOrder                创建订单（含风控限流 + 价格计算）
 *   4. updateOrderStatus          状态机推进（pending → paid → confirmed → ...）
 *   5. getActivityOrders          活动订单列表
 *   6. getActivityOrderDetail     活动订单详情
 *   7. cancelOrder                取消订单（= updateOrderStatus('cancelled')）
 *   8. getOrderDetail             订单详情（含冗余信息）
 *   9. calculatePrice             价格计算（公开）
 *  10. checkDateAvailability      日期可用性（公开）
 *  11. getBoardingOrders          合作伙伴视角的寄养订单
 *  12. getBoardingOrderDetail     合作伙伴订单详情
 *  13. handleBoardingOrder        合作伙伴操作（状态机 + 佣金）
 *  14. submitEvaluation           评价提交（含风控）
 *     getHostEvaluations          寄养家庭评价列表（公开）
 *
 * 关键设计：
 *   - 鉴权：所有 handler 都需 auth（除 calculatePrice / checkDateAvailability / getHostEvaluations 公开）
 *   - 错误：使用 err() 工厂（参数校验），withErrorHandling 包装（统一响应）
 *   - 业务错误：isBusinessError 类型守卫（替代裸字符串 e.code === 'X'）
 *   - 限流：withRateLimit（order / evaluation 类型）
 *   - 风控：detectReviewSpam + mapActionToErrorCode
 *   - 状态机：allowedTransitions 表 + boarding-state-machine（合作伙伴）
 *
 * 迁移目标：
 *   - 强类型化 14 个 handler 的 event / context / auth
 *   - 强类型化订单 / 用户 / 寄养家庭 / 宠物 / 评价文档（复用 common/types）
 *   - 编译产物（orders.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 */

// Sprint 28 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/orderService/orders.js）
//   - 对 .js 文件（utils / errors / risk-control / risk-rate-limit / normalize / boarding-state-machine）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - handler 在 module.exports 时统一用 withErrorHandling 包装

import { initCloud, handleSuccess, generateId, paginate, type PaginatedResult } from '../common/utils'
import { createLogger, type ServiceLogger } from '../common/logger'
import type {
  CloudBaseDB,
  CloudBaseQuery,
  OrderDoc,
  OrderStatus,
  OrderType,
  UserDoc,
  HostProfileDoc,
  EvaluationDoc,
  ApiResponse,
  Logger,
} from '../common/types'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, withErrorHandling } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectReviewSpam, mapActionToErrorCode } = require('./common/risk-control')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('../common/risk-rate-limit')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeDbError } = require('../common/normalize')

// =====================================================================
// 类型定义
// =====================================================================

/** 通用 handler 签名（event / context / auth） */
type AuthLike = { openid?: string, [k: string]: unknown }
type EventLike = Record<string, unknown>
type ContextLike = Record<string, unknown>
type HandlerResult = Promise<ApiResponse<unknown> | unknown>
type WrappedHandler<T = unknown> = (event: EventLike, context: ContextLike, auth: AuthLike | null) => Promise<ApiResponse<T>>

/** 订单状态机允许的转换 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'confirmed', 'cancelled'],
  paid: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'ongoing', 'cancelled', 'completed'],
  in_progress: ['completed', 'cancelled'],
  ongoing: ['completed'],
  completed: [],
  cancelled: [],
}

/** 状态中文映射（订单状态通知） */
const STATUS_TEXT_MAP: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  ongoing: '寄养中',
  in_progress: '寄养中',
  completed: '已结束',
  cancelled: '已取消',
}

/** 寄养家庭档案敏感字段（不写入订单文档） */
const SENSITIVE_HOST_FIELDS = [
  'idCard', 'idCardFront', 'idCardBack', 'healthCertificate', 'emergencyContactPhone',
] as const

/** 日期范围预设 */
type DateRangePreset = 'today' | 'week' | 'month' | 'last_month' | 'default'

/** 合作伙伴权限类型 */
type PartnerPermission = 'hosting' | string

/** 内部增强订单（包含 pets / hostName / hostAvatar） */
interface EnrichedOrder extends OrderDoc {
  pets?: UserDoc[]
  hostName?: string
  hostAvatar?: string
  ownerName?: string
  ownerPhone?: string
  hostPhone?: string
  notes?: string
  price?: number
  days?: number
  // 运行时可能存在的冗余信息字段
  petsInfo?: unknown[]
  hostInfo?: Record<string, unknown>
  ownerInfo?: Record<string, unknown>
  orderNo?: string
  // 索引签名：与 OrderDoc 索引签名兼容 + 接收运行时额外字段
  [k: string]: unknown
}

/** 内部合作伙伴订单（额外字段） */
interface EnrichedBoardingOrder extends EnrichedOrder {
  buyerNickName?: string
  productName?: string
  totalAmount?: number
}

/** 通知文档（最小子集） */
interface NotificationPayload {
  type: 'order_status_change'
  orderId: string
  status: string
  statusText: string
  ownerId: string
  isRead: boolean
  createdAt: Date
}

// =====================================================================
// 模块初始化
// =====================================================================

const { db } = initCloud() as { cloud: unknown, db: CloudBaseDB }
const _ = (db as CloudBaseDB & { command: unknown }).command
const logger: ServiceLogger = createLogger('orderService')

// =====================================================================
// 内部辅助
// =====================================================================

/** 计算日期范围（today / week / month / last_month / default） */
function getDateRange(range: DateRangePreset | string): { startDate: Date | null, endDate: Date | null } {
  const now = new Date()
  let startDate: Date | null = null
  let endDate: Date | null = null
  switch (range) {
  case 'today':
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    break
  case 'week': {
    const dayOfWeek = now.getDay()
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
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  }
  return { startDate, endDate }
}

/** 内部：检查日期是否可用（精确版） */
async function checkDateAvailabilityInternal(hostId: string, startDate: string, endDate: string): Promise<boolean> {
  try {
    const existingOrders = await db.collection('orders')
      .where({
        hostId,
        status: (db.command as { in: (arr: string[]) => unknown }).in(['confirmed', 'ongoing']),
      })
      .field({ startDate: true, endDate: true })
      .limit(100)
      .get()
    return existingOrders.data.length === 0
  } catch (error: unknown) {
    logger.error('_checkDateAvailability', { msg: (error as Error)?.message })
    return false
  }
}

/** 内部：发送订单状态变更通知（双端：owner + organizer） */
async function sendOrderNotification(orderId: string, status: string): Promise<void> {
  try {
    const order = await db.collection('orders').doc(orderId).get()
    if (!order.data) {return}

    const notification: NotificationPayload = {
      type: 'order_status_change',
      orderId,
      status,
      statusText: STATUS_TEXT_MAP[status] || status,
      ownerId: '',
      isRead: false,
      createdAt: db.serverDate(),
    }

    await db.collection('notifications').add({
      data: { ...notification, ownerId: (order.data as { ownerId: string }).ownerId, isRead: false },
    })
    await db.collection('notifications').add({
      data: { ...notification, ownerId: (order.data as { organizerId: string }).organizerId, isRead: false },
    })
  } catch (error: unknown) {
    logger.error('_sendOrderNotification', { msg: (error as Error)?.message })
  }
}

/** 内部：检查合作伙伴权限（admins 集合） */
async function checkPartnerPermission(openid: string, permission: PartnerPermission): Promise<AdminDoc> {
  const adminRes = await db.collection('admins')
    .where({ _id: openid, status: 'active' })
    .limit(1)
    .get()
  if (!adminRes.data || adminRes.data.length === 0) {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }
  const admin = adminRes.data[0] as AdminDoc
  const roles = admin.roles || []
  if (roles.includes('super_admin')) {return admin}
  const perms = admin.permissions || []
  if (!perms.includes(permission)) {
    throw err('PERMISSION_DENIED', `权限不足：需要 ${permission} 权限`)
  }
  return admin
}

interface AdminDoc {
  _id: string
  openid: string
  status: 'active' | 'disabled' | 'pending'
  roles?: string[]
  permissions?: string[]
}

/** 内部：创建佣金记录（best-effort） */
async function createCommissionRecordInternal(orderType: string, order: OrderDoc | Record<string, unknown>): Promise<void> {
  try {
    const o = order as { ownerId?: string, totalAmount?: number, totalPrice?: number, basicPrice?: number, orderNo?: string, _id?: string }
    if (!o.ownerId) {return}

    let user: { _id: string, inviterId?: string } | null = null
    try {
      const userRes = await db.collection('users').doc(o.ownerId).field({ _id: true, inviterId: true }).get()
      user = userRes.data
    } catch (e) { return }
    if (!user || !user.inviterId) {return}

    let config: Record<string, unknown> = {}
    try {
      const configRes = await db.collection('system_config').doc('commission_rates').get()
      config = (configRes.data || {}) as Record<string, unknown>
    } catch (e) { return }

    const rate = config[orderType] !== undefined ? Number(config[orderType]) : 0
    if (!rate || rate <= 0) {return}

    const orderAmount = Number(o.totalAmount || o.totalPrice || o.basicPrice || 0)
    if (orderAmount <= 0) {return}

    const commissionAmount = Math.round(orderAmount * rate / 100 * 100) / 100

    let inviter: { _id: string, nickName?: string } | null = null
    try {
      const inviterRes = await db.collection('users').doc(user.inviterId).field({ _id: true, nickName: true }).get()
      inviter = inviterRes.data
    } catch (e) { return }
    if (!inviter) {return}

    const existRes = await db.collection('tuan_commissions').where({
      orderNo: o.orderNo || o._id,
      inviterId: user.inviterId,
    }).count()
    if (existRes.total > 0) {return}

    await db.collection('tuan_commissions').add({
      data: {
        _id: generateId('commission', o.ownerId),
        inviterId: user.inviterId,
        inviterNickName: inviter.nickName || '',
        ownerId: user._id,
        orderType,
        orderId: o._id,
        orderNo: o.orderNo || o._id,
        orderAmount,
        commissionRate: rate,
        commissionAmount,
        status: 'pending',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
  } catch (e: unknown) {
    logger.error('_createCommissionRecord', { msg: (e as Error)?.message })
  }
}

/** 内部：重算 host.rating / host.ratingCount */
async function recalcHostRating(hostId: string): Promise<void> {
  if (!hostId) {return}
  const statsRes = await db.collection('evaluations')
    .where({ hostId })
    .field({ rating: true })
    .limit(1000)
    .get()
  const list = (statsRes.data || []) as Array<{ rating?: number }>
  const count = list.length
  if (count === 0) {
    await db.collection('hostProfiles').doc(hostId).update({
      data: { rating: 0, ratingCount: 0, lastEvaluatedAt: db.serverDate() },
    })
    return
  }
  const sum = list.reduce((acc, e) => acc + (Number(e.rating) || 0), 0)
  const avg = Math.round((sum / count) * 10) / 10
  await db.collection('hostProfiles').doc(hostId).update({
    data: {
      rating: avg,
      ratingCount: count,
      lastEvaluatedAt: db.serverDate(),
    },
  })
}

// =====================================================================
// Handler 实现
// =====================================================================

/**
 * 1. getOrders - 订单列表（owner / host 双视角）
 */
export async function getOrders(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { role, status, page = 1, pageSize = 10, dateRange } = event as { role?: string, status?: string, page?: number, pageSize?: number, dateRange?: string }
  const query: Record<string, unknown> = {}

  if (role === 'owner') {
    query.ownerId = openid
  } else if (role === 'host') {
    query.organizerId = openid
  } else {
    throw err('INVALID_PARAMS', '无效的角色类型')
  }

  if (status && status !== 'all') {
    if (status === 'in_progress') {
      query.status = (db.command as { in: (arr: string[]) => unknown }).in(['in_progress', 'confirmed', 'ongoing'])
    } else {
      query.status = status
    }
  }

  if (dateRange) {
    const { startDate, endDate } = getDateRange(dateRange as DateRangePreset)
    if (startDate && endDate) {
      const gteOp = (db.command as unknown as { gte: (v: number) => unknown }).gte(startDate.getTime()) as { and: (other: unknown) => unknown }
      const lteOp = (db.command as unknown as { lte: (v: number) => unknown }).lte(endDate.getTime())
      query.createdAt = gteOp.and(lteOp)
    }
  }

  const result = await db.collection('orders').where(query as never)
    .field({
      _id: true, ownerId: true, hostId: true, organizerId: true,
      petIds: true, startDate: true, endDate: true, duration: true, totalPrice: true,
      status: true, note: true, createdAt: true, updatedAt: true,
      petsInfo: true, hostInfo: true, ownerInfo: true, paymentStatus: true, paidAt: true,
      orderType: true, activityId: true, activityTitle: true, activityCoverUrl: true,
      activityStartTime: true, activityEndTime: true, activityLocation: true,
      phone: true, notes: true, pricePerDay: true, petCount: true, basicPrice: true,
      originalAmount: true, couponId: true, couponDiscount: true,
    })
    .orderBy('createdAt', 'desc')
    .skip((Number(page) - 1) * Number(pageSize))
    .limit(Number(pageSize))
    .get()

  const countResult = await db.collection('orders').where(query as never).count()

  const enrichedOrders = await enrichOrders((result.data || []) as unknown[])

  return handleSuccess({
    list: enrichedOrders,
    total: countResult.total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.ceil(countResult.total / Number(pageSize)),
  }, '获取成功')
}

/**
 * 2. enrichOrders - 订单冗余信息补全（pets / host）
 */
export async function enrichOrders(orders: unknown[]): Promise<EnrichedOrder[]> {
  if (!orders || orders.length === 0) {return orders as EnrichedOrder[]}

  const result: EnrichedOrder[] = orders.map((raw) => {
    const enriched: EnrichedOrder = { ...(raw as EnrichedOrder) }

    if (enriched.petsInfo && enriched.petsInfo.length > 0) {
      enriched.pets = enriched.petsInfo as unknown as UserDoc[]
    }
    if (enriched.hostInfo) {
      enriched.hostName = enriched.hostName || (enriched.hostInfo as { hostName?: string }).hostName || ''
      enriched.hostAvatar = enriched.hostAvatar || (enriched.hostInfo as { avatarUrl?: string }).avatarUrl || ''
    }

    return enriched
  })

  const ordersNeedEnrich = result.filter(order =>
    !order.pets || !order.pets.length || !order.hostName,
  )

  if (ordersNeedEnrich.length > 0) {
    const petIds = [...new Set(ordersNeedEnrich.flatMap(o => (o as { petIds?: string[] }).petIds || []))]
    const hostIds = [...new Set(ordersNeedEnrich.map(o => (o as { hostId?: string }).hostId).filter(Boolean) as string[])]

    const petMap: Record<string, unknown> = {}
    const hostMap: Record<string, unknown> = {}

    if (petIds.length > 0) {
      const petRes = await db.collection('pets').where({ _id: (db.command as { in: (arr: string[]) => unknown }).in(petIds) }).get()
      ;(petRes.data || []).forEach(p => { petMap[(p as { _id: string })._id] = p })
    }

    if (hostIds.length > 0) {
      const hostRes = await db.collection('hostProfiles').where({ _id: (db.command as { in: (arr: string[]) => unknown }).in(hostIds) }).get()
      ;(hostRes.data || []).forEach(h => { hostMap[(h as { _id: string })._id] = h })
    }

    result.forEach(order => {
      if (!order.pets || !order.pets.length) {
        order.pets = ((order as { petIds?: string[] }).petIds || []).map(id => petMap[id] as UserDoc).filter(Boolean)
      }
      if (!order.hostName && hostMap[(order as { hostId?: string }).hostId || '']) {
        const host = hostMap[(order as { hostId?: string }).hostId || ''] as { hostName?: string, name?: string, avatarUrl?: string }
        order.hostName = host.hostName || host.name || ''
        order.hostAvatar = host.avatarUrl || ''
      }
    })
  }

  return result
}

/**
 * 3. createOrder - 创建订单
 */
export async function createOrder(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { hostId, petIds, startDate, endDate, note, couponId, couponDiscount, originalAmount } = event as { hostId?: string, petIds?: string[], startDate?: string, endDate?: string, note?: string, couponId?: string, couponDiscount?: number, originalAmount?: number }
  if (!hostId || !petIds || !startDate || !endDate) {
    throw err('INVALID_PARAMS', '缺少必要参数')
  }

  const ownerId = openid

  let ownerInfo: Record<string, unknown> = {}
  try {
    const owner = await db.collection('users').doc(openid).get()
    ownerInfo = { ...(owner.data as Record<string, unknown>) }
  } catch (e: unknown) {
    logger.warn('createOrder.users.fetch', { openid, code: (e as { errCode?: string }).errCode, msg: (e as Error).message })
  }

  const host = await db.collection('hostProfiles').doc(hostId).get()
  if (!host.data) {
    throw err('NOT_FOUND', '寄养家庭不存在')
  }
  const hostInfo: Record<string, unknown> = { ...(host.data as Record<string, unknown>) }

  SENSITIVE_HOST_FIELDS.forEach(f => { delete hostInfo[f] })

  const petList: unknown[] = []
  if (petIds && petIds.length > 0) {
    const petsRes = await db.collection('pets')
      .where({ _id: (db.command as { in: (arr: string[]) => unknown }).in(petIds) })
      .get()
    petList.push(...((petsRes.data || []) as unknown[]))
    if (petList.length !== petIds.length) {
      throw err('PET_NOT_FOUND', '宠物档案不存在或已删除')
    }
  }

  const isAvailable = await checkDateAvailabilityInternal(hostId, startDate, endDate)
  if (!isAvailable) {
    throw err('BUSINESS_ERROR', '所选日期已被预订')
  }

  const pricePerDay = (host.data as { pricePerDay?: number }).pricePerDay || 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (days < 1) {
    throw err('INVALID_PARAMS', '结束日期必须晚于开始日期')
  }
  const petCount = Array.isArray(petIds) ? petIds.length : 1
  const calculatedPrice = pricePerDay * days * petCount

  const order: Record<string, unknown> = {
    ownerId,
    hostId,
    organizerId: (hostInfo.openid as string) || hostId,
    petIds,
    startDate,
    endDate,
    duration: days,
    pricePerDay,
    petCount,
    basicPrice: calculatedPrice,
    originalAmount: originalAmount || calculatedPrice,
    totalPrice: calculatedPrice,
    couponId: couponId || '',
    couponDiscount: Number(couponDiscount) || 0,
    note: note || '',
    status: 'pending',
    paymentStatus: 'unpaid',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
    ownerInfo,
    hostInfo,
    petsInfo: petList,
    ownerName: (ownerInfo.nickName as string) || '',
    ownerPhone: (ownerInfo.phone as string) || '',
    hostName: (hostInfo.hostName as string) || '',
  }

  ;(order as { _id: string })._id = generateId('order', openid)
  let result
  try {
    result = await withRateLimit(
      { userId: openid, type: 'order', targetId: hostId },
      () => db.collection('orders').add({ data: order as Record<string, unknown> }),
    )
  } catch (e: unknown) {
    logger.error('createOrder', { msg: (e as Error)?.message })
    if (isBusinessError(e) && (e as { code: string }).code === 'RATE_LIMITED') {throw e}
    if (isBusinessError(e) && (e as { code: string }).code === 'DUPLICATE_KEY') {throw e}
    const normalized = normalizeDbError(e)
    if (!normalized || normalized === e) {throw err('ORDER_CREATE_FAILED', '订单创建失败，请重试')}
    throw normalized
  }
  return handleSuccess({ orderId: (result as { _id: string })._id, ...order }, '创建成功')
}

/**
 * 4. updateOrderStatus - 状态机推进
 */
export async function updateOrderStatus(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId, status } = event as { orderId?: string, status?: OrderStatus }
  if (!orderId || !status) {
    throw err('INVALID_PARAMS', '缺少必要参数')
  }

  const order = await db.collection('orders').doc(orderId).get()
  if (!order.data) {
    throw err('NOT_FOUND', '订单不存在')
  }

  const od = order.data as { organizerId?: string, ownerId?: string, status?: string, refundStatus?: string, timeoutAt?: number }
  const isHost = od.organizerId === openid
  const isOwner = od.ownerId === openid

  if (!isHost && !isOwner) {
    throw err('PERMISSION_DENIED', '无权操作该订单')
  }

  if (status === 'cancelled' && od.refundStatus === 'completed') {
    throw err('ORDER_ALREADY_REFUNDED', '订单已退款，不能再次取消')
  }

  if (od.status === 'pending' && od.timeoutAt && Date.now() > od.timeoutAt) {
    throw err('ORDER_TIMEOUT', '订单已超时未支付')
  }

  const allowed = ALLOWED_TRANSITIONS[od.status as OrderStatus]
  if (!allowed || !allowed.includes(status)) {
    throw err('BUSINESS_ERROR', '状态变更无效')
  }

  await db.collection('orders').doc(orderId).update({
    data: { status, updatedAt: db.serverDate() },
  })

  sendOrderNotification(orderId, status).catch(() => {})

  return handleSuccess({ orderId, status }, '更新成功')
}

/**
 * 5. getActivityOrders - 活动订单列表
 */
export async function getActivityOrders(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { status, page = 1, pageSize = 20 } = event as { status?: string, page?: number, pageSize?: number }
  const query: Record<string, unknown> = {
    ownerId: openid,
    orderType: 'activity',
  }

  if (status && status !== 'all') {
    query.status = status
  }

  const result = await db.collection('orders').where(query as never)
    .orderBy('createdAt', 'desc')
    .skip((Number(page) - 1) * Number(pageSize))
    .limit(Number(pageSize))
    .get()

  const countResult = await db.collection('orders').where(query as never).count()

  return handleSuccess({
    list: result.data || [],
    total: countResult.total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.ceil(countResult.total / Number(pageSize)),
  }, '获取成功')
}

/**
 * 6. getActivityOrderDetail - 活动订单详情
 */
export async function getActivityOrderDetail(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId } = event as { orderId?: string }
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  const order = await db.collection('orders').doc(orderId).get()
  if (!order.data) {throw err('NOT_FOUND', '订单不存在')}

  const od = order.data as { orderType?: OrderType, ownerId?: string, organizerId?: string }
  if (od.orderType !== 'activity') {throw err('INVALID_PARAMS', '不是活动订单')}
  if (od.ownerId !== openid && od.organizerId !== openid) {
    throw err('PERMISSION_DENIED', '只能查看自己的订单')
  }

  return handleSuccess(od, '获取成功')
}

/**
 * 7. cancelOrder - 取消订单（= updateOrderStatus('cancelled')）
 */
export async function cancelOrder(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  ;(event as { status: OrderStatus }).status = 'cancelled'
  return updateOrderStatus(event, _context, auth)
}

/**
 * 8. getOrderDetail - 订单详情
 */
export async function getOrderDetail(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId, outTradeNo } = event as { orderId?: string, outTradeNo?: string }
  if (!orderId && !outTradeNo) {
    throw err('INVALID_PARAMS', '缺少订单ID或交易单号')
  }

  let order: { data: unknown | null } | null = null
  if (orderId) {
    order = await db.collection('orders').doc(orderId).get() as { data: unknown | null }
  } else {
    const res = await db.collection('orders').where({ outTradeNo }).limit(1).get()
    if (res.data && (res.data as unknown[]).length > 0) {
      order = { data: (res.data as unknown[])[0] }
    }
  }

  if (!order || !order.data) {
    throw err('NOT_FOUND', '订单不存在')
  }

  const od = order.data as { organizerId?: string, ownerId?: string }
  const isHost = od.organizerId === openid
  const isOwner = od.ownerId === openid

  if (!isHost && !isOwner) {
    throw err('PERMISSION_DENIED', '只能查看自己的订单')
  }

  const [enriched] = await enrichOrders([order.data])
  return handleSuccess(enriched, '获取成功')
}

/**
 * 9. calculatePrice - 价格计算（公开）
 */
export async function calculatePrice(event: EventLike): HandlerResult {
  const { hostId, startDate, endDate, petIds } = event as { hostId?: string, startDate?: string, endDate?: string, petIds?: string[] }
  if (!hostId || !startDate || !endDate) {
    throw err('INVALID_PARAMS', '缺少必要参数')
  }

  const host = await db.collection('hostProfiles').doc(hostId).get()
  if (!host.data) {
    throw err('NOT_FOUND', '寄养家庭不存在')
  }

  const pricePerDay = (host.data as { pricePerDay?: number }).pricePerDay || 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const petCount = Array.isArray(petIds) ? petIds.length : 1
  const totalPrice = pricePerDay * days * petCount

  return handleSuccess({ pricePerDay, days, totalPrice }, '计算成功')
}

/**
 * 10. checkDateAvailability - 日期可用性（公开）
 */
export async function checkDateAvailability(event: EventLike): HandlerResult {
  const { hostId, startDate, endDate } = event as { hostId?: string, startDate?: string, endDate?: string }
  if (!startDate || !endDate) {
    return handleSuccess({ available: false }, '缺少日期参数')
  }

  try {
    const existingOrders = await db.collection('orders')
      .where({
        hostId: hostId || '',
        status: (db.command as { in: (arr: string[]) => unknown }).in(['confirmed', 'ongoing']),
      })
      .field({ startDate: true, endDate: true })
      .limit(100)
      .get()

    const requestStart = new Date(startDate).getTime()
    const requestEnd = new Date(endDate).getTime()
    const hasOverlap = ((existingOrders.data || []) as Array<{ startDate: string, endDate: string }>).some(o => {
      const orderStart = new Date(o.startDate).getTime()
      const orderEnd = new Date(o.endDate).getTime()
      return orderStart < requestEnd && orderEnd > requestStart
    })

    return handleSuccess({ available: !hasOverlap }, '查询成功')
  } catch (error) {
    return handleSuccess({ available: false }, '查询失败')
  }
}

/**
 * 11. getBoardingOrders - 合作伙伴视角的寄养订单
 */
export async function getBoardingOrders(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const admin = await checkPartnerPermission(openid, 'hosting')

  const { status, page = 1, pageSize = 20 } = event as { status?: string, page?: number, pageSize?: number }
  const where: Record<string, unknown> = {}
  if (status) {where.status = status}
  where.type = (db.command as { nin: (arr: string[]) => unknown }).nin(['mall', 'group_buy'])
  where.orderType = (db.command as { nin: (arr: string[]) => unknown }).nin(['activity'])

  const roles = admin.roles || []
  const perms = admin.permissions || []
  if (!roles.includes('super_admin') && !perms.includes('hosting')) {
    const hostProfileRes = await db.collection('hostProfiles')
      .where({ openid }).limit(1).get()
    if (hostProfileRes.data && (hostProfileRes.data as unknown[]).length > 0) {
      where.hostId = (hostProfileRes.data as Array<{ _id: string }>)[0]._id
    }
  }

  const result: PaginatedResult<EnrichedBoardingOrder> = await paginate<EnrichedBoardingOrder>(db, 'orders', { page, pageSize, where })

  const enrichedList: EnrichedBoardingOrder[] = (result.list || []).map((raw) => {
    const enriched: EnrichedBoardingOrder = { ...raw }

    if (enriched.ownerInfo) {
      enriched.ownerName = enriched.ownerName || (enriched.ownerInfo as { nickName?: string }).nickName || ''
      enriched.ownerPhone = enriched.ownerPhone || (enriched.ownerInfo as { phone?: string }).phone || ''
    }
    if (enriched.hostInfo) {
      enriched.hostName = enriched.hostName || (enriched.hostInfo as { hostName?: string }).hostName || ''
      enriched.hostPhone = enriched.hostPhone || (enriched.hostInfo as { phone?: string }).phone || ''
    }

    enriched.orderNo = enriched.orderNo || enriched._id || ''
    enriched.buyerNickName = enriched.ownerName || (enriched.ownerInfo as { nickName?: string } | undefined)?.nickName || ''
    enriched.productName = enriched.hostName ? `寄养 - ${enriched.hostName}` : '寄养服务'
    enriched.totalAmount = enriched.totalAmount || enriched.totalPrice || enriched.basicPrice || 0

    return enriched
  })

  return handleSuccess({ ...result, list: enrichedList })
}

/**
 * 12. getBoardingOrderDetail - 合作伙伴订单详情
 */
export async function getBoardingOrderDetail(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  await checkPartnerPermission(openid, 'hosting')

  const { orderId } = event as { orderId?: string }
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  const res = await db.collection('orders').doc(orderId).get()
  if (!res.data) {throw err('NOT_FOUND', '订单不存在')}

  const order: Record<string, unknown> = { ...(res.data as Record<string, unknown>) }

  if (order.ownerInfo) {
    order.ownerName = order.ownerName || (order.ownerInfo as { nickName?: string }).nickName || ''
    order.ownerPhone = order.ownerPhone || (order.ownerInfo as { phone?: string }).phone || ''
  }
  if (order.hostInfo) {
    order.hostName = order.hostName || (order.hostInfo as { hostName?: string }).hostName || ''
    order.hostPhone = order.hostPhone || (order.hostInfo as { phone?: string }).phone || ''
  }
  if (order.petsInfo && (order.petsInfo as unknown[]).length > 0) {
    order.pets = order.petsInfo
  }

  if (!order.pets && order.petIds && (order.petIds as string[]).length > 0) {
    try {
      const petRes = await db.collection('pets').where({ _id: (db.command as { in: (arr: string[]) => unknown }).in(order.petIds as string[]) }).get()
      const petMap: Record<string, unknown> = {}
      ;(petRes.data || []).forEach(p => { petMap[(p as { _id: string })._id] = p })
      order.pets = (order.petIds as string[]).map(id => petMap[id] as UserDoc).filter(Boolean)
    } catch (e) {
      order.pets = []
    }
  }

  if (!order.ownerName && !order.ownerPhone && order.ownerId) {
    try {
      const userRes = await db.collection('users').doc(order.ownerId as string)
        .field({ _id: true, nickName: true, phone: true })
        .get()
      if (userRes.data) {
        const u = userRes.data as { nickName?: string, phone?: string }
        order.ownerName = order.ownerName || u.nickName || ''
        order.ownerPhone = order.ownerPhone || u.phone || ''
      }
    } catch (e) {
      logger.warn('getBoardingOrderDetail.users.fetch', { orderId, code: (e as { errCode?: string }).errCode, msg: (e as Error).message })
    }
  }

  if (!order.hostName && !order.hostPhone && order.hostId) {
    try {
      const hostRes = await db.collection('hostProfiles').doc(order.hostId as string).get()
      if (hostRes.data) {
        const h = hostRes.data as { hostName?: string, name?: string, phone?: string }
        order.hostName = order.hostName || h.hostName || h.name || ''
        order.hostPhone = order.hostPhone || h.phone || ''
      }
    } catch (e) {
      logger.warn('getBoardingOrderDetail.hostProfiles.fetch', { orderId, code: (e as { errCode?: string }).errCode, msg: (e as Error).message })
    }
  }

  order.days = order.duration
  order.notes = order.note
  order.price = order.totalPrice

  return handleSuccess(order)
}

/**
 * 13. handleBoardingOrder - 合作伙伴操作（状态机 + 佣金）
 */
export async function handleBoardingOrder(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  await checkPartnerPermission(openid, 'hosting')

  const { orderId, operation } = event as { orderId?: string, operation?: string }
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!operation) {throw err('INVALID_PARAMS', '缺少操作类型')}

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getTargetStatusByOperation, canPerformOperation } = require('./common/boarding-state-machine')
  const newStatus = getTargetStatusByOperation(operation)
  if (!newStatus) {throw err('INVALID_PARAMS', '无效操作')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}

  if (!canPerformOperation((orderRes.data as { status: string }).status, operation)) {
    throw err('STATE_INVALID', `无法从 ${(orderRes.data as { status: string }).status} 变更为 ${newStatus}`)
  }

  await db.collection('orders').doc(orderId).update({
    data: { status: newStatus, updatedAt: db.serverDate() },
  })

  if (newStatus === 'completed') {await createCommissionRecordInternal('hosting', orderRes.data as OrderDoc)}

  sendOrderNotification(orderId, newStatus).catch(() => {})

  return handleSuccess({ orderId, status: newStatus }, '操作成功')
}

/**
 * 14. submitEvaluation - 评价提交（含风控）
 */
export async function submitEvaluation(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId, rating, comment, tags = [] } = event as { orderId?: string, rating?: number, comment?: string, tags?: string[] }
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  const ratingNum = Number(rating)
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw err('INVALID_PARAMS', '评分必须为 1-5 的整数')
  }

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('ORDER_NOT_FOUND', '订单不存在')}
  const order = orderRes.data as { ownerId?: string, hostId?: string, organizerId?: string, status?: string }

  if (order.ownerId !== openid) {
    throw err('PERMISSION_DENIED', '只能评价自己的订单')
  }
  if (order.status !== 'completed') {
    throw err('BUSINESS_ERROR', '仅已完成订单可评价')
  }

  const safeComment = String(comment || '').slice(0, 500)
  let pendingReview = false
  let riskDecision = 'RISK_PASS'
  let riskReasons: string[] = []
  try {
    const risk = await withRateLimit(
      { userId: openid, type: 'evaluation', targetId: order.hostId },
      () => detectReviewSpam({
        db,
        userId: openid,
        hostId: order.hostId,
        orderId,
        rating: ratingNum,
        comment: safeComment,
      }),
    )
    riskDecision = mapActionToErrorCode((risk as { action: string }).action)
    riskReasons = (risk as { reasons: string[] }).reasons
    if ((risk as { action: string }).action === 'reject') {
      logger.warn('submitEvaluation.risk_reject', { orderId, userId: openid, reasons: (risk as { reasons: string[] }).reasons })
      throw err('RISK_REJECT', '评价被风控拦截', {
        reasons: (risk as { reasons: string[] }).reasons,
        level: (risk as { level: string }).level,
        orderId,
      })
    }
    if ((risk as { action: string }).action === 'review') {
      pendingReview = true
      logger.info('submitEvaluation.risk_pending', { orderId, userId: openid, reasons: (risk as { reasons: string[] }).reasons })
    } else {
      logger.debug?.('submitEvaluation.risk_pass', { orderId, userId: openid })
    }
  } catch (e) {
    if (isBusinessError(e) && (e as { code: string }).code === 'RATE_LIMITED') {
      logger.warn('submitEvaluation.rate_limited', { orderId, userId: openid, msg: (e as Error).message })
      throw e
    }
    if (isBusinessError(e) && (e as { code: string }).code === 'RISK_REJECT') {throw e}
    logger.warn('submitEvaluation.risk_control_error', { orderId, msg: (e as { message?: string })?.message })
    riskDecision = 'RISK_PASS'
  }

  const existRes = await db.collection('evaluations')
    .where({ orderId }).limit(1).get()
  if (existRes.data && (existRes.data as unknown[]).length > 0) {
    return handleSuccess({ ...(existRes.data as Array<Record<string, unknown>>)[0], duplicate: true }, '已评价过该订单')
  }

  const evaluation: Record<string, unknown> = {
    _id: generateId('eval', openid),
    orderId,
    hostId: order.hostId,
    organizerId: order.organizerId || '',
    ownerId: openid,
    rating: ratingNum,
    comment: safeComment,
    tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
    pendingReview,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  try {
    await db.collection('evaluations').add({ data: evaluation })
  } catch (e: unknown) {
    if (isBusinessError(e) && (e as { code: string }).code === 'DUPLICATE_KEY') {
      return handleSuccess({ orderId, duplicate: true }, '已评价过该订单')
    }
    throw e
  }

  recalcHostRating(order.hostId as string).catch(e => {
    logger.warn('_recalcHostRating', { hostId: order.hostId, msg: (e as Error).message })
  })

  return handleSuccess({
    ...evaluation,
    riskDecision,
    riskReasons: pendingReview ? riskReasons : [],
  }, pendingReview ? '评价已记录，等待运营抽检' : '评价成功')
}

/**
 * getHostEvaluations - 寄养家庭评价列表（公开）
 */
export async function getHostEvaluations(event: EventLike): HandlerResult {
  const { hostId, page = 1, pageSize = 10 } = event as { hostId?: string, page?: number, pageSize?: number }
  if (!hostId) {throw err('INVALID_PARAMS', '缺少 hostId')}

  const safePage = Math.max(1, Number(page) || 1)
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 10), 50)

  const where = { hostId }
  const res = await db.collection('evaluations').where(where)
    .orderBy('createdAt', 'desc')
    .skip((safePage - 1) * safePageSize)
    .limit(safePageSize)
    .get()
  const countRes = await db.collection('evaluations').where(where).count()

  return handleSuccess({
    list: res.data || [],
    total: countRes.total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(countRes.total / safePageSize),
  }, '获取成功')
}

// =====================================================================
// 默认导出（保持 CommonJS 兼容：module.exports = { handler: withErrorHandling(...) }）
// =====================================================================

const _handlers = {
  getOrders: withErrorHandling(getOrders),
  enrichOrders,
  createOrder: withErrorHandling(createOrder),
  updateOrderStatus: withErrorHandling(updateOrderStatus),
  getActivityOrders: withErrorHandling(getActivityOrders),
  getActivityOrderDetail: withErrorHandling(getActivityOrderDetail),
  cancelOrder: withErrorHandling(cancelOrder),
  getOrderDetail: withErrorHandling(getOrderDetail),
  calculatePrice: withErrorHandling(calculatePrice),
  checkDateAvailability: withErrorHandling(checkDateAvailability),
  getBoardingOrders: withErrorHandling(getBoardingOrders),
  getBoardingOrderDetail: withErrorHandling(getBoardingOrderDetail),
  handleBoardingOrder: withErrorHandling(handleBoardingOrder),
  submitEvaluation: withErrorHandling(submitEvaluation),
  getHostEvaluations: withErrorHandling(getHostEvaluations),
}

// Runtime shim: 把 module.exports 指向包装后的 handlers
// (兼容原 CommonJS 模式 `module.exports = { ... }`，
//  避免消费方需用 .default 才能取到包装后的 handler)
// TypeScript 默认会把 `export default` 编译为 `exports.default = { ... }`，
// 但 orders.js 的消费方（index.js + 单元测试）直接 `require('./orders')` 后
// 期望 orders.getOrders === withErrorHandling(getOrders)。因此需要这个 shim。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = _handlers
// 同步设置 default 以保持 ESM 互操作
;(_handlers as Record<string, unknown>).default = _handlers

export default _handlers
