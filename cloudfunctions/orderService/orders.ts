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
const { detectReviewSpam, detectBoardingAcceptRisk, mapActionToErrorCode } = require('./common/risk-control')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('../common/risk-rate-limit')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeDbError } = require('../common/normalize')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createServiceIncomeRecord } = require('../common/service-income-utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCommissionRecord, cancelCommissionRecord } = require('../common/commission-utils')

// =====================================================================
// 类型定义
// =====================================================================

/** 通用 handler 签名（event / context / auth） */
type AuthLike = { openid?: string, [k: string]: unknown }
type EventLike = Record<string, unknown>
type ContextLike = Record<string, unknown>
type HandlerResult = Promise<ApiResponse<unknown> | unknown>
type WrappedHandler<T = unknown> = (event: EventLike, context: ContextLike, auth: AuthLike | null) => Promise<ApiResponse<T>>

/**
 * 寄养订单状态语义：
 *   - pending_payment: 待支付
 *   - paid: 已支付，等待商家确认
 *   - confirmed: 商家已确认接单
 *   - in_progress: 寄养服务进行中
 *   - completed: 寄养服务已完成
 *   - cancelled: 订单已取消
 *   - rejected: 商家已拒绝
 */

/** 状态中文映射（订单状态通知） */
const STATUS_TEXT_MAP: Record<string, string> = {
  pending_payment: '待支付',
  paid: '已支付',
  confirmed: '已确认',
  in_progress: '寄养中',
  completed: '已结束',
  cancelled: '已取消',
  refunded: '已退款',
}

/** 寄养家庭档案敏感字段（不写入订单文档） */
const SENSITIVE_HOST_FIELDS = [
  'idCard', 'idCardFront', 'idCardBack', 'healthCertificate', 'emergencyContactPhone',
] as const

/** 日期范围预设 */
type DateRangePreset = 'today' | 'week' | 'month' | 'last_month' | 'default'

/** 合作伙伴权限类型 */
type PartnerPermission = 'hosting' | string

/**
 * 允许的订单状态白名单
 *
 * P2 修复（M3）：updateOrderStatus 入参 status 强制白名单校验，
 *   防止前端传任意字符串绕过状态机（状态机也校验，但白名单是更早的 fail-fast）
 */
const ALLOWED_ORDER_STATUS: ReadonlySet<string> = new Set([
  'pending_payment', 'paid', 'confirmed', 'in_progress',
  'completed', 'cancelled', 'refunded', 'rejected',
])

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

/** 跨云函数调用接口（用于调 couponService.lockCoupon 等） */
interface CloudCallFunctionApi {
  callFunction: (args: { name: string, data: Record<string, unknown> }) => Promise<{ result: unknown }>
}

// 先转 unknown 再转目标类型，绕过 CloudBaseInstance 类型未声明 callFunction 的问题
const { cloud, db } = initCloud() as unknown as { cloud: CloudCallFunctionApi, db: CloudBaseDB }
// L2 修复：删除未使用的 const _（死代码）
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
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  }
  return { startDate, endDate }
}

/** 内部：检查日期是否可用（精确版，做日期重叠判断）
 *
 * P0 修复（H1）：原实现仅查"host 下是否存在活跃订单"，未做日期重叠判断，
 *   导致 host 一旦有任何 confirmed/in_progress/paid 订单，新订单全部被拒。
 *   现复用 checkDateAvailability 同款重叠算法：
 *   overlap = orderStart < requestEnd && orderEnd > requestStart
 */
async function checkDateAvailabilityInternal(hostId: string, startDate: string, endDate: string): Promise<boolean> {
  try {
    const requestStart = new Date(startDate).getTime()
    const requestEnd = new Date(endDate).getTime()
    // 日期解析失败或反向区间，直接判不可用
    if (isNaN(requestStart) || isNaN(requestEnd) || requestEnd < requestStart) {
      return false
    }
    // P2-006: 补充 'paid' 状态，避免已支付未确认的订单被重复预订
    const existingOrders = await db.collection('orders')
      .where({
        hostId,
        status: (db.command as { in: (arr: string[]) => unknown }).in(['confirmed', 'in_progress', 'paid']),
      })
      .field({ startDate: true, endDate: true })
      .limit(100)
      .get()
    const hasOverlap = ((existingOrders.data || []) as Array<{ startDate: string, endDate: string }>).some(o => {
      const orderStart = new Date(o.startDate).getTime()
      const orderEnd = new Date(o.endDate).getTime()
      return orderStart < requestEnd && orderEnd > requestStart
    })
    return !hasOverlap
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

    // 发送通知给买家
    const ownerId = (order.data as { ownerId: string }).ownerId
    if (ownerId) {
      await db.collection('notifications').add({
        data: { ...notification, ownerId, isRead: false },
      })
    }

    // 发送通知给卖家（organizerId 可能不存在）
    const organizerId = (order.data as { organizerId?: string }).organizerId
    if (organizerId) {
      await db.collection('notifications').add({
        data: { ...notification, ownerId: organizerId, isRead: false },
      })
    }
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
  const admin = adminRes.data[0] as unknown as AdminDoc
  const roles = admin.roles || []
  if (roles.includes('super_admin')) {return admin}
  const perms = admin.permissions || []
  if (!perms.includes(permission)) {
    throw err('PERMISSION_DENIED', `权限不足：需要 ${permission} 权限`)
  }
  return admin
}

/** 优惠券规则（与 couponService.CouponRules 对齐） */
interface CouponRules {
  threshold?: number
  reduceAmount?: number
  discountRate?: number
  maxReduceAmount?: number
  [k: string]: unknown
}

/** 优惠券文档（user_coupons 集合的最小子集） */
interface UserCouponDoc {
  _id: string
  ownerId?: string
  status?: string
  type?: string
  rules?: CouponRules
  templateName?: string
  startTime?: Date | string
  endTime?: Date | string
  [k: string]: unknown
}

/** 服务端计算优惠券折扣（与 couponService.calculateCouponDiscount 算法对齐）
 *
 * P0 修复（H8）：原 createOrder 直接信任客户端传入的 couponDiscount/originalAmount，
 *   用户可传任意金额让订单变 0 元甚至负数。现服务端按 user_coupons.rules 重算。
 *   - 整数分计算避免浮点精度
 *   - threshold 不满足 → 不 eligible
 *   - discount 上限：不超过订单金额
 */
function computeCouponDiscount(coupon: Pick<UserCouponDoc, 'type' | 'rules'>, orderAmount: number): { eligible: boolean, discount: number, message?: string } {
  const { type, rules } = coupon
  if (!rules) {return { eligible: false, discount: 0, message: '优惠券规则缺失' }}

  const orderAmountInFen = Math.round(orderAmount * 100)
  if (orderAmountInFen < 0) {return { eligible: false, discount: 0, message: '订单金额异常' }}

  if (rules.threshold) {
    const thresholdInFen = Math.round(rules.threshold * 100)
    if (orderAmountInFen < thresholdInFen) {
      return { eligible: false, discount: 0, message: `订单金额未达到满${rules.threshold}元使用门槛` }
    }
  }

  let discountInFen = 0
  switch (type) {
  case 'fixed_amount':
  case 'full_reduction':
    discountInFen = Math.round((rules.reduceAmount || 0) * 100)
    break
  case 'discount': {
    const rate = Number(rules.discountRate) || 1
    if (rate <= 0 || rate > 1) {return { eligible: false, discount: 0, message: '折扣率无效' }}
    discountInFen = Math.round(orderAmountInFen * (1 - rate))
    if (rules.maxReduceAmount && rules.maxReduceAmount > 0) {
      const maxInFen = Math.round(rules.maxReduceAmount * 100)
      discountInFen = Math.min(discountInFen, maxInFen)
    }
    break
  }
  default:
    return { eligible: false, discount: 0, message: '未知优惠券类型' }
  }

  // 折扣不超过订单金额
  discountInFen = Math.min(discountInFen, orderAmountInFen)
  return { eligible: true, discount: discountInFen / 100 }
}

/** 服务端校验优惠券并锁定
 *
 * P0 修复（H8）：
 *   1. 不信任客户端传入的 couponDiscount / originalAmount
 *   2. 服务端查 user_coupons 集合校验：归属 / 状态=unused / 有效期
 *   3. 服务端按 coupon.rules 计算 discount
 *   4. 调用 couponService.lockCoupon 锁定券（防重复使用）
 *
 * 失败时抛 BusinessError；成功返回 { discount, couponSnapshot } 给订单写入。
 */
async function validateAndLockCoupon(
  openid: string,
  couponId: string,
  orderAmount: number,
  orderId: string,
  orderType: string,
): Promise<{ discount: number, couponSnapshot: Record<string, unknown> }> {
  // ID 格式校验（防注入）
  if (typeof couponId !== 'string' || couponId.length < 1 || couponId.length > 128) {
    throw err('INVALID_PARAMS', '优惠券ID格式错误')
  }

  const couponRes = await db.collection('user_coupons').doc(couponId).get()
  const coupon = (couponRes.data || null) as UserCouponDoc | null
  if (!coupon) {
    throw err('COUPON_NOT_FOUND', '优惠券不存在')
  }
  if (coupon.ownerId !== openid) {
    throw err('PERMISSION_DENIED', '无权使用他人优惠券')
  }
  if (coupon.status !== 'unused') {
    throw err('COUPON_STATUS_INVALID', `优惠券当前状态不可用：${coupon.status}`)
  }

  const now = new Date()
  if (coupon.startTime && now < new Date(coupon.startTime)) {
    throw err('BUSINESS_ERROR', '优惠券尚未生效')
  }
  if (coupon.endTime && now > new Date(coupon.endTime)) {
    throw err('BUSINESS_ERROR', '优惠券已过期')
  }

  const calc = computeCouponDiscount(coupon, orderAmount)
  if (!calc.eligible) {
    throw err('BUSINESS_ERROR', `优惠券不可用：${calc.message || '不满足使用条件'}`)
  }

  // 调 couponService.lockCoupon 锁定（跨函数调用）
  try {
    const callRes = await cloud.callFunction({
      name: 'couponService',
      data: { action: 'lockCoupon', couponId, orderId, orderType, business: orderType },
    })
    const result = (callRes.result || {}) as { code?: number, message?: string, error?: { type?: string, details?: unknown } }
    if (result.code && result.code !== 0) {
      throw err('COUPON_LOCK_FAILED', result.message || '优惠券锁定失败', { couponError: result.error })
    }
  } catch (e: unknown) {
    if (isBusinessError(e)) {throw e}
    // 网络错误兜底：couponService 不可达时拒绝下单（fail-closed，防止券未锁定却下单）
    logger.error('validateAndLockCoupon.callFunction', { couponId, orderId, msg: (e as Error)?.message })
    throw err('COUPON_LOCK_FAILED', '优惠券锁定失败，请重试', { originalMessage: (e as Error)?.message })
  }

  // snapshot 用于写入订单（便于后续 useCoupon 核销校验）
  const couponSnapshot: Record<string, unknown> = {
    couponId,
    templateName: coupon.templateName || '',
    type: coupon.type || '',
    rules: coupon.rules || {},
  }
  return { discount: calc.discount, couponSnapshot }
}

/** 失败回滚：解锁优惠券（best-effort，不抛错） */
async function unlockCouponBestEffort(couponId: string, orderId: string): Promise<void> {
  try {
    await cloud.callFunction({
      name: 'couponService',
      data: { action: 'unlockCoupon', couponId, orderId },
    })
  } catch (e: unknown) {
    logger.warn('unlockCouponBestEffort', { couponId, orderId, msg: (e as Error)?.message })
  }
}

/** 失败操作记录（用于后台 worker 重试）
 *
 * P1 修复（H4）：handleBoardingOrder 中跨表写入（佣金/收入记录）失败时，
 *   不再仅 warn 吞错，而是写入 failed_operations 集合记录待重试。
 *   后台 worker 可扫描 status='pending' 的记录并重新执行。
 */
interface FailedOperationDoc {
  _id: string
  type: string
  payload: Record<string, unknown>
  error: { message: string, name?: string }
  status: 'pending'
  retryCount: 0
  createdAt: unknown
  updatedAt: unknown
}

async function recordFailedOperation(
  type: string,
  payload: Record<string, unknown>,
  error: unknown,
): Promise<void> {
  try {
    const failedDoc: FailedOperationDoc = {
      _id: `fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      error: {
        message: (error as Error)?.message || String(error),
        name: (error as Error)?.name,
      },
      status: 'pending',
      retryCount: 0,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }
    await db.collection('failed_operations').add({ data: failedDoc as unknown as Record<string, unknown> })
    logger.warn('recordFailedOperation.recorded', { type, payload, error: failedDoc.error })
  } catch (e: unknown) {
    // 即使 failed_operations 也写不进去，也只能记日志兜底
    logger.error('recordFailedOperation.fatal', { type, msg: (e as Error)?.message })
  }
}

interface AdminDoc {
  _id: string
  openid: string
  status: 'active' | 'disabled' | 'pending'
  roles?: string[]
  permissions?: string[]
}

/** 内部：重算 host.rating / host.ratingCount */
/** 内部：重算 host.rating / host.ratingCount
 *
 * P2 修复（M7）：用 aggregate 替代 limit(1000) 内存求和，
 *   避免评价数超过 1000 时 ratingCount 显示 1000、rating 仅前 1000 条平均的不准确问题。
 *   服务端聚合 count + sum(rating)，再客户端算 avg。
 */
async function recalcHostRating(hostId: string): Promise<void> {
  if (!hostId) {return}
  type AggOps = { sum: (v: number | string | Record<string, unknown>) => unknown }
  type AggChain = {
    match: (m: Record<string, unknown>) => AggChain
    group: (g: Record<string, unknown>) => AggChain
    end: () => Promise<unknown>
  }
  const $: AggOps = ((db as unknown as { command: { aggregate?: AggOps } }).command.aggregate) || { sum: () => 0 }
  const collection = db.collection('evaluations') as unknown as {
    aggregate: () => AggChain
  }

  const aggRes = await collection.aggregate()
    .match({ hostId })
    .group({
      _id: null,
      count: $.sum(1),
      ratingSum: $.sum('$rating'),
    })
    .end() as unknown as { list?: Array<{ count?: number, ratingSum?: number }> }

  const stats = (aggRes.list || [])[0] || {}
  const count = Number(stats.count) || 0
  if (count === 0) {
    await db.collection('hostProfiles').doc(hostId).update({
      data: { rating: 0, ratingCount: 0, lastEvaluatedAt: db.serverDate() },
    })
    return
  }
  const ratingSum = Number(stats.ratingSum) || 0
  const avg = Math.round((ratingSum / count) * 10) / 10
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
      query.status = (db.command as { in: (arr: string[]) => unknown }).in(['in_progress', 'confirmed'])
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
 *
 * P0 修复（H8）：优惠券 couponDiscount/originalAmount 不再信任客户端。
 *   - couponId 存在时服务端查 user_coupons 校验归属/状态/有效期/规则
 *   - 服务端按 coupon.rules 计算 discountAmount
 *   - 调 couponService.lockCoupon 锁定券（防重复使用）
 *   - 订单写入失败时 best-effort 调 unlockCoupon 回滚
 */
export async function createOrder(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  // P0 修复（H8）：不接受客户端传入的 couponDiscount / originalAmount
  //   服务端会根据 couponId 自行校验并计算 discount
  const { hostId, petIds, startDate, endDate, note, couponId } = event as {
    hostId?: string,
    petIds?: string[],
    startDate?: string,
    endDate?: string,
    note?: string,
    couponId?: string,
  }
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
    // P2 修复（M2）：检测重复 ID（避免 petList.length !== petIds.length 误报 PET_NOT_FOUND）
    const uniquePetIds = [...new Set(petIds)]
    if (uniquePetIds.length !== petIds.length) {
      throw err('INVALID_PARAMS', '宠物ID存在重复')
    }
    // P2 修复（M1）：校验宠物归属（ownerId === openid），防止为他人的宠物下单
    const petsRes = await db.collection('pets')
      .where({ _id: (db.command as { in: (arr: string[]) => unknown }).in(petIds), ownerId: openid })
      .get()
    petList.push(...((petsRes.data || []) as unknown[]))
    if (petList.length !== petIds.length) {
      throw err('PET_NOT_FOUND', '宠物档案不存在、已删除或不属于当前用户')
    }
  }

  const isAvailable = await checkDateAvailabilityInternal(hostId, startDate, endDate)
  if (!isAvailable) {
    throw err('BUSINESS_ERROR', '所选日期已被预订')
  }

  const pricePerDay = (host.data as { pricePerDay?: number }).pricePerDay || 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  // L4 备注：+1 表示「按天计费且包含首尾两天」（如 7/1~7/3 = 3 天）。
  //   若后续改为按夜计费（酒店式），需改为 -1 或不加。计费规则以产品确认为准。
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (days < 1) {
    throw err('INVALID_PARAMS', '结束日期必须晚于开始日期')
  }
  const petCount = Array.isArray(petIds) ? petIds.length : 1
  const calculatedPrice = pricePerDay * days * petCount

  // P0 修复（H8）：服务端校验优惠券并计算折扣
  let couponDiscount = 0
  let couponSnapshot: Record<string, unknown> | null = null
  if (couponId) {
    // 先生成临时 orderId 供 lockCoupon 关联（最终写入用同一 id）
    const tempOrderId = generateId('order', openid)
    const validated = await validateAndLockCoupon(openid, couponId, calculatedPrice, tempOrderId, 'boarding')
    couponDiscount = validated.discount
    couponSnapshot = validated.couponSnapshot
    // 用 tempOrderId 作为订单 _id，保证与 lockCoupon 关联的 orderId 一致
    ;(event as { _orderId?: string })._orderId = tempOrderId
  }

  const finalAmount = calculatedPrice - couponDiscount
  // 修复：禁止 finalAmount 为负数或过小（原代码 finalAmount > 0 漏掉了负数场景）
  if (couponId && finalAmount < 0.1) {
    // 回滚刚刚的 lockCoupon
    if (couponSnapshot) {
      const rollbackOrderId = (event as { _orderId?: string })._orderId || ''
      await unlockCouponBestEffort(couponId, rollbackOrderId)
    }
    throw err('INVALID_PARAMS', '优惠后订单金额必须 ≥ 0.1 元')
  }

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
    originalAmount: calculatedPrice, // P0 修复（H8）：originalAmount 服务端写入，不再信任客户端
    totalPrice: finalAmount,
    couponId: couponId || '',
    couponDiscount,
    couponSnapshot: couponSnapshot || null,
    note: note || '',
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    // P1 修复（H2）：bookingKey 用于数据库唯一索引，防止并发预订超卖
    //   格式：booking_<hostId>_<startDate>_<endDate>
    //   需在云控制台为 orders 集合的 bookingKey 字段建唯一索引
    //   未建索引时降级为 checkDateAvailabilityInternal 重叠检查（H1 已修复）
    bookingKey: `booking_${hostId}_${startDate}_${endDate}`,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
    ownerInfo,
    hostInfo,
    petsInfo: petList,
    ownerName: (ownerInfo.nickName as string) || '',
    ownerPhone: (ownerInfo.phone as string) || '',
    hostName: (hostInfo.hostName as string) || '',
  }

  // 使用 _orderId（如果有 coupon 锁定关联）或新生成的 id
  ;(order as { _id: string })._id = (event as { _orderId?: string })._orderId || generateId('order', openid)
  let result
  try {
    result = await withRateLimit(
      { userId: openid, type: 'order', targetId: hostId },
      () => db.collection('orders').add({ data: order as Record<string, unknown> }),
    )
  } catch (e: unknown) {
    logger.error('createOrder', { msg: (e as Error)?.message })
    // P0 修复（H8）：订单写入失败时回滚 coupon 锁定
    if (couponId) {
      await unlockCouponBestEffort(couponId, (order as { _id: string })._id)
    }
    // P1 修复（H2）：DUPLICATE_KEY 在已建 bookingKey 唯一索引时表示并发抢订
    //   返回更友好的"该档期已被预订"提示
    if (isBusinessError(e) && (e as { code: string }).code === 'DUPLICATE_KEY') {
      throw err('BUSINESS_ERROR', '该档期已被预订，请选择其他日期', { hostId, startDate, endDate })
    }
    if (isBusinessError(e) && (e as { code: string }).code === 'RATE_LIMITED') {throw e}
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
  // P2 修复（M3）：status 白名单 fail-fast，防注入与拼写错误
  if (!ALLOWED_ORDER_STATUS.has(status)) {
    throw err('INVALID_PARAMS', `非法状态值：${status}`)
  }

  const order = await db.collection('orders').doc(orderId).get()
  if (!order.data) {
    throw err('NOT_FOUND', '订单不存在')
  }

  const od = order.data as {
    organizerId?: string,
    ownerId?: string,
    status?: string,
    refundStatus?: string,
    timeoutAt?: number,
    paymentStatus?: string,
    outTradeNo?: string,
    totalPrice?: number,
    originalAmount?: number,
    orderType?: string,
  }
  const isHost = od.organizerId === openid
  const isOwner = od.ownerId === openid

  if (!isHost && !isOwner) {
    throw err('PERMISSION_DENIED', '无权操作该订单')
  }

  if (status === 'cancelled' && od.refundStatus === 'completed') {
    throw err('ORDER_ALREADY_REFUNDED', '订单已退款，不能再次取消')
  }

  if (od.status === 'pending_payment' && od.timeoutAt && Date.now() > od.timeoutAt) {
    throw err('ORDER_TIMEOUT', '订单已超时未支付')
  }

  const { boardingOrderStateMachine } = require('./common/boarding-state-machine')
  if (!boardingOrderStateMachine.canTransition(od.status, status)) {
    throw err('BUSINESS_ERROR', '状态变更无效')
  }

  // P1 修复（M4）：已支付订单取消时触发退款流程
  //   - paymentStatus === 'paid' 的订单不能直接置为 cancelled（会导致用户已付款但订单取消、款未退）
  //   - 改为调 paymentService.createRefund 跨函数触发退款
  //   - paymentService 内部会更新订单状态为 refunding/refunded 并调微信退款 API
  //   - 失败时抛错，订单状态保持，引导用户重试或联系客服
  if (status === 'cancelled' && od.paymentStatus === 'paid' && od.outTradeNo) {
    const refundAmount = Number(od.totalPrice) || Number(od.originalAmount) || 0
    const totalAmount = refundAmount
    if (refundAmount <= 0) {
      throw err('BUSINESS_ERROR', '订单金额异常，无法发起退款，请联系客服', { orderId })
    }
    try {
      logger.info('updateOrderStatus.triggerRefund', { orderId, outTradeNo: od.outTradeNo, refundAmount })
      const callRes = await cloud.callFunction({
        name: 'paymentService',
        data: {
          action: 'createRefund',
          outTradeNo: od.outTradeNo,
          refundAmount,
          totalAmount,
          reason: isOwner ? '用户主动取消订单' : '商家取消订单',
        },
      })
      const result = (callRes.result || {}) as { code?: number, message?: string, data?: unknown, error?: { type?: string, details?: unknown } }
      if (result.code && result.code !== 0) {
        throw err('REFUND_FAILED', result.message || '退款发起失败，请稍后重试或联系客服', {
          orderId,
          outTradeNo: od.outTradeNo,
          paymentError: result.error,
        })
      }
      // 退款已受理：paymentService 已更新订单状态为 refunding/refunded，无需再调 update
      // P2 修复（M9）：通知改为 await
      await sendOrderNotification(orderId, 'refunded')
      return handleSuccess({ orderId, status: 'refunded', refundInitiated: true }, '退款已发起，请等待到账')
    } catch (e: unknown) {
      if (isBusinessError(e)) {throw e}
      // 跨函数调用网络异常：抛错让前端重试，订单状态保持
      logger.error('updateOrderStatus.refundCallFailed', { orderId, msg: (e as Error)?.message })
      throw err('REFUND_FAILED', '退款服务暂时不可用，请稍后重试或联系客服', {
        orderId,
        originalMessage: (e as Error)?.message,
      })
    }
  }

  await db.collection('orders').doc(orderId).update({
    data: { status, updatedAt: db.serverDate() },
  })

  // P2 修复（M9）：通知改为 await，避免云函数返回后未 await 的 Promise 被 runtime 截断
  //   通知失败不影响主流程（sendOrderNotification 内部已 try/catch）
  await sendOrderNotification(orderId, status)

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
  // 创建新对象而非修改输入（避免副作用）
  const cancelEvent = { ...event, status: 'cancelled' as OrderStatus }
  return updateOrderStatus(cancelEvent, _context, auth)
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
    // L7 修复：outTradeNo 查询增加 owner/organizer 降权过滤，避免无谓全表扫描 + 越权探查
    const orOp = (db.command as { or: (arr: unknown[]) => unknown }).or([
      { ownerId: openid },
      { organizerId: openid },
    ]) as Record<string, unknown>
    const res = await db.collection('orders').where({ outTradeNo, ...orOp }).limit(1).get()
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
  // L4 备注：+1 表示「按天计费且包含首尾两天」（如 7/1~7/3 = 3 天）。
  //   若后续改为按夜计费（酒店式），需改为 -1 或不加。计费规则以产品确认为准。
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
  if (!hostId) {
    return handleSuccess({ available: false }, '缺少 hostId 参数')
  }

  try {
    const existingOrders = await db.collection('orders')
      .where({
        hostId,
        status: (db.command as { in: (arr: string[]) => unknown }).in(['confirmed', 'in_progress']),
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
  // P2 修复（M5）：删除 where.type = nin(['mall', 'group_buy']) 死代码
  //   原因：orders 集合无 type 字段（实际字段是 orderType），$nin 对不存在的字段视为匹配，过滤无效
  where.orderType = (db.command as { nin: (arr: string[]) => unknown }).nin(['activity'])

  // P2 修复（M6）：消除死代码——checkPartnerPermission('hosting') 已要求 hosting 权限，
  //   原 `!perms.includes('hosting')` 判断永远为 false。改为：super_admin 看全部订单，
  //   非 super_admin（即使有 hosting 权限）只看自己作为 host 的订单
  if (!(admin.roles || []).includes('super_admin')) {
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
    enriched.totalAmount = enriched.totalAmount || enriched.totalPrice || (enriched.basicPrice as number | undefined) || 0

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

  // L8 修复：getBoardingOrders 列表已排除 activity，但此处按 orderId 直查会漏过，
  //   任意合作伙伴可拿到活动订单详情（含他人 ownerInfo）。查到后显式拦截活动订单。
  if (order.orderType === 'activity') {
    throw err('PERMISSION_DENIED', '无权查看活动订单')
  }

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
 *    Sprint 51: confirm 操作接入 boarding_accept 风控（防账号被盗批量接单）
 */
export async function handleBoardingOrder(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  // P0 修复（H3）：保留 admin 引用用于后续越权判定（super_admin 例外）
  const admin = await checkPartnerPermission(openid, 'hosting')

  const { orderId, operation } = event as { orderId?: string, operation?: string }
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!operation) {throw err('INVALID_PARAMS', '缺少操作类型')}

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getTargetStatusByOperation, canPerformOperation } = require('./common/boarding-state-machine')
  const newStatus = getTargetStatusByOperation(operation)
  if (!newStatus) {throw err('INVALID_PARAMS', '无效操作')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}

  const od = orderRes.data as { status: string, organizerId?: string, hostId?: string }
  // P0 修复（H3）：越权校验——非 super_admin 只能操作自己作为 organizerId 的订单，
  //   防止 A 寄养家庭 confirm/reject/cancel B 寄养家庭的订单
  const isSuperAdmin = (admin.roles || []).includes('super_admin')
  if (!isSuperAdmin && od.organizerId !== openid) {
    throw err('PERMISSION_DENIED', '无权操作他人订单')
  }

  if (!canPerformOperation(od.status, operation)) {
    throw err('STATE_INVALID', `无法从 ${od.status} 变更为 ${newStatus}`)
  }

  // Sprint 51: confirm 操作（接单）前做风控（防账号被盗批量接单）
  let pendingReview = false
  if (operation === 'confirm') {
    const orderAmount = Number((orderRes.data as { totalAmount?: number, totalPrice?: number, basicPrice?: number }).totalAmount
      || (orderRes.data as { totalPrice?: number }).totalPrice
      || (orderRes.data as { basicPrice?: number }).basicPrice
      || 0)
    // L5 修复：避免 1.005*100=100.4999 浮点误差，加 1e-6 容差再 round（远小于半分，安全）
    const amountFen = Math.round(orderAmount * 100 + 1e-6)
    let partnerCreatedAt: number | undefined
    try {
      const partnerRes = await db.collection('admins').doc(openid).get()
      const partnerData = partnerRes.data as { createdAt?: number | Date } | null
      if (partnerData && partnerData.createdAt) {
        partnerCreatedAt = partnerData.createdAt instanceof Date
          ? partnerData.createdAt.getTime()
          : Number(partnerData.createdAt) || undefined
      }
    } catch (e) {
      logger.warn('handleBoardingOrder.admins.fetch', { openid, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
    }

    try {
      const risk = await withRateLimit(
        { userId: openid, type: 'boarding_accept', targetId: orderId },
        () => detectBoardingAcceptRisk({
          db,
          partnerId: openid,
          orderId,
          amountFen,
          partnerCreatedAt,
        })
      )
      if ((risk as { action: string }).action === 'reject') {
        logger.warn('handleBoardingOrder.risk_reject', { orderId, partnerId: openid, amountFen, reasons: (risk as { reasons: string[] }).reasons })
        throw err('RISK_REJECT', '接单被风控拦截', {
          reasons: (risk as { reasons: string[] }).reasons,
          level: (risk as { level: string }).level,
          orderId,
        })
      }
      if ((risk as { action: string }).action === 'review') {
        pendingReview = true
        logger.info('handleBoardingOrder.risk_pending', { orderId, partnerId: openid, amountFen, reasons: (risk as { reasons: string[] }).reasons })
      } else {
        logger.debug?.('handleBoardingOrder.risk_pass', { orderId, partnerId: openid })
      }
    } catch (e) {
      if (isBusinessError(e) && ((e as { code: string }).code === 'RATE_LIMITED' || (e as { code: string }).code === 'RISK_REJECT')) {throw e}
      logger.warn('handleBoardingOrder.risk_control_error', { orderId, partnerId: openid, msg: (e as { message?: string })?.message })
    }
  }

  await db.collection('orders').doc(orderId).update({
    data: {
      status: newStatus,
      pendingReview, // L11 修复：显式写入 false，避免 mongo 不写字段导致前端 'pendingReview' in data 判断出错
      updatedAt: db.serverDate(),
    },
  })

  if (newStatus === 'completed') {
    // P1 修复（H4）：createCommissionRecord 失败时记录到 failed_operations 由后台重试，
    //   不再仅 warn 吞错（防止订单 completed 但佣金未记导致合作伙伴收入漏算）
    try {
      await createCommissionRecord('boarding', orderRes.data as OrderDoc)
    } catch (e) {
      logger.warn('handleBoardingOrder.createCommissionRecord', { orderId, msg: (e as Error).message })
      await recordFailedOperation('create_commission', { orderType: 'boarding', orderId, orderSnapshot: orderRes.data }, e)
    }

    // 创建寄养收入记录（寄养家庭的收入）
    const order = orderRes.data as { organizerId?: string, _id?: string, totalPrice?: number, orderNo?: string }
    if (order.organizerId && order._id) {
      const amount = Number(order.totalPrice) || 0
      if (amount > 0) {
        try {
          await createServiceIncomeRecord(
            order.organizerId,
            'boarding',
            order._id,
            amount,
            order.orderNo || '',
            '寄养服务收入'
          )
        } catch (e) {
          logger.warn('handleBoardingOrder.createServiceIncomeRecord', {
            orderId,
            organizerId: order.organizerId,
            msg: (e as Error).message
          })
          // P1 修复（H4）：失败时写入补偿队列
          await recordFailedOperation('create_service_income', {
            organizerId: order.organizerId,
            business: 'boarding',
            orderId: order._id,
            amount,
            orderNo: order.orderNo || '',
            description: '寄养服务收入',
          }, e)
        }
      }
    }
  }

  // 取消订单时取消佣金记录和收入记录
  if (newStatus === 'cancelled') {
    try {
      await cancelCommissionRecord(orderId)
    } catch (e) {
      logger.warn('handleBoardingOrder.cancelCommissionRecord', {
        orderId,
        msg: (e as Error).message
      })
      // P1 修复（H4）：失败时写入补偿队列（防止订单取消但佣金仍计提）
      await recordFailedOperation('cancel_commission', { orderType: 'boarding', orderId }, e)
    }
    try {
      const { cancelServiceIncomeRecord } = require('../common/service-income-utils')
      await cancelServiceIncomeRecord(orderId, 'boarding')
    } catch (e) {
      logger.warn('handleBoardingOrder.cancelServiceIncomeRecord', {
        orderId,
        msg: (e as Error).message
      })
      // P1 修复（H4）：失败时写入补偿队列
      await recordFailedOperation('cancel_service_income', { orderId, business: 'boarding' }, e)
    }
  }

  // P2 修复（M9）：通知改为 await
  await sendOrderNotification(orderId, newStatus)

  return handleSuccess({ orderId, status: newStatus, pendingReview }, '操作成功')
}

/** L6 修复：HTML 转义，防止评价内容经 rich-text / innerHTML 渲染时 XSS */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
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

  // L6 修复：先截取再 HTML 转义，防止评价内容经 rich-text / innerHTML 渲染时 XSS
  const rawComment = String(comment || '').slice(0, 500)
  const safeComment = escapeHtml(rawComment)
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
        comment: rawComment,
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

  // P2 修复（M8）：_id 改为基于 orderId 的确定性 ID（eval_${orderId}），
  //   利用 _id 主键唯一约束天然防止并发重复评价（即使判重查询通过，第二个并发 add 也会因主键冲突被拦截）
  //   原 _id=generateId('eval', openid) 含随机数，并发下会生成不同 _id 都写入成功 → 重复评价
  const evaluation: Record<string, unknown> = {
    _id: `eval_${orderId}`,
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
