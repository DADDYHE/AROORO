/**
 * feedingService/index.ts - 喂养服务主入口（TypeScript 源文件 - Sprint 41 迁移）
 *
 * 业务功能：
 *   - 喂养师管理（CRUD + 列表筛选）
 *   - 喂养下单（多宠物 + 上门 + 钥匙 + 熟悉度 + 多次访问）
 *   - 订单管理（我的订单 / 详情 / 状态流转 / 喂养师视角订单）
 *   - 佣金记录（status=completed 触发）
 *
 * 共 12 个 action：
 *   1. getFeederList - 喂养师列表
 *   2. getFeederDetail - 喂养师详情
 *   3. createFeederProfile - 创建喂养师档案
 *   4. updateFeederProfile - 更新喂养师档案
 *   5. createFeedingOrder - 创建喂养订单
 *   6. getFeedingOrders - 我的喂养订单
 *   7. getOrderStatus - 获取订单状态
 *   8. updateFeedingOrderStatus - 更新订单状态
 *   9. getFeederOrders - 喂养师视角订单列表
 *  10. getFeedingOrderDetail - 喂养师视角订单详情
 *  11. handleFeedingOrder - 喂养师接单/完成操作
 *  12. getCurrentFeeder - 获取当前用户喂养师档案
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
  feederId?: string
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
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, toResponse, isBusinessError } = require('./common/errors')
// H1+H3+M1: 改用公共 commission-utils 模块（含自购防护 P0-8、整数分计算、cancelCommissionRecord 配套）
//   旧实现存在 3 个问题：
//   - H1: 调用处传入 { ...order, totalAmount: order.totalPrice }，totalPrice 为 undefined 覆盖了 totalAmount，佣金永远不触发
//   - H3: 缺少自购订单防护（inviterId === ownerId）
//   - M1: 重复实现，维护成本高
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
// 字段投影常量
// =====================================================================

const FEEDER_LIST_FIELDS: Record<string, boolean> = {
  _id: true, realName: true, nickname: true, avatarUrl: true, address: true,
  pricePerVisit: true, orderCount: true,
  serviceTags: true, serviceTypes: true, status: true, description: true,
  phone: true, gender: true, createdAt: true, beautyInfo: true,
}

const FEEDING_ORDER_FIELDS: Record<string, boolean> = {
  _id: true, orderNo: true, orderType: true, feederId: true, ownerId: true, petIds: true,
  petDetails: true, petServices: true,
  startDate: true, endDate: true, visitTimes: true,
  address: true, notes: true,
  keyMethod: true, visitTime: true, feederGender: true,
  familiarity: true, familiarityText: true, familiarityDates: true,
  multiVisit: true, multiVisitText: true, multiVisitDates: true,
  totalAmount: true, originalAmount: true, couponId: true, couponDiscount: true,
  status: true, paymentStatus: true, createdAt: true, updatedAt: true,
}

// =====================================================================
// 辅助函数：合作伙伴权限校验
// =====================================================================

async function checkPartnerPermission(openid: string, permission: string): Promise<AdminRecord> {
  let admin: AdminRecord | null = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data || null
  } catch (e) {
    admin = null
  }
  if (!admin || admin.status !== 'active') {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }
  const roles = admin.roles || []
  if (roles.includes('super_admin')) { return admin }
  const perms = admin.permissions || []
  if (!perms.includes(permission)) {
    throw err('PERMISSION_DENIED', `权限不足：需要 ${permission} 权限`)
  }
  return admin
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
// Handler 1: getFeederList
// =====================================================================

export async function getFeederList(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { page = 1, pageSize = 10, location, serviceType } = event

  let whereQuery: Record<string, unknown>
  if (serviceType === 'beauty') {
    const beautyCondition = _.or(
      { serviceTypes: _.in(['beauty']) },
      { serviceTags: _.in(['美容造型']) }
    )
    if (location) {
      whereQuery = _.and(
        { status: 'active', serviceArea: _.in([location]) },
        beautyCondition
      ) as unknown as Record<string, unknown>
    } else {
      whereQuery = _.and(
        { status: 'active' },
        beautyCondition
      ) as unknown as Record<string, unknown>
    }
  } else {
    whereQuery = { status: 'active' }
    if (location) { whereQuery.serviceArea = _.in([location]) }
    if (serviceType) { whereQuery.serviceTypes = _.in([serviceType]) }
  }

  const countResult = await db.collection('feeders').where(whereQuery).count()
  const offset = (page - 1) * pageSize
  const dataResult = await db.collection('feeders')
    .where(whereQuery)
    .field(FEEDER_LIST_FIELDS)
    .orderBy('rating', 'desc')
    .skip(offset)
    .limit(pageSize)
    .get()

  const result: PaginateResult<FeederRecord> = {
    list: (dataResult.data || []) as FeederRecord[],
    total: countResult.total,
    page,
    pageSize,
    totalPages: Math.ceil(countResult.total / pageSize),
    hasNext: page * pageSize < countResult.total,
  }
  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 2: getFeederDetail
// =====================================================================

export async function getFeederDetail(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { feederId } = event
  if (!feederId) { throw err('INVALID_PARAMS', '缺少喂养师ID') }

  try {
    const res = await db.collection('feeders').doc(feederId).get()
    return handleSuccess(res.data, '获取成功')
  } catch (error) {
    return handleError(error, '喂养师不存在', ERROR_CODES.NOT_FOUND)
  }
}

// =====================================================================
// Handler 3: createFeederProfile
// =====================================================================

export async function createFeederProfile(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { name, avatarUrl, phone, description, serviceArea, pricePerVisit, certifications } = event
  if (!name) { throw err('INVALID_PARAMS', '缺少喂养师名称') }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    throw err('INVALID_PARAMS', '手机号格式不正确')
  }

  const feeder: FeederRecord = {
    name,
    avatarUrl: avatarUrl || '',
    phone: phone || '',
    description: description || '',
    serviceArea: serviceArea || [],
    pricePerVisit: Number(pricePerVisit) || 0,
    certifications: certifications || [],
    rating: 0,
    orderCount: 0,
    status: 'pending_review',
    createdBy: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  feeder._id = generateId('feeder', openid)
  const res = await db.collection('feeders').add({ data: feeder })
  return handleSuccess({ id: res._id }, '创建成功')
}

// =====================================================================
// Handler 4: updateFeederProfile
// =====================================================================

export async function updateFeederProfile(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { feederId } = event
  const { openid } = auth
  if (!feederId) { throw err('INVALID_PARAMS', '缺少喂养师ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const updateData: Record<string, unknown> = {
    updatedAt: db.serverDate(),
    ...filterFields(FIELD_WHITELISTS.feeder, event),
  }

  const existRes = await db.collection('feeders').doc(feederId).get()
  const existData = existRes.data as FeederRecord | null
  if (existData && existData.createdBy !== openid) {
    try {
      await checkPartnerPermission(openid, 'feeding')
    } catch (e) {
      throw err('PERMISSION_DENIED', '无权修改此喂养师档案')
    }
  }

  await db.collection('feeders').doc(feederId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

// =====================================================================
// Handler 5: createFeedingOrder
// =====================================================================

export async function createFeedingOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const {
    feederId, petIds, startDate, endDate, visitTimes, address, notes,
    keyMethod, visitTime, feederGender,
    familiarity, familiarityText, familiarityDates,
    multiVisit, multiVisitText, multiVisitDates,
    petDetails, petServices,
    totalAmount, originalAmount, couponId, couponDiscount,
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
  //   - 类型 feeding_order：每用户每分钟 6 次，同一喂养师每分钟 3 次
  //   - 超限抛出 RATE_LIMITED（HTTP 429）
  try {
    await withRateLimit(
      { userId: openid, type: 'feeding_order', targetId: feederId || 'default' },
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
    let feederInfo: FeederRecord = {}
    if (feederId) {
      try {
        const feederRes = await db.collection('feeders').doc(feederId).get()
        feederInfo = (feederRes.data as FeederRecord) || {}
      } catch (e) {
        feederInfo = {}
      }
    }

    // P0-5: 服务端重算订单金额，不信任客户端 totalAmount（防止价格篡改）
    const pricePerVisit = Number(feederInfo.pricePerVisit) || 0
    const visitCount = Array.isArray(visitTimes) ? visitTimes.length : 1
    const petCount = Array.isArray(petIds) ? petIds.length : 1
    const multiVisitFactor = Number(multiVisit) > 0 ? Number(multiVisit) : 1
    // 单次上门 × 宠物数 × 访问次数 × 多次访问因子
    const calculatedAmount = Math.round(pricePerVisit * 100 * visitCount * petCount * multiVisitFactor) / 100
    const couponDiscountNum = Number(couponDiscount) || 0
    const finalAmount = Math.max(0, Math.round((calculatedAmount - couponDiscountNum) * 100) / 100)

    const orderNo = `FD${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    const order: FeedingOrderRecord = {
      orderNo,
      orderType: 'feeding',
      ownerId: openid,
      feederId: feederId || '',
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
      feederGender: feederGender || '',
      familiarity: familiarity || '',
      familiarityText: familiarityText || '',
      familiarityDates: familiarityDates || [],
      multiVisit: Number(multiVisit) || 0,
      multiVisitText: multiVisitText || '',
      multiVisitDates: multiVisitDates || [],
      // P0-5: 使用服务端计算的金额，忽略客户端 totalAmount
      totalAmount: finalAmount,
      originalAmount: calculatedAmount,
      couponId: couponId || '',
      couponDiscount: couponDiscountNum,
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

    return handleSuccess({ id: res._id, orderNo, totalAmount: order.totalAmount }, '下单成功')
  } catch (error) {
    if ((error as { code?: string }).code) { throw error }
    return handleError(error, '下单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 6: getFeedingOrders
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
// Handler 7: updateFeedingOrderStatus
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

  const VALID_STATUSES = ['confirmed', 'in_progress', 'completed', 'cancelled']
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
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
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
// Handler 8: getOrderStatus
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

    let feederInfo: FeederInfo = { feederName: '', feederPhone: '', feederAvatar: '' }
    if (order.feederId) {
      try {
        const feederRes = await db.collection('feeders').doc(order.feederId).get()
        const feederData = feederRes.data as FeederRecord | null
        feederInfo = {
          feederName: feederData?.name || feederData?.realName || '',
          feederPhone: feederData?.phone || '',
          feederAvatar: feederData?.avatarUrl || '',
        }
      } catch (e) {
        feederInfo = { feederName: '', feederPhone: '', feederAvatar: '' }
      }
    }

    await refreshPetAvatars([order])

    return handleSuccess({
      ...order,
      status: order.status,
      paymentStatus: order.paymentStatus || '',
      totalPrice: order.totalAmount || order.totalPrice || 0,
      feederName: feederInfo.feederName,
      feederPhone: feederInfo.feederPhone,
      feederAvatar: feederInfo.feederAvatar,
      tip: STATUS_TIPS[order.status || ''] || { title: '未知状态', subtitle: '', icon: '' },
    }, '获取成功')
  } catch (error) {
    if ((error as { code?: string }).code) { throw error }
    return handleError(error, '获取订单状态失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 9: getFeederOrders
// =====================================================================

export async function getFeederOrders(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { status, page = 1, pageSize = 10 } = event
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  await checkPartnerPermission(openid, 'feeding')
  const feederRes = await db.collection('feeders')
    .where({ createdBy: openid })
    .field({ _id: true })
    .limit(100)
    .get()
  const feederIds: string[] = ((feederRes.data || []) as FeederRecord[]).map((f) => f._id || '').filter(Boolean)
  if (feederIds.length === 0) {
    return handleSuccess({ list: [], total: 0, page, pageSize, totalPages: 0, hasNext: false }, '获取成功')
  }
  const where: Record<string, unknown> = { feederId: _.in(feederIds) }
  if (status) { where.status = status }
  const result = await paginate(db, 'feedingOrders', {
    page, pageSize, where, projection: FEEDING_ORDER_FIELDS,
  }) as PaginateResult<FeedingOrderRecord>

  await refreshPetAvatars(result.list)

  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 10: getFeedingOrderDetail
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

  await checkPartnerPermission(openid, 'feeding')
  const orderRes = await db.collection('feedingOrders').doc(orderId).get()
  if (!orderRes.data) {
    throw err('ORDER_NOT_FOUND', '订单不存在', { orderId })
  }
  const order = orderRes.data as FeedingOrderRecord
  await refreshPetAvatars([order])
  return handleSuccess({ ...order }, '获取成功')
}

// =====================================================================
// Handler 11: handleFeedingOrder
// =====================================================================

export async function handleFeedingOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { orderId, operation } = event
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  if (!operation) {
    throw err('INVALID_PARAMS', '缺少操作类型')
  }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  await checkPartnerPermission(openid, 'feeding')
  const OPERATION_MAP: Record<string, string> = { confirm: 'confirmed', complete: 'completed' }
  const targetStatus = OPERATION_MAP[operation]
  if (!targetStatus) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }
  const orderRes = await db.collection('feedingOrders').doc(orderId).get()
  if (!orderRes.data) {
    throw err('ORDER_NOT_FOUND', '订单不存在', { orderId })
  }
  const order = orderRes.data as FeedingOrderRecord
  // M6 配套：handleFeedingOrder 也需校验 paymentStatus
  //   - confirm（接单）：要求订单已支付（paymentStatus=paid）
  //   - complete（完成）：要求订单已支付
  //   - paymentStatus 异常：告警并拒绝
  const paymentStatus = String(order.paymentStatus || '').toLowerCase()
  if (paymentStatus !== 'paid') {
    try {
      await recordAlert('warning', 'feeding.handleOrder.invalidPaymentStatus',
        '喂养师操作订单时 paymentStatus 异常',
        { orderId, operation, currentStatus: order.status, paymentStatus, operator: openid })
    } catch (_) { /* best-effort */ }
    throw err('ORDER_STATUS_INVALID',
      `订单支付状态异常（${paymentStatus || '(空)'}），无法执行操作`)
  }
  const TRANSITIONS: Record<string, string[]> = {
    pending_payment: ['confirmed'],
    confirmed: ['completed'],
    in_progress: ['completed'],
  }
  const allowed = TRANSITIONS[order.status || ''] || []
  if (!allowed.includes(targetStatus)) {
    throw err('ORDER_STATUS_INVALID', `无法从 ${order.status} 变更为 ${targetStatus}`, { from: order.status, to: targetStatus })
  }
  await db.collection('feedingOrders').doc(orderId).update({
    data: { status: targetStatus, updatedAt: db.serverDate() },
  })
  if (targetStatus === 'completed') {
    // H1: 修复 totalPrice 覆盖 bug——直接传 order，totalAmount 已存在
    try {
      await createCommissionRecord('feeding', order)
    } catch (commissionErr) {
      // M4: 佣金记录失败需告警（best-effort，不阻塞订单状态变更）
      logger.error('handleFeedingOrder.createCommission.failed', {
        orderId, msg: (commissionErr as Error)?.message,
      })
      try {
        await recordAlert('critical', 'feeding.handleOrder.commission.failed',
          '喂养订单完成时佣金记录失败，需人工核对',
          {
            orderId, orderNo: order.orderNo, ownerId: order.ownerId,
            totalAmount: order.totalAmount,
            error: (commissionErr as Error)?.message,
          })
      } catch (_) { /* best-effort */ }
    }
  }
  return handleSuccess(null, '操作成功')
}

// =====================================================================
// Handler 12: getCurrentFeeder
// =====================================================================

export async function getCurrentFeeder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { serviceType } = event
  const where: Record<string, unknown> = { createdBy: openid }
  if (serviceType) { where.serviceTypes = _.in([serviceType]) }
  const feederRes = await db.collection('feeders')
    .where(where)
    .limit(1)
    .get()
  if (!feederRes.data || feederRes.data.length === 0) {
    return handleSuccess(null, '未找到喂养师档案')
  }
  return handleSuccess(feederRes.data[0], '获取成功')
}

// =====================================================================
// Handlers 聚合
// =====================================================================

export const handlers: Record<string, FeedingActionHandler> = {
  getFeederList,
  getFeederDetail,
  createFeederProfile,
  updateFeederProfile,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeederOrders,
  getFeedingOrderDetail,
  handleFeedingOrder,
  getCurrentFeeder,
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
    'createFeederProfile', 'updateFeederProfile', 'createFeedingOrder',
    'updateFeedingOrderStatus', 'getFeedingOrders', 'getOrderStatus',
    'getFeederOrders', 'getFeedingOrderDetail', 'handleFeedingOrder', 'getCurrentFeeder',
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
  getFeederList,
  getFeederDetail,
  createFeederProfile,
  updateFeederProfile,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeederOrders,
  getFeedingOrderDetail,
  handleFeedingOrder,
  getCurrentFeeder,
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getFeederList,
  getFeederDetail,
  createFeederProfile,
  updateFeederProfile,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeederOrders,
  getFeedingOrderDetail,
  handleFeedingOrder,
  getCurrentFeeder,
  handlers,
}
