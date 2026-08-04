/**
 * tuanService/index.ts - 团购服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - getTuanDealList - 拉取团购列表（分页 + 状态过滤 + 计算 minPrice）
 *   - getTuanDealDetail - 拉取团购详情（含 SKU 维度 minPrice 计算）
 *   - createTuanOrder - 创建团购订单（含库存扣减 + 双订单写入）
 *   - shipTuanOrder - 团长发货（保留 action）
 *   - confirmReceiveTuanOrder - 确认收货（保留 action）
 *   - cancelTuanOrder - 取消团订单（保留 action）
 *
 * 迁移目标：
 *   - 强类型化 6 个 action handler 签名（含 3 个保留 action）
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 抽离 TUAN_DEAL_LIST_FIELDS 与 WRITE_ACTIONS 常量
 *   - computeMinPrice 工具函数强类型化
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.tuanService.json
 */

// =====================================================================
// 公共类型（与已迁移的 12 个服务保持一致）
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
  Time?: string
  Timestamp?: number
  TriggerName?: string
  Message?: string
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

// =====================================================================
// 业务类型
// =====================================================================

/** 团购状态 */
export type TuanStatus = 'draft' | 'published' | 'active' | 'ended' | 'cancelled'

/** SKU 状态 */
export type SkuType = 'single' | 'multi'

/** 团购内单个商品（含 SKU 数组） */
export interface TuanProduct {
  productId: string
  name?: string
  image?: string
  price?: number
  tuanPrice?: number
  stock?: number
  sold?: number
  skuType?: SkuType
  skus?: TuanSku[]
  // P3-015: 补充 minSkuPrice 字段定义，消除 as number 断言
  minSkuPrice?: number
  [k: string]: unknown
}

/** 团购 SKU */
export interface TuanSku {
  skuId: string
  price?: number
  tuanPrice?: number
  stock?: number
  sold?: number
  enabled?: boolean
  [k: string]: unknown
}

/** 团购文档 */
export interface TuanDeal {
  _id: string
  title?: string
  coverUrl?: string
  description?: string
  images?: string[]
  products?: TuanProduct[]
  startTime?: string | Date
  endTime?: string | Date
  status?: TuanStatus
  totalOrders?: number
  totalAmount?: number
  createdAt?: string | Date
  [k: string]: unknown
}

/** 团购订单 */
export interface TuanOrder {
  _id?: string
  dealId: string
  productId: string
  skuId?: string
  specText?: string
  ownerId: string
  quantity: number
  tuanPrice: number
  originalAmount?: number
  totalAmount: number
  couponId?: string
  couponDiscount?: number
  status?: string
  paymentStatus?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

/**
 * 统一订单（含团购订单联动）
 *
 * 团购订单状态语义：
 *   pending_payment: 待支付
 *   paid: 已支付/已确认，等待发货
 *   pending_shipment: 待发货
 *   shipped: 已发货
 *   completed: 已完成
 *   cancelled: 已取消
 *   refunded: 已退款
 */
export interface UnifiedOrder {
  _id?: string
  orderNo: string
  dealId: string
  productId: string
  productName?: string
  productImage?: string
  skuId?: string
  skuText?: string
  unitPrice: number
  quantity: number
  originalAmount: number
  totalAmount: number
  couponId?: string
  couponDiscount?: number
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
  remark?: string
  ownerId: string
  status: string
  type: 'group_buy'
  tuanOrderId?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

/** 分页结果 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// =====================================================================
// 内部模块初始化
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate, escapeRegExp } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// M2: 引入限流（bootstrap + withRateLimit），对齐 mallService/orderService 模式
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { uploadShippingInfo, traceWaybill, followWaybill } = require('./common/wxLogistics')

const { cloud, db } = initCloud()
const logger = createLogger('tuanService')
const _ = db.command

// M2: 注入全局限流存储（rate_limits + rate_limit_configs 一次注入）
//   - 与 mallService/index.ts:260-265 模式一致
//   - 失败时 fallback 到内存存储（不阻断业务）
try {
  bootstrapRateLimit(db, { logger })
} catch (e) {
  logger.warn('bootstrapRateLimit failed, fallback to memory:', e && (e as Error).message)
}

// =====================================================================
// 常量
// =====================================================================

export const TUAN_DEAL_LIST_FIELDS: Record<string, boolean> = {
  _id: true, title: true, coverUrl: true, description: true, images: true,
  products: true, startTime: true, endTime: true, status: true,
  totalOrders: true, totalAmount: true, createdAt: true,
}

export const WRITE_ACTIONS: readonly string[] = [
  'createTuanOrder',
  'shipTuanOrder',
  'confirmReceiveTuanOrder',
  'cancelTuanOrder',
]

export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100

// =====================================================================
// 辅助函数：计算最低价
// =====================================================================

/**
 * 计算团购内商品的最低价（用于列表展示与详情展示）
 *   - 优先 SKU 维度
 *   - 回退商品 tuanPrice
 */
export function computeMinPrice(products: TuanProduct[]): number {
  let min = Infinity
  for (const p of products) {
    if (p.skuType === 'multi' && p.skus && p.skus.length > 0) {
      for (const sku of p.skus) {
        if (sku.enabled !== false) {
          const price = Number(sku.tuanPrice) || Number(sku.price) || Infinity
          if (price < min) { min = price }
        }
      }
    } else {
      const price = Number(p.tuanPrice) || 0
      if (price > 0 && price < min) { min = price }
    }
  }
  return min === Infinity ? 0 : min
}

// =====================================================================
// H3: 优惠券校验与锁定（复用 orderService.validateAndLockCoupon 模式）
// =====================================================================

/** 用户优惠券文档（投影） */
interface UserCouponDoc {
  _id: string
  ownerId?: string
  status?: string
  startTime?: string | Date
  endTime?: string | Date
  type?: string
  templateName?: string
  rules?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * H3: 服务端计算优惠券折扣（整数分计算，避免浮点精度）
 *
 * @returns { eligible, discount, message } - discount 单位为元
 */
function computeCouponDiscount(
  coupon: Pick<UserCouponDoc, 'type' | 'rules'>,
  orderAmount: number
): { eligible: boolean; discount: number; message?: string } {
  const { type, rules } = coupon
  if (!rules) {return { eligible: false, discount: 0, message: '优惠券规则缺失' }}

  const orderAmountInFen = Math.round(orderAmount * 100)
  if (orderAmountInFen < 0) {return { eligible: false, discount: 0, message: '订单金额异常' }}

  const rulesRecord = rules as { threshold?: number; reduceAmount?: number; discountRate?: number; maxReduceAmount?: number }
  if (rulesRecord.threshold) {
    const thresholdInFen = Math.round(rulesRecord.threshold * 100)
    if (orderAmountInFen < thresholdInFen) {
      return { eligible: false, discount: 0, message: `订单金额未达到满${rulesRecord.threshold}元使用门槛` }
    }
  }

  let discountInFen = 0
  switch (type) {
  case 'fixed_amount':
  case 'full_reduction':
    discountInFen = Math.round((rulesRecord.reduceAmount || 0) * 100)
    break
  case 'discount': {
    const rate = Number(rulesRecord.discountRate) || 1
    if (rate <= 0 || rate > 1) {return { eligible: false, discount: 0, message: '折扣率无效' }}
    discountInFen = Math.round(orderAmountInFen * (1 - rate))
    if (rulesRecord.maxReduceAmount && rulesRecord.maxReduceAmount > 0) {
      const maxInFen = Math.round(rulesRecord.maxReduceAmount * 100)
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

/**
 * H3: 服务端校验优惠券（只读，不锁定——fail-closed 折扣防伪造）
 *
 * 安全设计（P0-1 修复：对齐 mall 模式，前端负责 lock，后端只做只读校验）：
 *   - 券的锁定由前端 order-confirm 负责（lockCoupon 用 tempOrderId）。
 *     后端若再调 lockCoupon，会因 orderId 不一致（tempOrderId vs 后端空串）
 *     触发 couponService 幂等拒绝，导致带券团购下单必失败。
 *   - 不信任客户端传入的 couponDiscount，服务端查 user_coupons 校验：
 *     归属 / 状态=unused 或 locked（前端已锁）/ 有效期
 *   - 服务端按 coupon.rules 计算 discount（防金额伪造）
 *
 * @returns { discount, couponSnapshot } - discount 单位为元
 */
async function validateAndLockCoupon(
  openid: string,
  couponId: string,
  orderAmount: number,
  orderId: string,
  orderType: string
): Promise<{ discount: number; couponSnapshot: Record<string, unknown> }> {
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
  // P0-1: 允许 unlocked 与前端已锁定的 locked 状态（前端 lockCoupon 成功后进入下单流程，
  //   券已置 locked；此处只读校验不再重复 lock，避免 orderId 幂等冲突）
  if (coupon.status !== 'unused' && coupon.status !== 'locked') {
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

  // snapshot 用于写入订单（便于后续 useCoupon 核销校验）
  const couponSnapshot: Record<string, unknown> = {
    couponId,
    templateName: coupon.templateName || '',
    type: coupon.type || '',
    rules: coupon.rules || {},
  }
  return { discount: calc.discount, couponSnapshot }
}

/** H3: 失败回滚：解锁优惠券（best-effort，不抛错） */
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

/**
 * P0-2: 取消团购订单时恢复 tuan_deals.products 快照库存。
 * 与 createTuanOrder 下单扣减对称：
 *   - SKU 模式回补 products[i].skus[j].stock/sold
 *   - 非 SKU 模式回补 products[i].stock/sold
 */
async function restoreTuanDealStock(
  dealId: string,
  productId: string,
  skuId: string,
  quantity: number
): Promise<void> {
  try {
    const dealRes = await db.collection('tuan_deals').doc(dealId).get()
    const deal = dealRes.data as TuanDeal | null
    if (!deal || !Array.isArray(deal.products)) { return }

    const productIndex = deal.products.findIndex(p => p.productId === productId)
    if (productIndex < 0) { return }

    const product = deal.products[productIndex]
    const updateData: Record<string, unknown> = { updatedAt: db.serverDate() }

    if (skuId && product.skuType === 'multi' && Array.isArray(product.skus)) {
      const skuIndex = product.skus.findIndex(s => s.skuId === skuId)
      if (skuIndex >= 0) {
        // 与下单扣减字段对称：优先回补团购配额 tuanStock，历史无 tuanStock 的 SKU 回补 stock
        const sku = product.skus[skuIndex]
        const stockField = (sku.tuanStock !== undefined && sku.tuanStock !== null) ? 'tuanStock' : 'stock'
        updateData[`products.${productIndex}.skus.${skuIndex}.${stockField}`] = _.inc(quantity)
        updateData[`products.${productIndex}.skus.${skuIndex}.sold`] = _.inc(-quantity)
        await db.collection('tuan_deals').doc(dealId).update({ data: updateData })
        return
      }
    }

    updateData[`products.${productIndex}.stock`] = _.inc(quantity)
    updateData[`products.${productIndex}.sold`] = _.inc(-quantity)
    await db.collection('tuan_deals').doc(dealId).update({ data: updateData })
  } catch (e: unknown) {
    logger.warn('cancelTuanOrder.restoreTuanDealStock', { dealId, productId, msg: (e as Error)?.message })
  }
}
/** P1-3: 取消订单时回退 tuan_deals 累计单数/金额（与下单 inc 对称，防止列表统计虚高） */
async function rollbackTuanDealTotals(dealId: string, amount: number): Promise<void> {
  if (!dealId) { return }
  try {
    const dealRes = await db.collection('tuan_deals').doc(dealId).get()
    const deal = dealRes.data as TuanDeal | null
    if (!deal) { return }
    const nextOrders = Math.max(0, (Number(deal.totalOrders) || 0) - 1)
    const nextAmount = Math.max(0, (Number(deal.totalAmount) || 0) - (Number(amount) || 0))
    await db.collection('tuan_deals').doc(dealId).update({
      data: { totalOrders: nextOrders, totalAmount: nextAmount, updatedAt: db.serverDate() },
    })
  } catch (e: unknown) {
    logger.warn('rollbackTuanDealTotals', { dealId, amount, msg: (e as Error)?.message })
  }
}

/** H4: 判断是否为重复键错误（CloudBase 主键冲突错误码） */
function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {return false}
  const e = error as { code?: number | string; errCode?: number | string; message?: string }
  const code = e.code ?? e.errCode
  // CloudBase 主键冲突错误码：-502001 / 'DUPLICATE_KEY' / 11000（MongoDB）
  return code === -502001 || code === 'DUPLICATE_KEY' || code === 11000 ||
    (typeof e.message === 'string' && /duplicate key/i.test(e.message))
}

/** L1: 失败操作记录（用于后台 worker 重试） */
async function recordFailedOperation(
  type: string,
  payload: Record<string, unknown>,
  error: unknown
): Promise<void> {
  try {
    const failedDoc = {
      _id: `fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      error: {
        message: (error as Error)?.message || String(error),
        name: (error as Error)?.name,
      },
      status: 'pending' as const,
      retryCount: 0,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }
    await db.collection('failed_operations').add({ data: failedDoc as unknown as Record<string, unknown> })
    logger.warn('recordFailedOperation.recorded', { type, payload, error: failedDoc.error })
  } catch (e: unknown) {
    logger.error('recordFailedOperation.fatal', { type, msg: (e as Error)?.message })
  }
}

/** L1: 写操作审计日志（best-effort） */
async function writeOperationLog(params: {
  module: string
  action: string
  targetId?: string
  operatorId?: string
  afterData?: Record<string, unknown>
}): Promise<void> {
  try {
    const { writeOperationLog: writeLog } = require('./common/operation-log')
    await writeLog(params)
  } catch (e: unknown) {
    logger.warn('writeOperationLog.failed', { msg: (e as Error)?.message })
  }
}

// =====================================================================
// Action 1：拉取团购列表
// =====================================================================

export async function getTuanDealList(event: CloudEvent): Promise<unknown> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, status, keyword } = event
  const where: Record<string, unknown> = {}
  if (status) {
    where.status = status
  } else {
    where.status = _.in(['published', 'active'])
  }
  const now = new Date()
  where.startTime = _.lte(now)
  where.endTime = _.gte(now)
  if (keyword) {
    const safeKeyword = escapeRegExp(String(keyword).slice(0, 50))
    where.title = db.RegExp({ regexp: safeKeyword, options: 'i' })
  }

  const result = await paginate(db, 'tuan_deals', {
    page, pageSize, where, projection: TUAN_DEAL_LIST_FIELDS,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  if (result.list) {
    result.list = result.list.map((deal: TuanDeal) => ({
      ...deal,
      minPrice: computeMinPrice(deal.products || []),
    }))
  }
  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Action 2：拉取团购详情
// =====================================================================

export async function getTuanDealDetail(event: CloudEvent): Promise<unknown> {
  const { id, dealId } = event
  const targetId = (id || dealId) as string | undefined
  if (!targetId) { throw err('INVALID_PARAMS', '缺少团购ID') }

  try {
    const res = await db.collection('tuan_deals').doc(targetId).field(TUAN_DEAL_LIST_FIELDS).get()
    if (!res.data) { throw err('NOT_FOUND', '团购不存在') }
    const deal = res.data as TuanDeal
    deal.minPrice = computeMinPrice(deal.products || [])

    for (const p of (deal.products || [])) {
      if (p.skuType === 'multi' && p.skus && p.skus.length > 0) {
        p.minSkuPrice = Infinity
        for (const sku of p.skus) {
          if (sku.enabled !== false) {
            const price = Number(sku.tuanPrice) || Number(sku.price) || Infinity
            if (price < (p.minSkuPrice ?? Infinity)) { p.minSkuPrice = price }
          }
        }
        if (p.minSkuPrice === Infinity) { p.minSkuPrice = p.tuanPrice || 0 }
      }
    }
    return handleSuccess(deal, '获取成功')
  } catch (error) {
    // M3: 区分 NOT_FOUND 与 DATA 错误（原全量映射为 NOT_FOUND 掩盖真实错误）
    //   - BusinessError NOT_FOUND → 404
    //   - 其他错误（权限/网络/SKU 计算异常）→ DATA 错误 + logger.error
    if (error && typeof error === 'object' &&
        (error as { name?: string }).name === 'BusinessError' &&
        (error as { code?: string }).code === 'NOT_FOUND') {
      return handleError(error, '团购不存在', ERROR_CODES.NOT_FOUND)
    }
    logger.error('getTuanDealDetail', { targetId, msg: (error as Error)?.message })
    return handleError(error, '获取团购详情失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Action 3：创建团购订单
// =====================================================================

export async function createTuanOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { dealId, productId, skuId, quantity = 1, originalAmount, couponId, specText, receiverName, receiverPhone, receiverAddress, remark } = event
  if (!dealId) { throw err('INVALID_PARAMS', '缺少dealId') }
  if (!productId) { throw err('INVALID_PARAMS', '缺少productId') }
  // P1-4: 数量服务端校验（防 0/负数/非数字下单）
  const qty = Number(quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
    throw err('INVALID_PARAMS', '购买数量无效')
  }

  // M2: 下单风控前置（限流 + 反刷单）
  try {
    await withRateLimit(
      { userId: openid, type: 'tuan_order', targetId: dealId as string },
      async () => {
        // withRateLimit 包装：内部消费令牌，超限抛 RISK_REJECT
        return { ok: true }
      }
    )
  } catch (e: unknown) {
    if (e && typeof e === 'object' && (e as { name?: string }).name === 'BusinessError') {throw e}
    logger.warn('createTuanOrder.rateLimit', { openid, dealId, msg: (e as Error)?.message })
    throw err('RISK_REJECT', '下单过于频繁，请稍后重试')
  }

  const dealRes = await db.collection('tuan_deals').doc(dealId as string).get()
  if (!dealRes.data) { throw err('NOT_FOUND', '团购不存在') }
  const deal = dealRes.data as TuanDeal
  if (deal.status !== 'published' && deal.status !== 'active') {
    throw err('BUSINESS_ERROR', '团购已结束')
  }
  if (deal.endTime && new Date(deal.endTime as string) < new Date()) {
    throw err('BUSINESS_ERROR', '团购已结束')
  }

  const dealProducts = deal.products || []
  const dealProduct = dealProducts.find(p => p.productId === productId)
  if (!dealProduct) { throw err('INVALID_PARAMS', '商品不在团购中') }

  // 价格始终从数据库获取，忽略客户端传入的 tuanPrice（防止价格篡改）
  let finalPrice = Number(dealProduct.tuanPrice) || Number(dealProduct.price) || 0
  let finalStock = Number(dealProduct.stock) || 0

  if (skuId && dealProduct.skuType === 'multi' && dealProduct.skus) {
    const sku = dealProduct.skus.find(s => s.skuId === skuId)
    if (!sku) { throw err('INVALID_PARAMS', 'SKU不存在') }
    if (sku.enabled === false) { throw err('BUSINESS_ERROR', '该规格已下架') }
    finalPrice = Number(sku.tuanPrice) || Number(sku.price) || finalPrice
    // P1-1: 团购限量以团购配额 tuanStock 为准（历史无 tuanStock 时回退商品快照 stock）
    finalStock = Number(sku.tuanStock) || Number(sku.stock) || 0
    if (finalStock < (quantity as number)) { throw err('BUSINESS_ERROR', '库存不足') }
  } else {
    if (finalStock < (quantity as number)) { throw err('BUSINESS_ERROR', '库存不足') }
  }

  // 金额始终从数据库价格计算，忽略客户端传入的 totalAmount（防止金额篡改）
  const grossAmount = finalPrice * (quantity as number)

  // H3: 优惠券只读校验（P0-1: 不再锁定——券已由前端 order-confirm 锁定，
  //   后端重复 lock 会因 orderId 不一致触发幂等拒绝导致下单失败）
  //   - 不信任客户端传入的 couponDiscount，服务端按 coupon.rules 计算
  //   - finalAmount = grossAmount - couponDiscount（服务端计算）
  let validatedCouponDiscount = 0
  let couponSnapshot: Record<string, unknown> | undefined
  if (couponId) {
    const lockResult = await validateAndLockCoupon(
      openid,
      couponId as string,
      grossAmount,
      '',
      'tuan'
    )
    validatedCouponDiscount = lockResult.discount
    couponSnapshot = lockResult.couponSnapshot
  }

  // H3: 服务端计算最终金额（不再使用客户端 totalAmount）
  const finalAmount = Math.max(0, Math.round((grossAmount - validatedCouponDiscount) * 100) / 100)
  if (couponId && finalAmount < 0.1) {
    // 优惠后金额低于下限，回滚券锁定并拒绝下单
    if (couponId) { await unlockCouponBestEffort(couponId as string, '') }
    throw err('INVALID_PARAMS', '优惠后订单金额必须 ≥ 0.1 元')
  }

  // H4: 幂等键（防止双击重复下单）
  //   - 基于 (openid, dealId, productId, skuId) 生成唯一键
  //   - tuan_orders 集合需建 idempotencyKey 唯一索引
  //   - 重复下单时捕获 DUPLICATE_KEY 错误并返回友好提示
  const idempotencyKey = `tuan_${openid}_${dealId}_${productId}_${(skuId as string) || ''}`

  const orderNo = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`

  const order: TuanOrder = {
    dealId: dealId as string,
    productId: productId as string,
    skuId: (skuId as string) || '',
    specText: (specText as string) || '',
    ownerId: openid,
    quantity: quantity as number,
    tuanPrice: finalPrice,
    originalAmount: (originalAmount as number) || grossAmount,
    totalAmount: finalAmount,
    couponId: (couponId as string) || '',
    couponDiscount: validatedCouponDiscount,
    idempotencyKey,
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  order._id = generateId('tuan', openid)

  // P1-3: 团订单创建 + 统一订单创建 + 库存扣减 纳入单一事务，防止孤儿订单和超卖
  const transaction = await db.startTransaction()

  try {
    // 1) 事务内重新查询最新库存（防止并发超卖）
    const freshDealRes = await transaction.collection('tuan_deals').doc(dealId as string).get()
    const freshDeal = freshDealRes.data as TuanDeal
    const freshProducts = (freshDeal && freshDeal.products) || []
    const freshProduct = freshProducts.find(p => p.productId === productId)

    if (!freshProduct) {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '商品不存在')
    }

    // 验证最新库存
    if (skuId && freshProduct.skuType === 'multi' && freshProduct.skus) {
      const freshSku = freshProduct.skus.find(s => s.skuId === skuId)
      if (!freshSku) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', 'SKU不存在')
      }
      // P1-1: 事务内同样按 tuanStock（团购配额）校验
      const freshSkuStock = Number(freshSku.tuanStock) || Number(freshSku.stock) || 0
      if (freshSkuStock < (quantity as number)) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', '库存不足')
      }
    } else {
      const freshStock = Number(freshProduct.stock) || 0
      if (freshStock < (quantity as number)) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', '库存不足')
      }
    }

    // 2) 写入团订单（H4: 带幂等键，重复下单由唯一索引拦截）
    let orderRes: { _id: string }
    try {
      orderRes = await transaction.collection('tuan_orders').add({ data: order })
    } catch (dupErr) {
      // H4: 幂等键冲突 → 重复下单，回滚券并返回友好提示
      if (isDuplicateKeyError(dupErr)) {
        await transaction.rollback()
        if (couponId) { await unlockCouponBestEffort(couponId as string, '') }
        throw err('DUPLICATE_ORDER', '请勿重复下单，您已有一个待支付订单')
      }
      throw dupErr
    }

    // 3) 写入统一订单
    // H1: 必须显式写入 paymentStatus: 'unpaid'，否则 orderTimeoutService
    //   按 paymentStatus='unpaid' 过滤待支付超时订单时将漏掉团购订单，
    //   导致超时取消失效、库存永久占用（违反 project_memory.md 约束）
    const unifiedOrder: UnifiedOrder = {
      orderNo,
      dealId: dealId as string,
      productId: productId as string,
      productName: dealProduct.name || '',
      productImage: dealProduct.image || '',
      skuId: (skuId as string) || '',
      skuText: (specText as string) || '',
      unitPrice: finalPrice,
      quantity: Number(quantity),
      originalAmount: (originalAmount as number) || grossAmount,
      totalAmount: finalAmount,
      couponId: (couponId as string) || '',
      couponDiscount: validatedCouponDiscount,
      couponSnapshot,
      receiverName: (receiverName as string) || '',
      receiverPhone: (receiverPhone as string) || '',
      receiverAddress: (receiverAddress as string) || '',
      remark: (remark as string) || '',
      ownerId: openid,
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      type: 'group_buy',
      tuanOrderId: orderRes._id,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }
    unifiedOrder._id = generateId('order', openid)
    // H7: idx_bookingKey_unique 唯一索引要求 orders 全文档 bookingKey 唯一
    //   团购订单无寄养业务键,用 _id 占位保证唯一性,避免 null 冲突导致 -502001 DuplicateKey
    unifiedOrder.bookingKey = `nb_${unifiedOrder._id}`
    const unifiedOrderRes = await transaction.collection('orders').add({ data: unifiedOrder })

    // 4) 扣减库存（L4: updatedAt 改用 db.serverDate() 保持一致）
    const updateData: Record<string, unknown> = {
      totalOrders: _.inc(1),
      totalAmount: _.inc(finalAmount),
      updatedAt: db.serverDate(),
    }

    const freshProductIndex = freshProducts.indexOf(freshProduct)
    if (skuId && freshProduct.skuType === 'multi' && freshProduct.skus) {
      // Multi-SKU 商品：只扣减 SKU 级库存，不扣减商品级库存（避免双重扣减）
      const skuIndex = freshProduct.skus.findIndex(s => s.skuId === skuId)
      if (skuIndex >= 0) {
        // P1-1: 扣减团购配额 tuanStock（历史无 tuanStock 的 SKU 扣减商品快照 stock）
        const sku = freshProduct.skus[skuIndex]
        const stockField = (sku.tuanStock !== undefined && sku.tuanStock !== null) ? 'tuanStock' : 'stock'
        updateData[`products.${freshProductIndex}.skus.${skuIndex}.${stockField}`] = _.inc(-(quantity as number))
        updateData[`products.${freshProductIndex}.skus.${skuIndex}.sold`] = _.inc(quantity as number)
      }
    } else {
      // 非 Multi-SKU 商品：扣减商品级库存
      updateData[`products.${freshProductIndex}.stock`] = _.inc(-(quantity as number))
      updateData[`products.${freshProductIndex}.sold`] = _.inc(quantity as number)
    }

    await transaction.collection('tuan_deals').doc(dealId as string).update({ data: updateData })

    await transaction.commit()

    // L1: 写操作审计日志（best-effort）
    await writeOperationLog({
      module: 'tuan_order',
      action: 'create',
      targetId: orderRes._id,
      operatorId: openid,
      afterData: { status: 'pending_payment', totalAmount: finalAmount, dealId, productId },
    }).catch(e => logger.warn('createTuanOrder.auditLog', { msg: (e as Error)?.message }))

    return handleSuccess({ _id: orderRes._id, unifiedOrderId: unifiedOrderRes._id, ...order }, '下单成功')
  } catch (error) {
    try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
    // H3: 事务失败时回滚券锁定（best-effort）
    if (couponId) {
      await unlockCouponBestEffort(couponId as string, '').catch(() => {})
    }
    throw error
  }
}

// =====================================================================
// Handler 4: shipTuanOrder（商家发货）
// =====================================================================
async function shipTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown> {
  const { orderId, expressCompany, expressNo } = event.data || {}
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  if (!expressNo) {
    throw err('INVALID_PARAMS', '请填写快递单号')
  }
  if (!expressCompany) {
    throw err('INVALID_PARAMS', '请选择快递公司')
  }
  // 权限：仅管理员或商家可发货
  if (!auth.isSuperAdmin && !auth.adminId) {
    throw err('PERMISSION_DENIED', '无权操作')
  }

  const orderRes = await db.collection('orders').doc(orderId as string).get()
  const order = orderRes.data as UnifiedOrder | undefined
  if (!order) {
    throw err('NOT_FOUND', '订单不存在')
  }
  if (order.type !== 'group_buy') {
    throw err('BUSINESS_ERROR', '非团购订单')
  }
  if (order.status !== 'paid') {
    throw err('BUSINESS_ERROR', '当前状态不可发货')
  }

  // 状态置为 shipped（与商城对齐，因为有 expressNo 就意味着已实际发货）
  await db.collection('orders').doc(orderId as string).update({
    data: {
      status: 'shipped',
      expressCompany,
      expressNo,
      shippedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })

  if (order.tuanOrderId) {
    try {
      await db.collection('tuan_orders').doc(order.tuanOrderId).update({
        data: {
          status: 'shipped',
          expressCompany,
          expressNo,
          shippedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    } catch (e) {
      // M1: 跨表同步失败 → recordAlert + recordFailedOperation（供后台 worker 重试）
      logger.warn('shipTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: (e as Error).message })
      try {
        const { recordAlert } = require('./common/alert')
        await recordAlert('warning', 'tuan.ship.syncTuanOrder.failed',
          '发货后 tuan_orders 状态同步失败',
          { orderId, tuanOrderId: order.tuanOrderId, targetStatus: 'shipped', error: (e as Error).message })
      } catch { /* best-effort */ }
      await recordFailedOperation('sync_tuan_order_status',
        { orderId, tuanOrderId: order.tuanOrderId, targetStatus: 'shipped' }, e)
    }
  }

  // 同步推送到微信「发货信息管理」，best-effort
  const transactionId = (order as any).wxTransactionId || (order as any).transactionId || ''
  if (transactionId) {
    try {
      const wxRes = await uploadShippingInfo({
        transactionId,
        merchantTradeNo: orderId as string,
        shippingItem: {
          expressCompany,
          expressNo,
          itemDesc: `${(order as any).productName || '团购商品'} ×${(order as any).quantity || 1}`,
        },
      })
      if (!wxRes.ok) {
        logger.warn('shipTuanOrder.uploadShippingInfo.fail', {
          orderId, transactionId, expressNo, error: wxRes.error,
        })
      }
    } catch (e) {
      logger.warn('shipTuanOrder.uploadShippingInfo.exception', {
        orderId, msg: (e as Error)?.message || String(e),
      })
    }

    // 调微信「物流查询组件」trace_waybill 拿 waybillToken 存到订单
    // 前端 logistics-card 调 plugin.openWaybillTracking({waybillToken}) 拉起原生物流详情页
    // best-effort：失败只记日志，不阻断发货（用户仍可看到快递单号）
    const openid = (order as any).ownerId || ''
    const receiverPhone = (order as any).receiverPhone || ''
    const productImage = (order as any).productImage || ''
    const productName = (order as any).productName || '团购商品'
    if (openid && receiverPhone) {
      try {
        const traceRes = await traceWaybill({
          openid,
          receiverPhone,
          waybillId: expressNo as string,
          transId: transactionId,
          orderDetailPath: `subpackages/profile/mall-order-detail/index?id=${orderId}`,
          goodsInfo: [{
            goodsName: productName,
            goodsImgUrl: productImage,
          }],
          deliveryId: expressCompany as string,
        })
        if (traceRes.ok && traceRes.waybillToken) {
          await db.collection('orders').doc(orderId as string).update({
            data: { waybillToken: traceRes.waybillToken, updatedAt: db.serverDate() } as any,
          })
          // 同步 waybillToken 到 tuan_orders 表（与 orders 表保持一致）
          if (order.tuanOrderId) {
            try {
              await db.collection('tuan_orders').doc(order.tuanOrderId as string).update({
                data: { waybillToken: traceRes.waybillToken, updatedAt: db.serverDate() } as any,
              })
            } catch (e) {
              logger.warn('shipTuanOrder.syncWaybillTokenToTuanOrder.failed', {
                orderId, tuanOrderId: order.tuanOrderId, msg: (e as Error)?.message,
              })
            }
          }
        } else {
          logger.warn('shipTuanOrder.traceWaybill.fail', {
            orderId, transactionId, expressNo, error: traceRes.error,
          })
        }
      } catch (e) {
        logger.warn('shipTuanOrder.traceWaybill.exception', {
          orderId, msg: (e as Error)?.message || String(e),
        })
      }
    } else {
      logger.warn('shipTuanOrder.traceWaybill.skip', {
        orderId, hasOpenid: Boolean(openid), hasReceiverPhone: Boolean(receiverPhone),
      })
    }

    // 调微信「物流消息能力」follow_waybill 触发服务通知推送
    // 微信在「已揽件/派件中/已签收」三个关键节点主动给用户推送服务通知
    // best-effort：失败只记日志，不阻断发货（与 traceWaybill 容错策略一致）
    if (openid && receiverPhone) {
      try {
        const followRes = await followWaybill({
          openid,
          receiverPhone,
          waybillId: expressNo as string,
          transId: transactionId,
          orderDetailPath: `subpackages/profile/mall-order-detail/index?id=${orderId}`,
          goodsInfo: [{
            goodsName: productName,
            goodsImgUrl: productImage,
          }],
          deliveryId: expressCompany as string,
        })
        if (followRes.ok && followRes.waybillToken) {
          // followWaybillToken 与 traceWaybill 的 waybillToken 用途不同，单独存储备 query_follow_trace 用
          await db.collection('orders').doc(orderId as string).update({
            data: { followWaybillToken: followRes.waybillToken, updatedAt: db.serverDate() } as any,
          })
          if (order.tuanOrderId) {
            try {
              await db.collection('tuan_orders').doc(order.tuanOrderId as string).update({
                data: { followWaybillToken: followRes.waybillToken, updatedAt: db.serverDate() } as any,
              })
            } catch (e) {
              logger.warn('shipTuanOrder.syncFollowWaybillTokenToTuanOrder.failed', {
                orderId, tuanOrderId: order.tuanOrderId, msg: (e as Error)?.message,
              })
            }
          }
        } else {
          logger.warn('shipTuanOrder.followWaybill.fail', {
            orderId, transactionId, expressNo, error: followRes.error,
          })
        }
      } catch (e) {
        logger.warn('shipTuanOrder.followWaybill.exception', {
          orderId, msg: (e as Error)?.message || String(e),
        })
      }
    }
  }

  // L1: 写操作审计日志（best-effort）
  await writeOperationLog({
    module: 'tuan_order', action: 'ship', targetId: orderId as string,
    operatorId: auth.adminId || auth.openid,
    afterData: { status: 'shipped', expressCompany, expressNo },
  }).catch(e => logger.warn('shipTuanOrder.auditLog', { msg: (e as Error)?.message }))

  return handleSuccess(null, '发货成功')
}

// =====================================================================
// Handler 5: confirmReceiveTuanOrder（用户确认收货）
// =====================================================================
async function confirmReceiveTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown> {
  const { orderId } = event.data || {}
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  const openid = auth.openid
  if (!openid) {
    throw err('AUTH_REQUIRED', '未登录')
  }

  const orderRes = await db.collection('orders').doc(orderId as string).get()
  const order = orderRes.data as UnifiedOrder | undefined
  if (!order) {
    throw err('NOT_FOUND', '订单不存在')
  }
  if (order.ownerId !== openid) {
    throw err('PERMISSION_DENIED', '无权操作')
  }
  if (order.type !== 'group_buy') {
    throw err('BUSINESS_ERROR', '非团购订单')
  }
  if (!['pending_shipment', 'shipped'].includes(order.status)) {
    throw err('BUSINESS_ERROR', '当前状态不可确认收货')
  }

  await db.collection('orders').doc(orderId as string).update({
    data: { status: 'completed', updatedAt: db.serverDate() },
  })

  if (order.tuanOrderId) {
    try {
      await db.collection('tuan_orders').doc(order.tuanOrderId).update({
        data: { status: 'completed', updatedAt: db.serverDate() },
      })
    } catch (e) {
      // M1: 跨表同步失败 → recordAlert + recordFailedOperation（供后台 worker 重试）
      logger.warn('confirmReceiveTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: (e as Error).message })
      try {
        const { recordAlert } = require('./common/alert')
        await recordAlert('warning', 'tuan.confirm.syncTuanOrder.failed',
          '确认收货后 tuan_orders 状态同步失败',
          { orderId, tuanOrderId: order.tuanOrderId, targetStatus: 'completed', error: (e as Error).message })
      } catch { /* best-effort */ }
      await recordFailedOperation('sync_tuan_order_status',
        { orderId, tuanOrderId: order.tuanOrderId, targetStatus: 'completed' }, e)
    }
  }

  // L1: 写操作审计日志（best-effort）
  await writeOperationLog({
    module: 'tuan_order', action: 'confirm', targetId: orderId as string,
    operatorId: openid,
    afterData: { status: 'completed' },
  }).catch(e => logger.warn('confirmReceiveTuanOrder.auditLog', { msg: (e as Error)?.message }))

  return handleSuccess(null, '确认收货成功')
}

// =====================================================================
// Handler 6: cancelTuanOrder（取消订单并退款）
// =====================================================================
async function cancelTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown> {
  const { orderId } = event.data || {}
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  const openid = auth.openid
  if (!openid) {
    throw err('AUTH_REQUIRED', '未登录')
  }

  const orderRes = await db.collection('orders').doc(orderId as string).get()
  const order = orderRes.data as UnifiedOrder | undefined
  if (!order) {
    throw err('NOT_FOUND', '订单不存在')
  }
  if (order.type !== 'group_buy') {
    throw err('BUSINESS_ERROR', '非团购订单')
  }
  // 用户只能取消自己的订单；管理员可取消任意订单
  if (order.ownerId !== openid && !auth.isSuperAdmin && !auth.adminId) {
    throw err('PERMISSION_DENIED', '无权操作')
  }
  if (!['pending_payment', 'paid', 'pending_shipment'].includes(order.status)) {
    throw err('BUSINESS_ERROR', '当前状态不可取消')
  }

  // L3: 仅已支付订单才需取消佣金（pending_payment 从未创建过佣金记录，调用是无效的）
  if (['paid', 'pending_shipment'].includes(order.status)) {
    try {
      const { cancelCommissionRecord } = require('./common/commission-utils')
      await cancelCommissionRecord(orderId as string)
      logger.info('cancelTuanOrder.cancelCommissionRecord.success', { orderId })
    } catch (e) {
      logger.warn('cancelTuanOrder.cancelCommissionRecord.failed', { orderId, msg: (e as Error).message })
      // M1: 佣金取消失败也写入 failed_operations 供重试
      await recordFailedOperation('cancel_tuan_commission', { orderId }, e)
    }
  }

  // 调用微信支付退款（已支付/待发货状态）
  if (['paid', 'pending_shipment'].includes(order.status)) {
    try {
      const totalAmount = Math.round(Number(order.totalAmount) * 100)
      if (totalAmount > 0) {
        const callRes = await cloud.callFunction({
          name: 'paymentService',
          data: {
            action: 'createRefund',
            outTradeNo: order.orderNo || (orderId as string),
            refundAmount: totalAmount,
            totalAmount: totalAmount,
          },
        })
        // H5: 校验 callFunction 返回的 result.code（防止调用成功但退款失败的情况）
        const result = (callRes.result || {}) as { code?: number; message?: string; data?: unknown }
        if (result.code && result.code !== 0) {
          throw err('BUSINESS_ERROR', `退款失败：${result.message || '支付服务返回错误'}`, {
            code: result.code, orderId, orderNo: order.orderNo,
          })
        }
        logger.info('cancelTuanOrder.refundCreated', { orderId })
      }
    } catch (e) {
      // P1-F: 退款失败不静默通过 — 告警并抛错，让用户感知退款未成功
      logger.error('cancelTuanOrder.refundFailed', { orderId, msg: (e as Error).message })
      try {
        // H2: 修复 require 路径错误（原 '../../common/alert' 解析到项目根，不存在）
        const { recordAlert } = require('./common/alert')
        await recordAlert('critical', 'tuan.cancel.refund.failed', '团购取消退款失败', {
          orderId, orderNo: order.orderNo, amount: order.totalAmount,
          error: (e as Error).message,
        })
      } catch (_) { /* alert 失败不影响主流程 */ }
      // BusinessError 直接抛出，保留错误码
      if (e && typeof e === 'object' && (e as { name?: string }).name === 'BusinessError') {throw e}
      throw err('BUSINESS_ERROR', '退款失败，请稍后重试或联系客服')
    }
  }

  // 未支付订单直接标记取消（事务保证 orders 与 tuan_orders 跨表状态一致）
  if (order.status === 'pending_payment') {
    const transaction = await db.startTransaction()
    try {
      await transaction.collection('orders').doc(orderId as string).update({
        data: { status: 'cancelled', updatedAt: db.serverDate() },
      })
      if (order.tuanOrderId) {
        await transaction.collection('tuan_orders').doc(order.tuanOrderId).update({
          data: { status: 'cancelled', updatedAt: db.serverDate() },
        })
      }
      await transaction.commit()
    } catch (error) {
      try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
      throw error
    }
  }

  // P0-2: 无论已支付（退款）还是未支付取消，都回退 tuan_deals.products 快照库存
  //   （下单在 createTuanOrder 事务内扣减，取消时须对称回补，否则库存越卖越少）
  try {
    await restoreTuanDealStock(
      order.dealId,
      order.productId,
      order.skuId || '',
      Number(order.quantity) || 1
    )
  } catch (stockErr) {
    logger.warn('cancelTuanOrder.restoreStock.failed', {
      orderId, dealId: order.dealId, productId: order.productId,
      msg: (stockErr as Error)?.message,
    })
    await recordFailedOperation('restore_tuan_deal_stock',
      { orderId, dealId: order.dealId, productId: order.productId, skuId: order.skuId, quantity: order.quantity },
      stockErr)
  }
  // P1-3: 回退 deal 累计单数/金额（与下单事务 inc 对称）
  try {
    await rollbackTuanDealTotals(order.dealId, Number(order.totalAmount) || 0)
  } catch (totalsErr) {
    logger.warn('cancelTuanOrder.rollbackTotals.failed', { orderId, dealId: order.dealId, msg: (totalsErr as Error)?.message })
    await recordFailedOperation('rollback_tuan_deal_totals',
      { orderId, dealId: order.dealId, totalAmount: order.totalAmount },
      totalsErr)
  }

  // L1: 写操作审计日志（best-effort）
  await writeOperationLog({
    module: 'tuan_order', action: 'cancel', targetId: orderId as string,
    operatorId: auth.isSuperAdmin || auth.adminId ? (auth.adminId || auth.openid) : openid,
    afterData: { previousStatus: order.status, refunded: ['paid', 'pending_shipment'].includes(order.status) },
  }).catch(e => logger.warn('cancelTuanOrder.auditLog', { msg: (e as Error)?.message }))

  return handleSuccess(null, '取消申请已提交')
}

// =====================================================================
// Handlers 聚合 + Main 入口
// =====================================================================

const handlers: Record<string, (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>> = {
  getTuanDealList: (event, _context, _auth) => getTuanDealList(event),
  getTuanDealDetail: (event, _context, _auth) => getTuanDealDetail(event),
  createTuanOrder,
  shipTuanOrder,
  confirmReceiveTuanOrder,
  cancelTuanOrder,
}

export async function main(event: CloudEvent, context: CloudContext): Promise<unknown> {
  const { action } = event
  try {
    if (!action || !handlers[action]) {
      throw err('UNKNOWN_ACTION', action ? `未知的操作：${action}` : '缺少 action 参数')
    }

    const requireLogin = WRITE_ACTIONS.includes(action)
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action || '(no action)', error)
    const code = (error as { code?: string }).code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message || '操作失败', code)
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  // Action handlers
  getTuanDealList,
  getTuanDealDetail,
  createTuanOrder,
  shipTuanOrder,
  confirmReceiveTuanOrder,
  cancelTuanOrder,
  // 常量
  TUAN_DEAL_LIST_FIELDS,
  WRITE_ACTIONS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  // 辅助函数
  computeMinPrice,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getTuanDealList,
  getTuanDealDetail,
  createTuanOrder,
  shipTuanOrder,
  confirmReceiveTuanOrder,
  cancelTuanOrder,
  TUAN_DEAL_LIST_FIELDS,
  WRITE_ACTIONS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  computeMinPrice,
}
