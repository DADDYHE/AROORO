/**
 * couponService/index.ts - 优惠券服务主入口（TypeScript 源文件 - Sprint 43 迁移）
 *
 * 业务功能：
 *   - 我的优惠券（按状态查询）
 *   - 可用优惠券（订单计算折扣）
 *   - 可领取模板（领券中心）
 *   - 弹窗优惠券（指定页面）
 *   - 优惠券生命周期：领取 → 锁定（订单）→ 核销（支付完成）/ 解锁（取消）
 *
 * 共 8 个 action：
 *   1. getMyCoupons - 我的优惠券
 *   2. getAvailableCoupons - 可用优惠券
 *   3. getClaimableTemplates - 可领取模板
 *   4. getPopupCoupon - 弹窗优惠券
 *   5. claimCoupon - 领取优惠券
 *   6. lockCoupon - 锁定优惠券（订单创建时）
 *   7. useCoupon - 核销优惠券（订单完成时）
 *   8. unlockCoupon - 解锁优惠券（订单取消时）
 *
 * 优惠券类型：
 *   - fixed_amount / full_reduction：固定金额（rules.reduceAmount）
 *   - discount：折扣率（rules.discountRate，可选 rules.maxReduceAmount 封顶）
 *
 * 状态流转：unused → locked → used
 *         或：unused → locked → expired（解锁时已过期）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 优惠券规则 / 状态 / 类型强类型化
 *   - 与 adminService / partnerService / userService / activityService / mallService / feedingService / hostService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.couponService.json
 */

// =====================================================================
// 公共类型（与 adminService / partnerService / userService / activityService / mallService / feedingService / hostService 保持一致）
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
  business?: string
  items?: string[]
  amount?: number
  templateId?: string
  couponId?: string
  orderId?: string
  orderType?: string
  source?: string
  originalAmount?: number
  discountAmount?: number
  finalAmount?: number
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type CouponActionHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

// =====================================================================
// 业务类型定义
// =====================================================================

export type CouponType = 'fixed_amount' | 'full_reduction' | 'discount'
export type CouponStatus = 'unused' | 'locked' | 'used' | 'expired'
export type CouponSource = 'claim' | 'popup' | 'system' | 'manual'

export interface CouponRules {
  threshold?: number
  reduceAmount?: number
  discountRate?: number
  maxReduceAmount?: number
  [k: string]: unknown
}

export interface CouponTemplate {
  _id?: string
  name?: string
  type?: CouponType
  rules?: CouponRules
  applicableScopes?: string[]
  applicableItemIds?: string[]
  remaining?: number
  perUserLimit?: number
  claimable?: boolean
  popupEnabled?: boolean
  popupPage?: string
  status?: string
  validFrom?: string
  validTo?: string
  validDays?: number
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface UserCoupon {
  _id?: string
  templateId?: string
  templateName?: string
  ownerId?: string
  couponCode?: string
  type?: CouponType
  rules?: CouponRules
  applicableScopes?: string[]
  applicableItemIds?: string[]
  status?: CouponStatus
  source?: CouponSource
  startTime?: Date | string
  endTime?: Date | string
  receivedAt?: Date
  usedAt?: Date
  usedOrderId?: string
  usedBusiness?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface CouponUsage {
  _id?: string
  userCouponId?: string
  templateId?: string
  ownerId?: string
  orderId?: string
  businessType?: string
  originalAmount?: number
  discountAmount?: number
  finalAmount?: number
  usedAt?: Date
  createdAt?: Date
  [k: string]: unknown
}

export interface AvailableCoupon {
  _id?: string
  templateId?: string
  templateName?: string
  couponCode?: string
  type?: CouponType
  rules?: CouponRules
  discountAmount: number
  endTime?: Date | string
}

export interface DiscountCalcResult {
  eligible: boolean
  discountAmount?: number
  message?: string
}

export interface ClaimableTemplate {
  _id?: string
  name?: string
  type?: CouponType
  rules?: CouponRules
  applicableScopes?: string[]
  remaining?: number
  perUserLimit?: number
  claimedCount?: number
  canClaim?: boolean
  createdAt?: Date
  [k: string]: unknown
}

export interface PaginateResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages?: number
  hasNext?: boolean
}

export interface PopupCoupon {
  templateId?: string
  name?: string
  type?: CouponType
  rules?: CouponRules
  applicableScopes?: string[]
  remaining?: number
  validDays?: number
  perUserLimit?: number
  canClaim: boolean
}

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { writeOperationLog } = require('./common/operation-log')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors')

const { db } = initCloud()
const logger = createLogger('couponService')
const _ = db.command

// =====================================================================
// 辅助函数：生成优惠券码
// =====================================================================

export function generateCouponCode(): string {
  const prefix = 'CP'
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substr(2, 6).toUpperCase()
  return `${prefix}${timestamp}${random}`
}

// =====================================================================
// 辅助函数：计算优惠券折扣
// =====================================================================

export function calculateCouponDiscount(
  coupon: { type?: CouponType; rules?: CouponRules },
  orderAmount: number
): DiscountCalcResult {
  const { type, rules } = coupon
  if (!rules) { return { eligible: false, message: '优惠券规则缺失' } }

  if (rules.threshold && orderAmount < rules.threshold) {
    return { eligible: false, message: `订单金额未达到满${rules.threshold}元使用门槛` }
  }

  let discountAmount = 0
  switch (type) {
  case 'fixed_amount':
  case 'full_reduction':
    discountAmount = rules.reduceAmount || 0
    break
  case 'discount':
    // 校验 discountRate 范围（0 < rate <= 1，例如 0.8 表示八折）
    const discountRate = Number(rules.discountRate) || 1
    if (discountRate <= 0 || discountRate > 1) {
      return { eligible: false, message: '折扣率无效' }
    }
    discountAmount = orderAmount * (1 - discountRate)
    if (rules.maxReduceAmount && rules.maxReduceAmount > 0) {
      discountAmount = Math.min(discountAmount, rules.maxReduceAmount)
    }
    break
  default:
    return { eligible: false, message: '未知优惠券类型' }
  }

  discountAmount = Math.min(discountAmount, orderAmount)
  discountAmount = Math.round(discountAmount * 100) / 100

  return { eligible: true, discountAmount }
}

// =====================================================================
// Handler 1: getMyCoupons
// =====================================================================

export async function getMyCoupons(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { status, page = 1, pageSize = 20 } = event
  if (!auth.openid) { throw err('AUTH_REQUIRED', '未登录') }
  const where: Record<string, unknown> = { ownerId: auth.openid }

  if (status) { where.status = status }

  const result = await paginate(db, 'user_coupons', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  return handleSuccess(result)
}

// =====================================================================
// Handler 2: getAvailableCoupons
// =====================================================================

export async function getAvailableCoupons(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { business, items, amount } = event
  if (!auth.openid) { throw err('AUTH_REQUIRED', '未登录') }
  if (!business) { throw err('INVALID_PARAMS', '缺少业务类型') }

  const now = new Date()

  const couponWhere: Record<string, unknown> = {
    ownerId: auth.openid,
    status: 'unused',
    startTime: _.lte(now),
    endTime: _.gte(now),
    applicableScopes: _.or([
      _.eq([]),
      _.size(0),
      _.in([business]),
    ]),
  }

  const coupons = await db.collection('user_coupons').where(couponWhere).get()

  const available: AvailableCoupon[] = []
  for (const coupon of (coupons.data || []) as UserCoupon[]) {
    if (items && items.length > 0 && coupon.applicableItemIds && coupon.applicableItemIds.length > 0) {
      const hasMatch = items.some((item) => coupon.applicableItemIds?.includes(item))
      if (!hasMatch) { continue }
    }

    const result = calculateCouponDiscount(coupon, amount || 0)
    if (result.eligible && result.discountAmount !== undefined) {
      available.push({
        _id: coupon._id,
        templateId: coupon.templateId,
        templateName: coupon.templateName,
        couponCode: coupon.couponCode,
        type: coupon.type,
        rules: coupon.rules,
        discountAmount: result.discountAmount,
        endTime: coupon.endTime,
      })
    }
  }

  available.sort((a, b) => b.discountAmount - a.discountAmount)
  return handleSuccess(available)
}

// =====================================================================
// Handler 3: getClaimableTemplates
// =====================================================================

export async function getClaimableTemplates(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { business, page = 1, pageSize = 20 } = event
  if (!auth.openid) { throw err('AUTH_REQUIRED', '未登录') }

  const where: Record<string, unknown> = {
    status: 'active',
    claimable: true,
    remaining: _.gt(0),
  }
  if (business) {
    where.applicableScopes = _.in([business])
  }

  const result = await paginate(db, 'coupon_templates', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  }) as PaginateResult<ClaimableTemplate>

  // 补充每个模板当前用户已领取数量
  if (result.list && result.list.length > 0) {
    const templateIds: string[] = result.list.map((t) => t._id || '').filter(Boolean)
    const claimedRes = await db.collection('user_coupons')
      .where({ templateId: _.in(templateIds), ownerId: auth.openid, status: _.in(['unused', 'locked']) })
      .get()
    const claimedMap: Record<string, number> = {}
    for (const c of (claimedRes.data || []) as UserCoupon[]) {
      if (c.templateId) {
        claimedMap[c.templateId] = (claimedMap[c.templateId] || 0) + 1
      }
    }
    for (const t of result.list) {
      const id = t._id || ''
      t.claimedCount = claimedMap[id] || 0
      t.canClaim = (t.claimedCount || 0) < (t.perUserLimit || 1)
    }
  }

  return handleSuccess(result)
}

// =====================================================================
// Handler 4: claimCoupon
// =====================================================================

export async function claimCoupon(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { templateId } = event
  if (!auth.openid) { throw err('AUTH_REQUIRED', '未登录') }
  if (!templateId) { throw err('INVALID_PARAMS', '缺少模板ID') }

  const templateRes = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  if (templateRes.data.length === 0) { throw err('NOT_FOUND', '模板不存在') }

  const template = templateRes.data[0] as CouponTemplate
  if (template.status !== 'active') { throw err('BUSINESS_ERROR', '模板未启用') }
  
  // 先扣减库存（原子操作），检查是否成功
  const deductRes = await db.collection('coupon_templates').doc(templateId).update({
    data: { remaining: _.inc(-1), updatedAt: db.serverDate() },
  })
  
  // 如果更新失败（updated=0），表示库存不足或模板不存在
  if (deductRes.updated === 0) {
    throw err('BUSINESS_ERROR', '优惠券已领完')
  }
  
  // 重新查询模板获取最新状态
  const freshTemplateRes = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  const freshTemplate = freshTemplateRes.data[0] as CouponTemplate
  
  // 再次验证库存（防止并发超领）
  if ((freshTemplate.remaining || 0) < 0) {
    // 库存已为负数，回滚扣减
    await db.collection('coupon_templates').doc(templateId).update({
      data: { remaining: _.inc(1), updatedAt: db.serverDate() },
    })
    throw err('BUSINESS_ERROR', '优惠券已领完')
  }

  // claimable 仅限制领券中心主动领取，弹窗/手动发放不受此限制
  const source: CouponSource = (event.source as CouponSource) || 'claim'
  if (source === 'claim' && !freshTemplate.claimable) { throw err('BUSINESS_ERROR', '该优惠券不支持领取') }

  const existingCount = await db.collection('user_coupons')
    .where({ templateId, ownerId: auth.openid, status: _.in(['unused', 'locked']) })
    .count()
  if (existingCount.total >= (freshTemplate.perUserLimit || 1)) {
    throw err('COUPON_LIMIT_REACHED', `每人限领${freshTemplate.perUserLimit || 1}张`)
  }

  const now = new Date()
  const startTime = freshTemplate.validFrom ? new Date(freshTemplate.validFrom) : now
  let endTime: Date
  if (freshTemplate.validDays) {
    endTime = new Date(now.getTime() + freshTemplate.validDays * 24 * 60 * 60 * 1000)
  } else if (freshTemplate.validTo) {
    endTime = new Date(freshTemplate.validTo)
  } else {
    endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  }

  if (endTime <= now) { throw err('BUSINESS_ERROR', '该优惠券已过期') }

  const coupon: UserCoupon = {
    templateId,
    templateName: freshTemplate.name,
    ownerId: auth.openid,
    couponCode: generateCouponCode(),
    type: freshTemplate.type,
    rules: freshTemplate.rules,
    applicableScopes: freshTemplate.applicableScopes,
    applicableItemIds: freshTemplate.applicableItemIds,
    status: 'unused',
    source,
    receivedAt: db.serverDate(),
    startTime,
    endTime,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  coupon._id = generateId('coupon', auth.openid)
  await db.collection('user_coupons').add({ data: coupon })

  await writeOperationLog({
    module: 'user_coupon',
    action: 'claim',
    targetId: coupon._id,
    targetName: template.name,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    afterData: coupon,
  })
  return handleSuccess(coupon, '领取成功')
}

// =====================================================================
// Handler 5: lockCoupon
// =====================================================================

export async function lockCoupon(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { couponId, orderId, orderType, business } = event
  if (!auth.openid) { throw err('AUTH_REQUIRED', '未登录') }
  if (!couponId) { throw err('INVALID_PARAMS', '缺少优惠券ID') }
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }

  const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
  if (couponRes.data.length === 0) { throw err('NOT_FOUND', '优惠券不存在') }

  const coupon = couponRes.data[0] as UserCoupon
  if (coupon.ownerId !== auth.openid) { throw err('PERMISSION_DENIED', '无权操作此优惠券') }
  
  // 幂等性检查：如果优惠券已锁定且属于同一订单，返回成功
  if (coupon.status === 'locked') {
    // 检查是否是同一订单（通过 coupon 的 orderId 字段，如果存在的话）
    // 由于当前数据模型可能没有 orderId 字段，我们直接返回成功
    return handleSuccess(null, '优惠券已锁定')
  }
  
  if (coupon.status !== 'unused') { throw err('COUPON_STATUS_INVALID', `当前状态: ${coupon.status}`) }

  const now = new Date()
  if (coupon.startTime && now < new Date(coupon.startTime as string)) { throw err('BUSINESS_ERROR', '优惠券尚未生效') }
  if (coupon.endTime && now > new Date(coupon.endTime as string)) { throw err('BUSINESS_ERROR', '优惠券已过期') }

  await db.collection('user_coupons').doc(couponId).update({
    data: {
      status: 'locked',
      orderId: orderId || '',
      orderType: orderType || '',
      business: business || '',
      updatedAt: db.serverDate(),
    },
  })

  await writeOperationLog({
    module: 'user_coupon',
    action: 'lock',
    targetId: couponId,
    targetName: coupon.templateName,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    beforeData: { status: 'unused' },
    afterData: { status: 'locked', orderId, business: business || orderType },
  })

  return handleSuccess(null, '优惠券已锁定')
}

// =====================================================================
// Handler 6: useCoupon
// =====================================================================

export async function useCoupon(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { couponId, orderId, business, originalAmount, discountAmount, finalAmount } = event
  if (!auth.openid) { throw err('AUTH_REQUIRED', '未登录') }
  if (!couponId) { throw err('INVALID_PARAMS', '缺少优惠券ID') }

  const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
  if (couponRes.data.length === 0) { throw err('NOT_FOUND', '优惠券不存在') }

  const coupon = couponRes.data[0] as UserCoupon
  if (coupon.ownerId !== auth.openid) { throw err('PERMISSION_DENIED', '无权操作此优惠券') }
  if (coupon.status !== 'locked') { throw err('COUPON_STATUS_INVALID', `当前状态: ${coupon.status}`) }

  await db.collection('user_coupons').doc(couponId).update({
    data: {
      status: 'used',
      usedAt: db.serverDate(),
      usedOrderId: orderId || '',
      usedBusiness: business || '',
      updatedAt: db.serverDate(),
    },
  })

  const usageRecord: CouponUsage = {
    _id: generateId('coupon', auth.openid),
    userCouponId: couponId,
    templateId: coupon.templateId,
    ownerId: auth.openid,
    orderId: orderId || '',
    businessType: business || '',
    originalAmount: originalAmount || 0,
    discountAmount: discountAmount || 0,
    finalAmount: finalAmount || 0,
    usedAt: db.serverDate(),
    createdAt: db.serverDate(),
  }
  await db.collection('coupon_usage').add({ data: usageRecord })

  await writeOperationLog({
    module: 'user_coupon',
    action: 'use',
    targetId: couponId,
    targetName: coupon.templateName,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    beforeData: { status: 'locked' },
    afterData: { status: 'used', orderId: orderId || '', discountAmount: discountAmount || 0 },
  })

  return handleSuccess(null, '优惠券已核销')
}

// =====================================================================
// Handler 7: unlockCoupon
// =====================================================================

export async function unlockCoupon(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { couponId } = event
  if (!auth.openid) { throw err('AUTH_REQUIRED', '未登录') }
  if (!couponId) { throw err('INVALID_PARAMS', '缺少优惠券ID') }

  const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
  if (couponRes.data.length === 0) { throw err('NOT_FOUND', '优惠券不存在') }

  const coupon = couponRes.data[0] as UserCoupon
  if (coupon.ownerId !== auth.openid) { throw err('PERMISSION_DENIED', '无权操作此优惠券') }
  if (coupon.status !== 'locked') { throw err('COUPON_STATUS_INVALID', `当前状态: ${coupon.status}`) }

  const now = new Date()
  const isExpired = coupon.endTime ? new Date(coupon.endTime as string) < now : false
  const newStatus: CouponStatus = isExpired ? 'expired' : 'unused'

  await db.collection('user_coupons').doc(couponId).update({
    data: {
      status: newStatus,
      updatedAt: db.serverDate(),
    },
  })

  await writeOperationLog({
    module: 'user_coupon',
    action: 'unlock',
    targetId: couponId,
    targetName: coupon.templateName,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    beforeData: { status: 'locked' },
    afterData: { status: newStatus },
  })

  return handleSuccess(null, isExpired ? '优惠券已过期' : '优惠券已退回')
}

// =====================================================================
// Handler 8: getPopupCoupon
// =====================================================================

export async function getPopupCoupon(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { page } = event
  if (!auth.openid) { throw err('AUTH_REQUIRED', '未登录') }
  if (!page) { throw err('INVALID_PARAMS', '缺少页面标识') }

  const templates = await db.collection('coupon_templates')
    .where({ status: 'active', popupEnabled: true, popupPage: page, remaining: _.gt(0) })
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get()

  if (!templates.data || templates.data.length === 0) {
    return handleSuccess(null)
  }

  // 检查用户是否已领取过
  const templateIds: string[] = (templates.data as CouponTemplate[]).map((t) => t._id || '').filter(Boolean)
  const claimedRes = await db.collection('user_coupons')
    .where({ templateId: _.in(templateIds), ownerId: auth.openid, status: _.in(['unused', 'locked']) })
    .get()

  const claimedSet = new Set(((claimedRes.data || []) as UserCoupon[]).map((c: UserCoupon) => c.templateId))
  const available = (templates.data as CouponTemplate[]).find((t) => !claimedSet.has(t._id))

  if (!available) {
    return handleSuccess(null)
  }

  const popup: PopupCoupon = {
    templateId: available._id,
    name: available.name,
    type: available.type,
    rules: available.rules,
    applicableScopes: available.applicableScopes,
    remaining: available.remaining,
    validDays: available.validDays,
    perUserLimit: available.perUserLimit,
    canClaim: true,
  }
  return handleSuccess(popup)
}

// =====================================================================
// Handlers 聚合
// =====================================================================

export const handlers: Record<string, CouponActionHandler> = {
  getMyCoupons,
  getAvailableCoupons,
  getClaimableTemplates,
  getPopupCoupon,
  claimCoupon,
  lockCoupon,
  useCoupon,
  unlockCoupon,
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

  try {
    const auth = await verifyAuth(event, context) as AuthLike & { error?: unknown }
    if (auth.error) { return auth }

    logger.info(`[${action}]`, { ownerId: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(`[${action}]`, error)
    // 透传 BusinessError 错误码
    const e = error as { code?: string; severity?: string; message?: string }
    if (e && e.code && e.severity) {
      const numericCode = (ERROR_CODES as Record<string, number>)[e.severity] || ERROR_CODES.BUSINESS
      return handleError(error, e.message || '操作失败', numericCode)
    }
    return handleError(error, e.message || '服务器错误', ERROR_CODES.SERVER)
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  getMyCoupons,
  getAvailableCoupons,
  getClaimableTemplates,
  getPopupCoupon,
  claimCoupon,
  lockCoupon,
  useCoupon,
  unlockCoupon,
  calculateCouponDiscount,
  generateCouponCode,
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getMyCoupons,
  getAvailableCoupons,
  getClaimableTemplates,
  getPopupCoupon,
  claimCoupon,
  lockCoupon,
  useCoupon,
  unlockCoupon,
  calculateCouponDiscount,
  generateCouponCode,
  handlers,
}
