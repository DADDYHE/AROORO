/**
 * feedingService/index.ts - 喂养服务主入口（TypeScript 源文件 - Sprint 41 迁移）
 *
 * 业务功能（平台统一接单模式，喂养师体系已废弃）：
 *   - 喂养下单（多宠物 + 上门 + 钥匙 + 熟悉度 + 多次访问）
 *   - 订单管理（我的订单 / 详情 / 状态流转）
 *   - 佣金记录（status=completed 触发）
 *
 * 共 5 个 action：
 *   1. createFeedingOrder - 创建喂养订单
 *   2. getFeedingOrders - 我的喂养订单
 *   3. getOrderStatus - 获取订单状态
 *   4. updateFeedingOrderStatus - 更新订单状态
 *   5. getFeedingOrderDetail - 订单详情（管理员）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService / activityService / mallService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.feedingService.json
 */

// =====================================================================
// 公共类型（与 adminService / partnerService / userService / activityService / mallService 保持一致）
// =====================================================================

export interface AuthLike {
  openid?: string
  nickName?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  roles?: string[]
  permissions?: string[]
  _isHttpAuth?: boolean
  [k: string]: unknown
}

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  page?: number
  pageSize?: number
  status?: string
  location?: string
  serviceType?: string
  feederId?: string
  orderId?: string
  operation?: string
  name?: string
  avatarUrl?: string
  phone?: string
  description?: string
  serviceArea?: string[]
  pricePerVisit?: number
  certifications?: unknown[]
  petIds?: string[]
  startDate?: string
  endDate?: string
  visitTimes?: string[]
  address?: string
  notes?: string
  keyMethod?: string
  visitTime?: string
  feederGender?: string
  familiarity?: string
  familiarityText?: string
  familiarityDates?: string[]
  multiVisit?: number
  multiVisitText?: string
  multiVisitDates?: string[]
  petDetails?: unknown[]
  petServices?: Record<string, unknown>
  totalAmount?: number
  originalAmount?: number
  couponId?: string
  couponDiscount?: number
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type FeedingActionHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

// =====================================================================
// 业务类型定义
// =====================================================================

export interface UserRecord {
  _id?: string
  openid?: string
  nickName?: string
  inviterId?: string
  [k: string]: unknown
}

export interface AdminRecord {
  _id?: string
  openid?: string
  status?: string
  roles?: string[]
  permissions?: string[]
  [k: string]: unknown
}

export interface FeederRecord {
  _id?: string
  name?: string
  realName?: string
  nickname?: string
  avatarUrl?: string
  phone?: string
  description?: string
  serviceArea?: string[]
  serviceTypes?: string[]
  serviceTags?: string[]
  pricePerVisit?: number
  certifications?: unknown[]
  rating?: number
  orderCount?: number
  status?: string
  gender?: string
  beautyInfo?: Record<string, unknown>
  createdBy?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface FeedingOrderRecord {
  _id?: string
  orderNo?: string
  orderType?: string
  ownerId?: string
  petIds?: string[]
  petDetails?: PetDetailInput[]
  petServices?: Record<string, unknown>
  startDate?: string
  endDate?: string
  visitTimes?: string[]
  address?: string
  notes?: string
  keyMethod?: string
  visitTime?: string
  feederGender?: string
  familiarity?: string
  familiarityText?: string
  familiarityDates?: string[]
  multiVisit?: number
  multiVisitText?: string
  multiVisitDates?: string[]
  totalAmount?: number
  totalPrice?: number
  originalAmount?: number
  couponId?: string
  couponDiscount?: number
  status?: string
  paymentStatus?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface PetDetailInput {
  id?: string
  petId?: string
  _id?: string
  name?: string
  avatarUrl?: string
  [k: string]: unknown
}

export interface FeederInfo {
  feederName?: string
  feederPhone?: string
  feederAvatar?: string
  [k: string]: unknown
}

export interface StatusTip {
  title: string
  subtitle: string
  icon: string
}

export interface PaginateResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages?: number
  hasNext?: boolean
}

export interface CommissionRecord {
  _id?: string
  inviterId?: string
  inviterNickName?: string
  ownerId?: string
  orderType?: string
  orderId?: string
  orderNo?: string
  orderAmount?: number
  commissionRate?: number
  commissionAmount?: number
  status?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface SystemConfig {
  [key: string]: unknown
}

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, toResponse, isBusinessError } = require('./common/errors')
// H1+H3+M1: 改用公共 commission-utils 模块（含自购防护 P0-8、整数分计算、cancelCommissionRecord 配套）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCommissionRecord } = require('./common/commission-utils')
// M4: 接入告警模块（关键失败主动通知）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordAlert } = require('./common/alert')
// M3: 接入限流（防短时高频下单刷接口）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit')
// Sprint 50: 限流统一 bootstrap
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap')
// 平台价目表 + 节假日判断（与前端 utils/holidays.js 对齐）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isHoliday } = require('./common/holidays')

const { cloud, db } = initCloud()
const logger = createLogger('feedingService')
const _ = db.command

// Sprint 50: 注入全局限流存储（rate_limits + rate_limit_configs 一次注入）
try {
  bootstrapRateLimit(db, { logger })
} catch (e) {
  logger.warn('bootstrapRateLimit failed, fallback to memory:', e && (e as Error).message)
}

// =====================================================================
// 平台价目表（与前端 confirm-service.js _calculatePrice 对齐）
// =====================================================================
//   - 普通日：50 元/天
//   - 节假日：60 元/天
//   - 提前熟悉：0.7 倍
//   - 一天多次：0.8 倍
//   - 遛狗：按 walkMinutes 直接累加（前端 svc.walkMinutes 已是金额）
const BASE_PRICE_PER_DAY = 50
const HOLIDAY_PRICE_PER_DAY = 60
const FAMILIARITY_FACTOR = 0.7
const MULTI_VISIT_FACTOR = 0.8

// =====================================================================
// 字段投影常量
// =====================================================================

const FEEDING_ORDER_FIELDS: Record<string, boolean> = {
  _id: true, orderNo: true, orderType: true, ownerId: true, petIds: true,
  petDetails: true, petServices: true,
  startDate: true, endDate: true, visitTimes: true,
  address: true, notes: true,
  keyMethod: true, visitTime: true,
  familiarity: true, familiarityText: true, familiarityDates: true,
  multiVisit: true, multiVisitText: true, multiVisitDates: true,
  totalAmount: true, originalAmount: true, couponId: true, couponDiscount: true,
  status: true, paymentStatus: true, createdAt: true, updatedAt: true,
}

// =====================================================================
// 状态提示常量
// =====================================================================

const STATUS_TIPS: Record<string, StatusTip> = {
  pending_payment: { title: '待付款', subtitle: '请尽快完成支付', icon: 'clock' },
  confirmed: { title: '订单已确认', subtitle: '平台已接单，将安排服务人员上门', icon: 'success' },
  in_progress: { title: '服务进行中', subtitle: '服务人员正在为您服务', icon: 'progress' },
  completed: { title: '服务已完成', subtitle: '感谢您的使用', icon: 'completed' },
  cancelled: { title: '订单已取消', subtitle: '', icon: 'cancelled' },
}

// =====================================================================
// 私有辅助函数：服务端金额重算（与前端 confirm-service.js _calculatePrice 对齐）
// =====================================================================
/**
 * 根据订单参数服务端重算订单金额（P0-5：不信任客户端 totalAmount）
 *
 * 计算规则：
 *   - 基础上门费：按每只宠物每个服务日累加（节假日 60 元，普通日 50 元）
 *   - 遛狗费：按 petServices[petId].walkMinutes 直接累加（前端已为金额）
 *   - 提前熟悉：日单价 × 0.7 × 当日次数
 *   - 一天多次：日单价 × 0.8 × 当日次数
 */
function calculateOrderAmount(params: {
  petIds?: string[]
  petDetails?: PetDetailInput[]
  petServices?: Record<string, unknown>
  familiarityDates?: unknown[]
  multiVisitDates?: unknown[]
}): { originalAmount: number; basePrice: number; walkTotal: number; familiarityTotal: number; multiVisitTotal: number } {
  const { petDetails, petServices, familiarityDates, multiVisitDates } = params
  let basePrice = 0
  let walkTotal = 0
  // 基础上门 + 遛狗
  ;(petDetails || []).forEach(pet => {
    const svc = (petServices && petServices[pet.id || pet._id || '']) as {
      serviceDates?: Array<{ date: string }>
      walkMinutes?: number
    } | undefined
    if (svc && svc.serviceDates && svc.serviceDates.length > 0) {
      svc.serviceDates.forEach(d => {
        const dateObj = new Date(d.date)
        const holiday = isHoliday(dateObj)
        basePrice += holiday ? HOLIDAY_PRICE_PER_DAY : BASE_PRICE_PER_DAY
      })
    }
    if (svc && svc.walkMinutes) {
      walkTotal += Number(svc.walkMinutes) || 0
    }
  })
  // 提前熟悉
  let familiarityTotal = 0
  ;(familiarityDates || []).forEach(d => {
    const item = d as { date: string; count: number }
    if (item.count > 0) {
      const dateObj = new Date(item.date)
      const holiday = isHoliday(dateObj)
      const dayPrice = holiday ? HOLIDAY_PRICE_PER_DAY : BASE_PRICE_PER_DAY
      familiarityTotal += Math.round(dayPrice * FAMILIARITY_FACTOR * item.count * 100) / 100
    }
  })
  // 一天多次
  let multiVisitTotal = 0
  ;(multiVisitDates || []).forEach(d => {
    const item = d as { date: string; count: number }
    if (item.count > 0) {
      const dateObj = new Date(item.date)
      const holiday = isHoliday(dateObj)
      const dayPrice = holiday ? HOLIDAY_PRICE_PER_DAY : BASE_PRICE_PER_DAY
      multiVisitTotal += Math.round(dayPrice * MULTI_VISIT_FACTOR * item.count * 100) / 100
    }
  })
  const originalAmount = Math.round((basePrice + walkTotal + familiarityTotal + multiVisitTotal) * 100) / 100
  return { originalAmount, basePrice, walkTotal, familiarityTotal, multiVisitTotal }
}

// =====================================================================
// 私有辅助函数：刷新宠物头像
// =====================================================================

async function refreshPetAvatars(orders: FeedingOrderRecord[]): Promise<void> {
  const allPetIds: string[] = []
  for (const order of orders) {
    if (order.petIds && order.petIds.length > 0) {
      for (const pid of order.petIds) {
        if (!allPetIds.includes(pid)) { allPetIds.push(pid) }
      }
    }
  }
  if (allPetIds.length === 0) { return }

  const petMap: Record<string, string> = {}
  const batchSize = 20
  for (let i = 0; i < allPetIds.length; i += batchSize) {
    const batch = allPetIds.slice(i, i + batchSize)
    try {
      const res = await db.collection('pets')
        .where({ _id: _.in(batch) })
        .field({ _id: true, avatarUrl: true })
        .get()
      for (const pet of (res.data || []) as UserRecord[]) {
        petMap[pet._id || ''] = (pet.avatarUrl as string) || ''
      }
    } catch (e) {
      logger.error('refreshPetAvatars_error', e)
    }
  }

  for (const order of orders) {
    if (!order.petDetails || !Array.isArray(order.petDetails)) { continue }
    for (const detail of order.petDetails) {
      const petId = detail.id || detail.petId || detail._id
      if (petId && petMap[petId] !== undefined) {
        detail.avatarUrl = petMap[petId]
      }
    }
  }
}

// =====================================================================
// 私有辅助函数：服务端优惠券校验（P0-1：与 mall/tuan 对齐，防下单金额伪造）
// =====================================================================
/** 计算优惠券折扣（整数分，防浮点）——与 mallService/tuanService 同款 */
function computeCouponDiscount(
  coupon: { type?: string; rules?: Record<string, unknown> },
  orderAmount: number
): { eligible: boolean; discount: number; message?: string } {
  const { type, rules } = coupon
  if (!rules) { return { eligible: false, discount: 0, message: '优惠券规则缺失' } }
  const orderAmountInFen = Math.round(orderAmount * 100)
  if (orderAmountInFen < 0) { return { eligible: false, discount: 0, message: '订单金额异常' } }
  const threshold = rules.threshold as number | undefined
  if (threshold) {
    const thresholdInFen = Math.round(Number(threshold) * 100)
    if (orderAmountInFen < thresholdInFen) {
      return { eligible: false, discount: 0, message: `订单金额未达到满${threshold}元使用门槛` }
    }
  }
  let discountInFen = 0
  switch (type) {
  case 'fixed_amount':
  case 'full_reduction':
    discountInFen = Math.round((Number(rules.reduceAmount) || 0) * 100)
    break
  case 'discount': {
    const rate = Number(rules.discountRate) || 1
    if (rate <= 0 || rate > 1) { return { eligible: false, discount: 0, message: '折扣率无效' } }
    discountInFen = Math.round(orderAmountInFen * (1 - rate))
    const maxReduce = Number(rules.maxReduceAmount) || 0
    if (maxReduce > 0) {
      discountInFen = Math.min(discountInFen, Math.round(maxReduce * 100))
    }
    break
  }
  default:
    return { eligible: false, discount: 0, message: '未知优惠券类型' }
  }
  discountInFen = Math.min(discountInFen, orderAmountInFen)
  return { eligible: true, discount: discountInFen / 100 }
}

/**
 * 服务端只读校验喂养订单优惠券：
 *   - 归属 / 状态(unused|locked) / 有效期 / 适用范围（all|feeding）
 *   - 折扣按 coupon.rules 服务端重算，不信任客户端 couponDiscount（防金额伪造）
 */
async function validateFeedingCoupon(
  openid: string,
  couponId: string,
  orderAmount: number
): Promise<{ discount: number; couponSnapshot: Record<string, unknown> }> {
  if (typeof couponId !== 'string' || couponId.length < 1 || couponId.length > 128) {
    throw err('INVALID_PARAMS', '优惠券ID格式错误')
  }
  const couponRes = await db.collection('user_coupons').doc(couponId).get()
  const coupon = couponRes.data as {
    ownerId?: string
    status?: string
    startTime?: Date | string
    endTime?: Date | string
    applicableScopes?: string[]
    templateName?: string
    type?: string
    rules?: Record<string, unknown>
  } | null
  if (!coupon) { throw err('COUPON_NOT_FOUND', '优惠券不存在') }
  if (coupon.ownerId !== openid) { throw err('PERMISSION_DENIED', '无权使用他人优惠券') }
  if (coupon.status !== 'unused' && coupon.status !== 'locked') {
    throw err('COUPON_STATUS_INVALID', `优惠券当前状态不可用：${coupon.status}`)
  }
  const now = new Date()
  if (coupon.startTime && now < new Date(coupon.startTime)) { throw err('BUSINESS_ERROR', '优惠券尚未生效') }
  if (coupon.endTime && now > new Date(coupon.endTime)) { throw err('BUSINESS_ERROR', '优惠券已过期') }
  const scopes = Array.isArray(coupon.applicableScopes) ? coupon.applicableScopes : []
  if (scopes.length > 0 && !scopes.includes('all') && !scopes.includes('feeding')) {
    throw err('BUSINESS_ERROR', '该优惠券不适用于上门喂养服务')
  }
  const calc = computeCouponDiscount(coupon, orderAmount)
  if (!calc.eligible) {
    throw err('BUSINESS_ERROR', `优惠券不可用：${calc.message || '不满足使用条件'}`)
  }
  return {
    discount: calc.discount,
    couponSnapshot: {
      couponId,
      templateName: coupon.templateName || '',
      type: coupon.type || '',
      rules: coupon.rules || {},
    },
  }
}

// =====================================================================
// Handler 1: createFeedingOrder
// =====================================================================

export async function createFeedingOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const {
    petIds, startDate, endDate, visitTimes, address, notes,
    keyMethod, visitTime, familiarityDates,
    multiVisit, multiVisitText, multiVisitDates,
    petDetails, petServices, couponId, couponDiscount,
  } = event

  if (!petIds || petIds.length === 0) { throw err('INVALID_PARAMS', '请选择宠物') }

  // L3: 基础参数校验
  //   - couponDiscount 必须为非负数（防止负数折扣导致 finalAmount 异常）
  //   - multiVisit 必须为非负整数
  //   - startDate/endDate 若提供必须为合法日期字符串（YYYY-MM-DD）
  if (couponDiscount !== undefined) {
    const cd = Number(couponDiscount)
    if (!Number.isFinite(cd) || cd < 0) {
      throw err('INVALID_PARAMS', '优惠券折扣金额必须为非负数')
    }
  }
  if (multiVisit !== undefined && multiVisit !== null) {
    const mv = Number(multiVisit)
    if (!Number.isFinite(mv) || mv < 0 || !Number.isInteger(mv)) {
      throw err('INVALID_PARAMS', 'multiVisit 必须为非负整数')
    }
  }
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
  if (startDate && typeof startDate === 'string' && !DATE_REGEX.test(startDate)) {
    throw err('INVALID_PARAMS', 'startDate 格式必须为 YYYY-MM-DD')
  }
  if (endDate && typeof endDate === 'string' && !DATE_REGEX.test(endDate)) {
    throw err('INVALID_PARAMS', 'endDate 格式必须为 YYYY-MM-DD')
  }
  if (startDate && endDate && startDate > endDate) {
    throw err('INVALID_PARAMS', '开始日期不能晚于结束日期')
  }

  // M3: 下单前限流（防短时高频刷单）
  //   - 类型 feeding_order：每用户每分钟 6 次
  //   - 超限抛出 RATE_LIMITED（HTTP 429）
  try {
    await withRateLimit(
      { userId: openid, type: 'feeding_order', targetId: 'default' },
      async () => { /* 仅消费限流配额，无额外风控逻辑 */ }
    )
  } catch (rateLimitErr) {
    if ((rateLimitErr as { code?: string }).code === 'RATE_LIMITED') {
      throw rateLimitErr
    }
    // 限流系统异常：降级放行，但告警
    logger.warn('createFeedingOrder.rateLimit.error', {
      openid, msg: (rateLimitErr as Error)?.message,
    })
    try {
      await recordAlert('warning', 'feeding.rateLimit.systemError',
        '喂养下单限流系统异常，已降级放行',
        { openid, error: (rateLimitErr as Error)?.message })
    } catch (_) { /* best-effort */ }
  }

  try {
    // P0-5: 服务端重算订单金额（按平台价目表，不再依赖喂养师 pricePerVisit）
    const { originalAmount } = calculateOrderAmount({
      petIds,
      petDetails: (petDetails || []) as PetDetailInput[],
      petServices,
      familiarityDates,
      multiVisitDates,
    })
    // P0-1 修复：券折扣以服务端重算为准（不信任客户端 couponDiscount，防金额伪造）
    let validatedCouponDiscount = 0
    if (couponId) {
      const couponResult = await validateFeedingCoupon(openid, couponId as string, originalAmount)
      validatedCouponDiscount = couponResult.discount
    } else if (Number(couponDiscount) > 0) {
      throw err('INVALID_PARAMS', '未选择优惠券时不允许折扣')
    }
    const finalAmount = Math.max(0, Math.round((originalAmount - validatedCouponDiscount) * 100) / 100)
    if (couponId && finalAmount < 0.1) {
      throw err('INVALID_PARAMS', '优惠后订单金额必须 ≥ 0.1 元')
    }

    const orderNo = `FD${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    const order: FeedingOrderRecord = {
      orderNo,
      orderType: 'feeding',
      ownerId: openid,
      petIds: petIds || [],
      petDetails: (petDetails || []) as PetDetailInput[],
      petServices: petServices || {},
      startDate: startDate || '',
      endDate: endDate || '',
      visitTimes: visitTimes || [],
      address: address || '',
      notes: notes || '',
      keyMethod: keyMethod || '',
      visitTime: visitTime || '',
      familiarityDates: familiarityDates || [],
      multiVisit: Number(multiVisit) || 0,
      multiVisitText: multiVisitText || '',
      multiVisitDates: multiVisitDates || [],
      // P0-5: 使用服务端计算的金额，忽略客户端 totalAmount
      totalAmount: finalAmount,
      originalAmount,
      couponId: couponId || '',
      couponDiscount: validatedCouponDiscount,
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    order._id = generateId('feeding', openid)
    const res = await db.collection('feedingOrders').add({ data: order })

    // H2: 订单创建成功后锁定优惠券（防止并发下单重复用券）
    //   - 锁定失败需回滚订单（标记 cancelled + paymentStatus=refunded），
    //     避免出现「订单已创建但券未锁定」的中间状态
    //   - lockCoupon 内部含幂等检查（同 orderId 重复锁定会直接成功）
    if (couponId) {
      try {
        const lockResult = await cloud.callFunction({
          name: 'couponService',
          data: {
            action: 'lockCoupon',
            couponId,
            orderId: res._id,
            orderType: 'feeding_order',
            business: 'feeding',
          },
        })
        const lockRes = lockResult && (lockResult.result as { code?: number; message?: string })
        if (!lockRes || lockRes.code !== 0) {
          // 锁定失败：回滚订单
          try {
            await db.collection('feedingOrders').doc(res._id).update({
              data: {
                status: 'cancelled',
                paymentStatus: 'refunded',
                updatedAt: db.serverDate(),
              },
            })
          } catch (rollbackErr) {
            logger.error('createFeedingOrder.couponRollback.failed', {
              orderId: res._id, msg: (rollbackErr as Error)?.message,
            })
            try {
              await recordAlert('critical', 'feeding.order.couponRollback.failed',
                '喂养订单锁定优惠券失败且回滚订单失败，需人工核对',
                {
                  orderId: res._id, orderNo, couponId,
                  error: (rollbackErr as Error)?.message,
                })
            } catch (_) { /* best-effort */ }
          }
          throw err('COUPON_LOCK_FAILED',
            lockRes && lockRes.message ? lockRes.message : '优惠券锁定失败')
        }

        // P0-A 修复：不再下单时立即 useCoupon（支付前核销）——
        //   原实现锁定后立刻置 used，支付失败/取消/超时后券已 used 不可退回（与 mall 原始 P1-1 同款）。
        //   现在券保持 locked，由 paymentService 支付成功回调（notify）统一核销（business='feeding'，已覆盖）；
        //   支付失败/取消/超时由取消/超时路径 unlockOrderCoupons(order._id, couponId) 解锁。
      } catch (lockErr) {
        // 锁定过程异常：先回滚订单，再抛出错误
        if ((lockErr as { code?: string }).code !== 'COUPON_LOCK_FAILED') {
          try {
            await db.collection('feedingOrders').doc(res._id).update({
              data: {
                status: 'cancelled',
                paymentStatus: 'refunded',
                updatedAt: db.serverDate(),
              },
            })
          } catch (rollbackErr) {
            logger.error('createFeedingOrder.couponRollback.failed', {
              orderId: res._id, msg: (rollbackErr as Error)?.message,
            })
          }
        }
        if ((lockErr as { code?: string }).code) { throw lockErr }
        throw err('COUPON_LOCK_FAILED', '优惠券锁定失败')
      }
    }

    return handleSuccess(
      { id: res._id, orderNo, totalAmount: order.totalAmount, originalAmount: order.originalAmount },
      '下单成功'
    )
  } catch (error) {
    if ((error as { code?: string }).code) { throw error }
    return handleError(error, '下单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 2: getFeedingOrders
// =====================================================================

export async function getFeedingOrders(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { page = 1, pageSize = 10, status } = event
  const where: Record<string, unknown> = { ownerId: openid }
  if (status) { where.status = status }

  const result = await paginate(db, 'feedingOrders', {
    page, pageSize, where, projection: FEEDING_ORDER_FIELDS,
  }) as PaginateResult<FeedingOrderRecord>

  await refreshPetAvatars(result.list)

  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 3: updateFeedingOrderStatus
// =====================================================================

export async function updateFeedingOrderStatus(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { orderId, status } = event
  const { openid } = auth
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }
  if (!status) { throw err('INVALID_PARAMS', '缺少状态') }

  // P2-4 修复：用户路径仅允许取消（未支付订单）；confirmed/in_progress/completed
  //   等业务状态推进收敛到平台后台（adminService.handleFeedingOrder），避免用户自行完成订单触发佣金。
  const VALID_STATUSES = ['cancelled']
  if (!VALID_STATUSES.includes(status)) { throw err('INVALID_PARAMS', '无效的状态值') }

  try {
    const orderRes = await db.collection('feedingOrders').doc(orderId).get()
    if (!orderRes.data) {
      throw err('NOT_FOUND', '订单不存在')
    }
    const order = orderRes.data as FeedingOrderRecord

    if (order.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权操作该订单')
    }

    // M6: 校验 paymentStatus，防止跨支付状态误操作
    //   - 未支付订单（paymentStatus=unpaid）：仅允许从 pending_payment → cancelled
    //   - 已支付订单（paymentStatus=paid）：允许推进业务状态（confirmed→in_progress→completed）
    //     不允许通过此接口取消已支付订单（需走退款流程，避免绕过资金流）
    //   - paymentStatus 异常（unknown/缺失）：拒绝状态变更，需人工核对
    const paymentStatus = String(order.paymentStatus || '').toLowerCase()
    if (paymentStatus !== 'unpaid' && paymentStatus !== 'paid') {
      try {
        await recordAlert('warning', 'feeding.updateStatus.invalidPaymentStatus',
          '喂养订单状态异常，paymentStatus 非 unpaid/paid',
          { orderId, currentStatus: order.status, paymentStatus })
      } catch (_) { /* best-effort */ }
      throw err('ORDER_STATUS_INVALID',
        `订单支付状态异常：${paymentStatus || '(空)'}`)
    }

    const allowedTransitions: Record<string, string[]> = {
      pending_payment: ['cancelled'],
    }

    const allowedNext = allowedTransitions[order.status || ''] || []
    if (!allowedNext.includes(status)) {
      throw err('BUSINESS_ERROR', '状态变更无效')
    }

    // M6: 已支付订单不允许通过此接口取消（必须走退款流程）
    if (status === 'cancelled' && paymentStatus === 'paid') {
      throw err('ORDER_STATUS_INVALID',
        '已支付订单无法直接取消，请申请退款')
    }
    // M6: 非取消状态变更需要订单已支付（confirmed/in_progress/completed 必须建立在已支付基础上）
    if (status !== 'cancelled' && paymentStatus !== 'paid') {
      throw err('ORDER_STATUS_INVALID',
        '订单尚未支付，无法推进业务状态')
    }

    await db.collection('feedingOrders').doc(orderId).update({
      data: { status, updatedAt: db.serverDate() },
    })

    if (status === 'completed') {
      // H1: 修复 totalPrice 覆盖 bug——直接传 order，totalAmount 已存在
      //   旧代码 { ...order, totalAmount: order.totalPrice } 会用 undefined 覆盖 totalAmount，导致佣金永远不触发
      try {
        await createCommissionRecord('feeding', order)
      } catch (commissionErr) {
        // M4: 佣金记录失败需告警（best-effort，不阻塞订单状态变更）
        logger.error('updateFeedingOrderStatus.createCommission.failed', {
          orderId, msg: (commissionErr as Error)?.message,
        })
        try {
          await recordAlert('critical', 'feeding.updateStatus.commission.failed',
            '喂养订单完成时佣金记录失败，需人工核对',
            {
              orderId, orderNo: order.orderNo, ownerId: order.ownerId,
              totalAmount: order.totalAmount,
              error: (commissionErr as Error)?.message,
            })
        } catch (_) { /* best-effort */ }
      }
    }

    // H2 配套：取消未支付订单时解锁优惠券（lockCoupon 的逆操作）
    if (status === 'cancelled' && paymentStatus === 'unpaid' && order.couponId) {
      try {
        await cloud.callFunction({
          name: 'couponService',
          data: {
            action: 'unlockCoupon',
            couponId: order.couponId,
          },
        })
        logger.info('updateFeedingOrderStatus.unlockCoupon.success', {
          orderId, couponId: order.couponId,
        })
      } catch (unlockErr) {
        // 解锁失败不阻塞取消流程，但需告警（券可能已被其他流程处理）
        logger.warn('updateFeedingOrderStatus.unlockCoupon.failed', {
          orderId, couponId: order.couponId,
          msg: (unlockErr as Error)?.message,
        })
        try {
          await recordAlert('warning', 'feeding.cancel.unlockCoupon.failed',
            '喂养订单取消时解锁优惠券失败，需人工核对',
            {
              orderId, couponId: order.couponId,
              error: (unlockErr as Error)?.message,
            })
        } catch (_) { /* best-effort */ }
      }
    }

    return handleSuccess(null, '状态更新成功')
  } catch (error) {
    if ((error as { code?: string }).code) { throw error }
    return handleError(error, '更新状态失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 4: getOrderStatus
// =====================================================================

export async function getOrderStatus(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { orderId } = event
  const { openid } = auth
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  try {
    const orderRes = await db.collection('feedingOrders').doc(orderId).get()
    if (!orderRes.data) {
      throw err('NOT_FOUND', '订单不存在')
    }
    const order = orderRes.data as FeedingOrderRecord
    if (order.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权查看该订单')
    }

    await refreshPetAvatars([order])

    return handleSuccess({
      ...order,
      status: order.status,
      paymentStatus: order.paymentStatus || '',
      totalPrice: order.totalAmount || order.totalPrice || 0,
      tip: STATUS_TIPS[order.status || ''] || { title: '未知状态', subtitle: '', icon: '' },
    }, '获取成功')
  } catch (error) {
    if ((error as { code?: string }).code) { throw error }
    return handleError(error, '获取订单状态失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 5: getFeedingOrderDetail（仅限订单归属人；平台侧请走 adminService 对应接口）
// =====================================================================

export async function getFeedingOrderDetail(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { orderId } = event
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const orderRes = await db.collection('feedingOrders').doc(orderId).get()
  if (!orderRes.data) {
    throw err('ORDER_NOT_FOUND', '订单不存在', { orderId })
  }
  const order = orderRes.data as FeedingOrderRecord
  // P2-2 修复：越权防护——非订单归属人不可读取（含地址/电话/宠物等 PII）
  if (order.ownerId !== openid) {
    throw err('PERMISSION_DENIED', '无权查看该订单')
  }
  await refreshPetAvatars([order])
  return handleSuccess({ ...order }, '获取成功')
}

// =====================================================================
// Handlers 聚合
// =====================================================================

export const handlers: Record<string, FeedingActionHandler> = {
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeedingOrderDetail,
}

// =====================================================================
// Main 入口
// =====================================================================

export async function main(
  event: CloudEvent,
  context: CloudContext
): Promise<unknown> {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const AUTH_REQUIRED_ACTIONS: string[] = [
    'createFeedingOrder', 'updateFeedingOrderStatus',
    'getFeedingOrders', 'getOrderStatus', 'getFeedingOrderDetail',
  ]
  const requireLogin = AUTH_REQUIRED_ACTIONS.includes(action)

  try {
    const auth = await verifyAuth(event, { requireLogin }) as AuthLike
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    const code = (error as { code?: string }).code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message, code)
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeedingOrderDetail,
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeedingOrderDetail,
  handlers,
}
