/**
 * mallService/index.ts - 商城服务主入口（TypeScript 源文件 - Sprint 40 迁移）
 *
 * 业务功能：
 *   - 商品管理（CRUD + 批量操作 + 上下架/精选）
 *   - 商品浏览（列表 / 详情 / 分类统计 / 购物车状态）
 *   - 下单流程（普通下单 + 团购下单，含风控前置）
 *   - 订单管理（我的订单 / 详情 / 取消 / 确认收货 / 删除）
 *
 * 共 18 个 action：
 *   1. getProductList - 商品列表
 *   2. getProductDetail - 商品详情
 *   3. getCategoryStats - 分类统计
 *   4. listCategories - 分类列表
 *   5. checkCartItems - 购物车状态检查
 *   6. createProduct - 创建商品
 *   7. updateProduct - 更新商品
 *   8. deleteProduct - 下架商品
 *   9. batchUpdateProducts - 批量操作商品
 *  10. createOrder - 商城下单
 *  11. createGroupBuyOrder - 团购下单
 *  12. getMyOrders - 我的商城订单
 *  13. getGroupBuyOrders - 我的团购订单
 *  14. getOrderDetail - 订单详情
 *  15. cancelOrder - 取消订单
 *  16. confirmReceive - 确认收货
 *  17. deleteOrder - 删除订单
 *  18. getWxShippingStatus - 查询微信发货状态
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService / activityService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.mallService.json
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   products:
 *     - { status: 1, categoryId: 1 }               - 覆盖 getProductList / getCategoryStats
 *     - { createdBy: 1, updatedAt: -1 }             - 覆盖 batchUpdateProducts 权限校验
 *   orders:
 *     - { ownerId: 1, type: 1, status: 1, createdAt: -1 } - 覆盖 getMyOrders / getGroupBuyOrders
 *     - { orderNo: 1 }                              - 覆盖佣金记录查询
 */

// =====================================================================
// 公共类型（与 adminService / partnerService / userService / activityService 保持一致）
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
  category?: string
  categoryId?: string
  isFeatured?: boolean
  productId?: string
  productIds?: string[]
  orderId?: string
  // M11: getWxShippingStatus 使用，orderType 仅允许 'mall' | 'group_buy'
  orderIds?: string[]
  orderType?: string
  operation?: string
  name?: string
  description?: string
  price?: number
  originalPrice?: number
  coverUrl?: string
  images?: string[]
  stock?: number
  specs?: unknown[]
  skuId?: string
  quantity?: number
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type MallActionHandler = (
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

export interface SkuSpec {
  skuId?: string
  specText?: string
  price?: number
  stock?: number
  soldCount?: number
  [k: string]: unknown
}

export interface ProductRecord {
  _id?: string
  name?: string
  description?: string
  price?: number
  originalPrice?: number
  coverUrl?: string
  coverImage?: string
  images?: string[]
  detailImages?: string[]
  category?: string
  categoryId?: string
  stock?: number
  totalStock?: number
  soldCount?: number
  joinCount?: number
  specs?: unknown[]
  status?: string
  isFeatured?: boolean
  createdBy?: string
  skuType?: string
  skus?: SkuSpec[]
  minPrice?: number
  maxPrice?: number
  tags?: string[]
  subTitle?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface OrderRecord {
  _id?: string
  orderNo?: string
  productId?: string
  productName?: string
  productImage?: string
  skuId?: string
  skuText?: string
  unitPrice?: number
  quantity?: number
  totalAmount?: number
  totalPrice?: number
  basicPrice?: number
  originalAmount?: number
  couponId?: string
  couponDiscount?: number
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
  ownerId?: string
  ownerName?: string
  sellerId?: string
  status?: string
  type?: string
  // H6: 与 feedingService/tuanService/orderService 一致，新增订单须初始化 paymentStatus: 'unpaid'
  // orderTimeoutService 通过 paymentStatus='unpaid' 过滤待支付超时订单，缺失将导致超时取消失效
  paymentStatus?: string
  pendingReview?: boolean
  riskDecision?: string
  riskReasons?: string[]
  cancelReason?: string
  cancelledAt?: Date
  paidAt?: Date
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface RiskCheckResult {
  pendingReview: boolean
  reasons: string[]
  decision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT'
}

export interface PaginateResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface BatchUpdateResult {
  success: number
  failed: number
}

export interface CartItemStatus {
  status: string
  coverUrl: string
  name: string
  price: number
}

export interface UrlMap {
  [k: string]: string
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
const { err, isBusinessError } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectMallOrderRisk, mapActionToErrorCode } = require('./common/risk-control')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit')
// Sprint 50: 限流统一 bootstrap
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap')
// H1: 佣金记录统一使用 common/commission-utils（含自购保护、system_config 配置、幂等）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCommissionRecord: sharedCreateCommissionRecord, cancelCommissionRecord: sharedCancelCommissionRecord } = require('./common/commission-utils')
// M6: 静态 require 替代动态 import，减少冷启动开销并保留类型推断
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reconcileOrderWithWx } = require('./common/wxOrderSync')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getWxOrderStatus } = require('./common/wxAccessToken')

const { cloud, db } = initCloud()
const logger = createLogger('mallService')
const _ = db.command

// Sprint 50: 注入全局限流存储（rate_limits + rate_limit_configs 一次注入）
try {
  bootstrapRateLimit(db, { logger })
} catch (e) {
  logger.warn('bootstrapRateLimit failed, fallback to memory:', e && (e as Error).message)
}

// =====================================================================
// 辅助函数：商城下单风控前置
// =====================================================================

async function performMallOrderRiskCheck(ctx: {
  openid: string
  productId: string
  amountFen: number
}): Promise<RiskCheckResult> {
  const { openid, productId, amountFen } = ctx
  let pendingReview = false
  let riskDecision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT' = 'RISK_PASS'
  let riskReasons: string[] = []
  try {
    const risk = await withRateLimit(
      { userId: openid, type: 'mall_order', targetId: productId },
      () => detectMallOrderRisk({
        db,
        userId: openid,
        amountFen,
        targetId: productId,
      })
    )
    riskDecision = mapActionToErrorCode(risk.action) as 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT'
    riskReasons = risk.reasons
    if (risk.action === 'reject') {
      logger.warn('mallOrder.risk_reject', { userId: openid, productId, amountFen, reasons: risk.reasons })
      throw err('RISK_REJECT', '下单被风控拦截', {
        reasons: risk.reasons,
        level: risk.level,
        productId,
      })
    }
    if (risk.action === 'review') {
      pendingReview = true
      logger.info('mallOrder.risk_pending', { userId: openid, productId, amountFen, reasons: risk.reasons })
    } else {
      const debug = (logger as { debug?: (msg: string, meta: unknown) => void }).debug
      if (debug) { debug('mallOrder.risk_pass', { userId: openid, productId }) }
    }
  } catch (e) {
    if (isBusinessError(e) && ((e as { code?: string }).code === 'RATE_LIMITED' || (e as { code?: string }).code === 'RISK_REJECT')) {
      throw e
    }
    logger.warn('mallOrder.risk_control_error', { userId: openid, productId, msg: e && (e as Error).message })
    riskDecision = 'RISK_PASS'
  }
  return { pendingReview, reasons: riskReasons, decision: riskDecision }
}

// =====================================================================
// 辅助函数：批量获取临时文件 URL
// =====================================================================

/**
 * 有限并发执行器（M4: 用于 batchUpdateProducts 替代串行 await）
 * @param tasks 任务函数数组
 * @param concurrency 并发上限
 * @returns 按 tasks 顺序返回结果
 */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++
      results[idx] = await tasks[idx]()
    }
  }
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

async function batchGetTempFileURL(fileIds: string[]): Promise<UrlMap> {
  const BATCH_SIZE = 50
  const urlMap: UrlMap = {}
  for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    const batch = fileIds.slice(i, i + BATCH_SIZE)
    const res = await cloud.getTempFileURL({ fileList: batch })
    for (const f of (res.fileList || []) as { fileID?: string; tempFileURL?: string }[]) {
      if (f.tempFileURL && f.fileID) {
        urlMap[f.fileID] = f.tempFileURL
      }
    }
  }
  return urlMap
}

// =====================================================================
// 商品列表字段投影
// =====================================================================

const PRODUCT_LIST_FIELDS: Record<string, boolean> = {
  _id: true, name: true, coverUrl: true, coverImage: true, price: true, originalPrice: true,
  category: true, categoryId: true, stock: true, totalStock: true, soldCount: true,
  status: true, isFeatured: true, createdAt: true,
  skuType: true, specGroups: true, skus: true, minPrice: true, maxPrice: true,
  images: true, tags: true, subTitle: true,
}

// =====================================================================
// Handler 1: getProductList
// =====================================================================

export async function getProductList(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { page = 1, pageSize = 10, category, categoryId, status = 'on_sale', isFeatured } = event
  const where: Record<string, unknown> = { status }
  if (categoryId) {
    where.categoryId = categoryId
  } else if (category) {
    where.category = category
  }
  if (isFeatured !== undefined) { where.isFeatured = isFeatured }

  const result = await paginate(db, 'products', {
    page, pageSize, where, projection: PRODUCT_LIST_FIELDS,
  })

  const cloudUrls: string[] = []
  for (const item of (result.list as ProductRecord[])) {
    item.coverUrl = item.coverUrl || item.coverImage || ''
    if (item.coverUrl && item.coverUrl.startsWith('cloud://')) {
      cloudUrls.push(item.coverUrl)
    }
  }

  if (cloudUrls.length > 0) {
    try {
      const urlMap = await batchGetTempFileURL(cloudUrls)
      for (const item of (result.list as ProductRecord[])) {
        if (item.coverUrl && urlMap[item.coverUrl]) {
          item.coverUrl = urlMap[item.coverUrl]
        }
      }
    } catch (e) {
      logger.error('getProductList.getTempFileURL', e)
    }
  }

  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 2: getCategoryStats
// =====================================================================

export async function getCategoryStats(
  _event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  try {
    // M8: 使用 aggregate group 在数据库侧分组统计，避免 limit(1000) 静默截断
    const $ = _.aggregate || { sum: (n: number) => ({ $sum: n }) }
    const aggRes = await db.collection('products')
      .aggregate()
      .match({ status: 'on_sale' })
      .group({
        _id: { category: '$category', categoryId: '$categoryId' },
        count: $.sum(1),
      })
      .end()

    const stats: Record<string, number> = {}
    for (const item of (aggRes.list || []) as Array<{ _id: { category?: string; categoryId?: string }; count: number }>) {
      if (item._id && item._id.category) {
        stats[item._id.category] = (stats[item._id.category] || 0) + (item.count || 0)
      }
      if (item._id && item._id.categoryId) {
        stats[item._id.categoryId] = (stats[item._id.categoryId] || 0) + (item.count || 0)
      }
    }
    return handleSuccess(stats, '获取成功')
  } catch (error) {
    // M2: 区分集合未初始化与真实错误
    const errCode = (error as { errCode?: number }).errCode
    const msg = ((error as Error).message || '').toLowerCase()
    const collectionMissing =
      errCode === -502001 ||
      errCode === -501019 ||
      /collection.*(not.*exist|does.*not.*exist)/i.test(msg)
    if (collectionMissing) {
      logger.warn('getCategoryStats.collection_missing', { msg: (error as Error).message })
      return handleSuccess({}, '获取成功')
    }
    logger.error('getCategoryStats', error)
    throw error
  }
}

// =====================================================================
// Handler 3: listCategories
// =====================================================================

export async function listCategories(
  _event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  try {
    // M9: 分类理论上数量不多，但 limit(100) 仍可能在分类膨胀时静默截断
    //     采用分页拉取直到 isLastPage=true，确保返回完整分类列表
    const all: unknown[] = []
    const PAGE_SIZE = 100
    let page = 0
    while (true) {
      const res = await db.collection('categories')
        .orderBy('sortOrder', 'asc')
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .get()
      const data = (res.data || []) as unknown[]
      all.push(...data)
      if (data.length < PAGE_SIZE) { break }
      page++
      // 安全上限：防止异常数据导致死循环（1000 个分类足够业务使用）
      if (page >= 10) {
        logger.warn('listCategories.truncated_at_safety_limit', { count: all.length })
        break
      }
    }
    return handleSuccess(all, '获取成功')
  } catch (error) {
    // M2: 区分集合未初始化与真实错误
    const errCode = (error as { errCode?: number }).errCode
    const msg = ((error as Error).message || '').toLowerCase()
    const collectionMissing =
      errCode === -502001 ||
      errCode === -501019 ||
      /collection.*(not.*exist|does.*not.*exist)/i.test(msg)
    if (collectionMissing) {
      logger.warn('listCategories.collection_missing', { msg: (error as Error).message })
      return handleSuccess([], '获取成功')
    }
    logger.error('listCategories', error)
    return handleError(error, '获取分类列表失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 4: checkCartItems
// =====================================================================

export async function checkCartItems(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { productIds } = event
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return handleSuccess({}, '获取成功')
  }

  // M10: 校验 productIds 数量并限制单次查询上限，避免 limit(100) 静默截断
  //   - 购物车场景单次最多 50 个商品（与 getWxShippingStatus 一致的业务上限）
  //   - 超过则报错提示前端分批处理，防止静默丢失商品状态
  const MAX_CART_ITEMS = 50
  if (productIds.length > MAX_CART_ITEMS) {
    throw err('INVALID_PARAMS', `单次最多查询 ${MAX_CART_ITEMS} 个商品状态`)
  }

  try {
    const res = await db.collection('products')
      .where({ _id: _.in(productIds) })
      .field({ _id: true, status: true, coverUrl: true, coverImage: true, name: true, price: true })
      .limit(MAX_CART_ITEMS)
      .get()

    const cloudFileIds: string[] = []
    for (const item of (res.data || []) as ProductRecord[]) {
      const url = item.coverUrl || item.coverImage || ''
      if (url.startsWith('cloud://')) {
        cloudFileIds.push(url)
      }
    }

    const urlMap: UrlMap = {}
    if (cloudFileIds.length > 0) {
      try {
        const urlRes = await cloud.getTempFileURL({ fileList: cloudFileIds })
        for (const f of (urlRes.fileList || []) as { fileID?: string; tempFileURL?: string }[]) {
          if (f.tempFileURL && f.fileID) {
            urlMap[f.fileID] = f.tempFileURL
          }
        }
      } catch (e) {
        logger.error('checkCartItems.getTempFileURL', e)
      }
    }

    const statusMap: Record<string, CartItemStatus> = {}
    for (const item of (res.data || []) as ProductRecord[]) {
      const rawUrl = item.coverUrl || item.coverImage || ''
      const entry: CartItemStatus = {
        status: item.status || '',
        coverUrl: urlMap[rawUrl] || rawUrl,
        name: item.name || '',
        price: item.price || 0,
      }
      if (item._id) {
        statusMap[item._id] = entry
      }
    }
    return handleSuccess(statusMap, '获取成功')
  } catch (error) {
    // M2: 区分集合未初始化与真实错误
    const errCode = (error as { errCode?: number }).errCode
    const msg = ((error as Error).message || '').toLowerCase()
    const collectionMissing =
      errCode === -502001 ||
      errCode === -501019 ||
      /collection.*(not.*exist|does.*not.*exist)/i.test(msg)
    if (collectionMissing) {
      logger.warn('checkCartItems.collection_missing', { msg: (error as Error).message })
      return handleSuccess({}, '获取成功')
    }
    logger.error('checkCartItems', error)
    throw error
  }
}

// =====================================================================
// Handler 5: getProductDetail
// =====================================================================

export async function getProductDetail(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { productId } = event
  if (!productId) { throw err('INVALID_PARAMS', '缺少商品ID') }

  try {
    const res = await db.collection('products').doc(productId).get()
    const product = res.data as ProductRecord | null
    if (!product) {
      throw err('NOT_FOUND', '商品不存在')
    }

    product.coverUrl = product.coverUrl || product.coverImage || ''

    const cloudFields: (keyof ProductRecord)[] = ['coverUrl', 'coverImage']
    const cloudArrayFields: (keyof ProductRecord)[] = ['images', 'detailImages']
    const cloudUrls: string[] = []

    for (const field of cloudFields) {
      const val = product[field]
      if (typeof val === 'string' && val.startsWith('cloud://')) {
        cloudUrls.push(val)
      }
    }
    for (const field of cloudArrayFields) {
      const val = product[field]
      if (Array.isArray(val)) {
        for (const url of val) {
          if (typeof url === 'string' && url.startsWith('cloud://')) {
            cloudUrls.push(url)
          }
        }
      }
    }

    if (cloudUrls.length > 0) {
      try {
        const urlMap = await batchGetTempFileURL(cloudUrls)
        for (const field of cloudFields) {
          const val = product[field]
          if (typeof val === 'string' && urlMap[val]) {
            (product as Record<string, unknown>)[field as string] = urlMap[val]
          }
        }
        for (const field of cloudArrayFields) {
          const val = product[field]
          if (Array.isArray(val)) {
            const mapped = val.map((url: unknown) =>
              typeof url === 'string' && urlMap[url] ? urlMap[url] : url)
            ;(product as Record<string, unknown>)[field as string] = mapped
          }
        }
      } catch (e) {
        logger.error('getProductDetail.getTempFileURL', e)
      }
    }

    return handleSuccess(product, '获取成功')
  } catch (error) {
    // M3: 区分 NOT_FOUND 与其他错误（数据库异常、权限等）
    if (isBusinessError(error) && (error as { code?: string }).code === 'NOT_FOUND') {
      return handleError(error, '商品不存在', ERROR_CODES.NOT_FOUND)
    }
    logger.error('getProductDetail', error)
    return handleError(error, '获取商品详情失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 6: createProduct
// =====================================================================

export async function createProduct(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { name, description, price, originalPrice, coverUrl, images, category, stock, specs } = event
  if (!name) { throw err('INVALID_PARAMS', '缺少商品名称') }
  if (price === undefined || price === null) { throw err('INVALID_PARAMS', '缺少商品价格') }

  const product: ProductRecord = {
    name,
    description: description || '',
    price: Number(price),
    // L1: 移除双重类型断言，使用条件表达式
    originalPrice: originalPrice ? Number(originalPrice) : undefined,
    coverUrl: coverUrl || '',
    images: images || [],
    category: category || 'general',
    stock: Number(stock) || 0,
    soldCount: 0,
    specs: specs || [],
    status: 'draft',
    isFeatured: false,
    createdBy: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  product._id = generateId('product', openid)
  const res = await db.collection('products').add({ data: product })
  return handleSuccess({ id: res._id }, '创建成功')
}

// =====================================================================
// Handler 7: updateProduct
// =====================================================================

export async function updateProduct(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { productId } = event
  const { openid } = auth
  if (!productId) { throw err('INVALID_PARAMS', '缺少商品ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const updateData: Record<string, unknown> = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.product, event) }

  const existRes = await db.collection('products').doc(productId).get()
  const existData = existRes.data as ProductRecord | null
  if (!existData) {
    throw err('NOT_FOUND', '商品不存在')
  }
  if (existData.createdBy !== openid) {
    throw err('PERMISSION_DENIED', '无权修改此商品')
  }

  await db.collection('products').doc(productId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

// =====================================================================
// Handler 8: deleteProduct
// =====================================================================

export async function deleteProduct(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { productId } = event
  const { openid } = auth
  if (!productId) { throw err('INVALID_PARAMS', '缺少商品ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const existRes = await db.collection('products').doc(productId).get()
  const existData = existRes.data as ProductRecord | null
  if (!existData) {
    throw err('NOT_FOUND', '商品不存在')
  }
  if (existData.createdBy !== openid) {
    throw err('PERMISSION_DENIED', '无权下架此商品')
  }

  await db.collection('products').doc(productId).update({
    data: { status: 'off_sale', updatedAt: db.serverDate() },
  })
  return handleSuccess(null, '下架成功')
}

// =====================================================================
// Handler 9: batchUpdateProducts
// =====================================================================

export async function batchUpdateProducts(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { productIds, operation } = event
  const { openid } = auth

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    throw err('INVALID_PARAMS', '缺少商品ID列表')
  }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const VALID_OPERATIONS = ['on_shelf', 'off_shelf', 'delete', 'set_featured', 'unset_featured']
  if (!VALID_OPERATIONS.includes(operation || '')) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const STATUS_MAP: Record<string, string> = { on_shelf: 'on_sale', off_shelf: 'off_sale' }
  const results: BatchUpdateResult = { success: 0, failed: 0 }

  // M4: 改为有限并发，避免串行 await 在批量操作时触发云函数超时
  const BATCH_CONCURRENCY = 6
  const tasks = (productIds as string[]).map((productId) => async () => {
    try {
      // 验证商品归属权（防止操作其他用户的商品）
      const productRes = await db.collection('products').doc(productId).get()
      const product = productRes.data as { createdBy?: string } | null
      if (!product || product.createdBy !== openid) {
        logger.warn('batchUpdateProducts: permission denied', { productId, openid })
        results.failed++
        return
      }

      if (operation === 'delete') {
        await db.collection('products').doc(productId).remove()
      } else if (operation === 'set_featured') {
        await db.collection('products').doc(productId).update({
          data: { isFeatured: true, updatedAt: db.serverDate() },
        })
      } else if (operation === 'unset_featured') {
        await db.collection('products').doc(productId).update({
          data: { isFeatured: false, updatedAt: db.serverDate() },
        })
      } else if (operation) {
        await db.collection('products').doc(productId).update({
          data: { status: STATUS_MAP[operation], updatedAt: db.serverDate() },
        })
      }
      results.success++
    } catch (e) {
      logger.error('batchUpdateProducts', { productId, error: e })
      results.failed++
    }
  })
  await runWithConcurrency(tasks, BATCH_CONCURRENCY)

  return handleSuccess(results, `操作完成: 成功${results.success}个, 失败${results.failed}个`)
}

// =====================================================================
// Handler 10: createGroupBuyOrder（团购下单）
// =====================================================================

export async function createGroupBuyOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { productId, quantity = 1, receiverName, receiverPhone, receiverAddress } = event
  if (!productId) { throw err('INVALID_PARAMS', '缺少商品ID') }
  if (!receiverName) { throw err('INVALID_PARAMS', '请填写收货人姓名') }
  if (!receiverPhone) { throw err('INVALID_PARAMS', '请填写联系电话') }
  if (!receiverAddress) { throw err('INVALID_PARAMS', '请填写收货地址') }

  // Sprint 22: 团购下单前先做商品/库存预读 + 大额风控
  const productRes = await db.collection('products').doc(productId).get()
  const previewProduct = productRes.data as ProductRecord | null
  if (!previewProduct || previewProduct.status !== 'on_sale') {
    throw err('BUSINESS_ERROR', '商品已下架或不可购买')
  }
  const previewUnitPrice = Number(previewProduct.price) || 0
  const previewTotalAmount = Math.round(previewUnitPrice * Number(quantity) * 100)
  const groupRisk = await performMallOrderRiskCheck({
    openid,
    productId,
    amountFen: previewTotalAmount,
  })

  const transaction = await db.startTransaction()

  try {
    // H4: 事务内重新读取商品并校验库存，避免 TOCTOU 超卖竞态
    const txProductRes = await transaction.collection('products').doc(productId).get()
    const product = txProductRes.data as ProductRecord | null
    if (!product || product.status !== 'on_sale') {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '商品已下架或不可购买')
    }

    const availableStock = product.totalStock || product.stock || 0
    if (availableStock < Number(quantity)) {
      await transaction.rollback()
      throw err('STOCK_INSUFFICIENT', `库存不足，仅剩${availableStock}件`)
    }

    const unitPrice = product.price || 0
    // M1: 团购下单金额精度统一——使用整数分计算后转回元，避免浮点误差
    const totalAmount = Math.round(unitPrice * 100 * Number(quantity)) / 100
    const orderNo = `G${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    const order: OrderRecord = {
      orderNo,
      productId,
      productName: product.name || '',
      productImage: product.coverUrl || ((product.images && product.images[0]) as string) || '',
      unitPrice,
      quantity: Number(quantity),
      totalAmount,
      receiverName,
      receiverPhone,
      receiverAddress,
      ownerId: openid,
      ownerName: auth.nickName || '',
      sellerId: product.createdBy || '',
      status: 'pending_payment',
      type: 'group_buy',
      // H6: 与其他服务一致，待支付订单初始化 paymentStatus='unpaid'
      paymentStatus: 'unpaid',
      pendingReview: groupRisk.pendingReview,
      riskDecision: groupRisk.decision,
      riskReasons: groupRisk.reasons,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    order._id = generateId('order', openid)
    const addRes = await transaction.collection('orders').add({ data: order })

    await transaction.collection('products').doc(productId).update({
      data: {
        totalStock: _.inc(-Number(quantity)),
        stock: _.inc(-Number(quantity)),
        soldCount: _.inc(Number(quantity)),
        joinCount: _.inc(Number(quantity)),
        updatedAt: db.serverDate(),
      },
    })

    await transaction.commit()
    return handleSuccess({ orderId: addRes._id, ...order }, '下单成功')
  } catch (error) {
    await transaction.rollback()
    return handleError(error, '下单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 11: createOrder（商城下单）
// =====================================================================

export async function createOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { productId, skuId, quantity = 1, receiverName, receiverPhone, receiverAddress } = event
  if (!productId) { throw err('INVALID_PARAMS', '缺少商品ID') }
  if (!receiverAddress) { throw err('INVALID_PARAMS', '缺少收货地址') }

  // Sprint 22: 商城下单前先做商品预读 + 大额风控
  const productRes = await db.collection('products').doc(productId).get()
  const previewProduct = productRes.data as ProductRecord | null
  if (!previewProduct || previewProduct.status !== 'on_sale') {
    throw err('BUSINESS_ERROR', '商品不可购买')
  }
  let previewUnitPrice = Number(previewProduct.price) || 0
  if (previewProduct.skuType === 'multi' && skuId) {
    const sku = (previewProduct.skus || []).find((s: SkuSpec) => s.skuId === skuId)
    if (!sku) { throw err('BUSINESS_ERROR', 'SKU不存在') }
    previewUnitPrice = Number(sku.price) || 0
  }
  const previewTotalAmount = Math.round(previewUnitPrice * Number(quantity) * 100)
  const orderRisk = await performMallOrderRiskCheck({
    openid,
    productId,
    amountFen: previewTotalAmount,
  })

  const transaction = await db.startTransaction()

  try {
    // H4: 事务内重新读取商品并校验，避免 TOCTOU 超卖竞态
    const txProductRes = await transaction.collection('products').doc(productId).get()
    const product = txProductRes.data as ProductRecord | null
    if (!product || product.status !== 'on_sale') {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '商品不可购买')
    }

    let unitPrice = product.price || 0
    let skuText = ''
    let stockKey = 'stock'

    if (product.skuType === 'multi' && skuId) {
      const skuIndex = product.skus ? product.skus.findIndex((s: SkuSpec) => s.skuId === skuId) : -1
      if (skuIndex < 0) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', 'SKU不存在')
      }
      const sku = product.skus && product.skus[skuIndex]
      if (!sku || (sku.stock !== undefined && sku.stock < Number(quantity))) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', '库存不足')
      }
      unitPrice = sku.price || 0
      skuText = sku.specText || ''
      stockKey = `skus.${skuIndex}.stock`
    } else {
      const availableStock = product.totalStock || product.stock || 0
      if (availableStock < Number(quantity)) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', '库存不足')
      }
    }

    const orderNo = `M${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    const order: OrderRecord = {
      orderNo,
      productId,
      productName: product.name || '',
      productImage: product.coverImage || product.coverUrl || ((product.images && product.images[0]) as string) || '',
      skuId: skuId || '',
      skuText,
      unitPrice,
      quantity: Number(quantity),
      // P0-3: 使用整数分计算避免浮点精度
      totalAmount: Math.round(unitPrice * 100 * Number(quantity)) / 100,
      receiverName: receiverName || '',
      receiverPhone: receiverPhone || '',
      receiverAddress,
      ownerId: openid,
      ownerName: auth.nickName || '',
      status: 'pending_payment',
      type: 'mall',
      // H6: 与其他服务一致，待支付订单初始化 paymentStatus='unpaid'
      paymentStatus: 'unpaid',
      pendingReview: orderRisk.pendingReview,
      riskDecision: orderRisk.decision,
      riskReasons: orderRisk.reasons,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    order._id = generateId('order', openid)
    const orderAddRes = await transaction.collection('orders').add({ data: order })

    const updateData: Record<string, unknown> = {
      totalStock: _.inc(-Number(quantity)),
      soldCount: _.inc(Number(quantity)),
      updatedAt: db.serverDate(),
    }

    if (product.skuType === 'multi' && skuId) {
      updateData[stockKey] = _.inc(-Number(quantity))
      const skuIndex = product.skus ? product.skus.findIndex((s: SkuSpec) => s.skuId === skuId) : -1
      if (skuIndex >= 0) {
        updateData[`skus.${skuIndex}.soldCount`] = _.inc(Number(quantity))
      }
    } else {
      updateData.stock = _.inc(-Number(quantity))
    }

    await transaction.collection('products').doc(productId).update({ data: updateData })
    await transaction.commit()
    return handleSuccess({ orderId: orderAddRes._id, orderNo }, '下单成功')
  } catch (error) {
    await transaction.rollback()
    return handleError(error, '下单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 12: getMyOrders
// =====================================================================

export async function getMyOrders(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { status, page = 1, pageSize = 20 } = event
  // H5: 修复 where.status 冲突——原逻辑 _.neq('deleted') 会被传入的 status 覆盖，导致泄露已删除订单
  const where: Record<string, unknown> = { ownerId: openid, type: 'mall' }
  if (status && status !== 'all' && status !== 'deleted') {
    where.status = status
  } else {
    where.status = _.neq('deleted')
  }

  try {
    const result = await paginate(db, 'orders', {
      page,
      pageSize,
      where,
      orderBy: { field: 'createdAt', direction: 'desc' },
    })
    return handleSuccess(result)
  } catch (error) {
    logger.error('getMyOrders', error)
    return handleError(error, '获取商城订单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 13: getGroupBuyOrders
// =====================================================================

export async function getGroupBuyOrders(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { status, page = 1, pageSize = 20 } = event
  // H5: 同 getMyOrders，防止已删除订单泄露
  const where: Record<string, unknown> = { ownerId: openid, type: 'group_buy' }
  if (status && status !== 'all' && status !== 'deleted') {
    where.status = status
  } else {
    where.status = _.neq('deleted')
  }

  try {
    const result = await paginate(db, 'orders', {
      page,
      pageSize,
      where,
      orderBy: { field: 'createdAt', direction: 'desc' },
    })
    return handleSuccess(result)
  } catch (error) {
    logger.error('getGroupBuyOrders', error)
    return handleError(error, '获取团购订单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 14: cancelOrder
// =====================================================================

export async function cancelOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { orderId } = event
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const orderData = orderRes.data as OrderRecord | null
    if (!orderData || orderData.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限操作此订单')
    }

    const cancellableStatuses = ['pending_payment', 'pending_shipment']
    if (!cancellableStatuses.includes(orderData.status || '')) {
      throw err('BUSINESS_ERROR', '当前订单状态不可取消')
    }

    // H7: 校验 paymentStatus，防止取消已支付订单（与 feedingService M6 一致）
    //   - unpaid：允许取消（待支付订单超时/主动取消）
    //   - paid：拒绝取消（已支付订单须走退款流程，不可直接取消）
    //   - 其他/缺失：拒绝并告警，需人工核对
    const paymentStatus = String(orderData.paymentStatus || '').toLowerCase()
    if (paymentStatus && paymentStatus !== 'unpaid') {
      logger.warn('cancelOrder.invalid_payment_status', {
        orderId, status: orderData.status, paymentStatus,
      })
      if (paymentStatus === 'paid') {
        throw err('BUSINESS_ERROR', '订单已支付，无法直接取消，请走退款流程')
      }
      throw err('BUSINESS_ERROR', `订单支付状态异常：${paymentStatus || '(空)'}`)
    }

    // 预查商品 SKU 索引（事务外预读，事务内仅做 update）
    let skuIndex = -1
    if (orderData.skuId && orderData.productId) {
      const productRes = await db.collection('products').doc(orderData.productId).get()
      const productData = productRes.data as ProductRecord | null
      if (productData && productData.skus) {
        skuIndex = productData.skus.findIndex((s: SkuSpec) => s.skuId === orderData.skuId)
      }
    }

    // 事务：订单状态更新 + 库存回退原子化，避免库存泄漏
    const transaction = await db.startTransaction()
    try {
      await transaction.collection('orders').doc(orderId).update({
        data: { status: 'cancelled', cancelReason: '买家主动取消', cancelledAt: db.serverDate(), updatedAt: db.serverDate() },
      })

      if (orderData.productId) {
        const qty = orderData.quantity || 1
        const stockUpdateData: Record<string, unknown> = {
          totalStock: _.inc(qty),
          soldCount: _.inc(-qty),
          stock: _.inc(qty),
          updatedAt: db.serverDate(),
        }

        if (orderData.skuId && skuIndex >= 0) {
          stockUpdateData[`skus.${skuIndex}.stock`] = _.inc(qty)
          stockUpdateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty)
        }

        await transaction.collection('products').doc(orderData.productId).update({
          data: stockUpdateData,
        })
      }

      await transaction.commit()
    } catch (txError) {
      await transaction.rollback()
      throw txError
    }

    // 取消佣金记录（best-effort，独立于事务，失败不影响取消结果）
    // 使用 common/commission-utils 共享实现（含幂等检查）
    try {
      await sharedCancelCommissionRecord(orderId)
    } catch (commissionErr) {
      logger.warn('cancelCommissionRecord', { msg: (commissionErr as Error)?.message })
    }

    return handleSuccess(null, '取消成功')
  } catch (error) {
    logger.error('cancelOrder', error)
    return handleError(error, '取消订单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 15: getOrderDetail
// =====================================================================

export async function getOrderDetail(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { orderId } = event
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const orderData = orderRes.data as OrderRecord | null
    if (!orderData || orderData.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限查看此订单')
    }

    return handleSuccess(orderData, '获取成功')
  } catch (error) {
    logger.error('getOrderDetail', error)
    return handleError(error, '获取订单详情失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 16: confirmReceive
// =====================================================================

export async function confirmReceive(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { orderId } = event
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    let orderData = orderRes.data as OrderRecord | null
    if (!orderData || orderData.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限操作此订单')
    }

    // ★ Plan A Bonus：确认收货前先对账一次——避免 wx 已确认收货（order_state=3）但本地还是 shipped
    // 用户在小程序能进入这个流程意味着已经从 wx 端完成收货，强制同步一次。
    if (orderData.status === 'shipped' || orderData.status === 'paid' || orderData.status === 'confirmed') {
      try {
        // M6: 改用顶部静态 require 的 reconcileOrderWithWx
        const sync = await reconcileOrderWithWx({ db, logger, order: orderData as any })
        if (sync.changed) {
          orderData = { ...orderData, status: sync.after } as OrderRecord
        }
      } catch (e) {
        logger.warn('confirmReceive.preReconcileFailed', e)
      }
    }

    if (orderData.status !== 'shipped') {
      throw err('BUSINESS_ERROR', '当前订单状态不可确认收货')
    }

    await db.collection('orders').doc(orderId).update({
      data: { status: 'completed', updatedAt: db.serverDate() },
    })

    return handleSuccess(null, '确认收货成功')
  } catch (error) {
    logger.error('confirmReceive', error)
    return handleError(error, '确认收货失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 17: deleteOrder
// =====================================================================

export async function deleteOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { orderId } = event
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const orderData = orderRes.data as OrderRecord | null
    if (!orderData || orderData.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限操作此订单')
    }

    const deletableStatuses = ['completed', 'cancelled']
    if (!deletableStatuses.includes(orderData.status || '')) {
      throw err('BUSINESS_ERROR', '当前订单状态不可删除')
    }

    await db.collection('orders').doc(orderId).update({
      data: { status: 'deleted', updatedAt: db.serverDate() },
    })

    return handleSuccess(null, '删除成功')
  } catch (error) {
    logger.error('deleteOrder', error)
    return handleError(error, '删除订单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 18: getWxShippingStatus
// =====================================================================
//
// 桥接 wx 平台"发货信息管理"——商家在 https://mp.weixin.qq.com/wxamp/order
// 后台发货时，订单在我们后端 orders 集合中 status 仍可能是 paid/confirmed，
// 但实际已发货。本接口按 orderIds 批量调 wx getOrder 接口，返回
// order_state 与 shipping 字段，供前端判断 wx 平台发货状态。
//
// 返回结构：
//   { code, data: { items: [{ orderId, ok, order_state, shipping, error }] } }

export async function getWxShippingStatus(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { orderIds, orderType } = event
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw err('INVALID_PARAMS', '缺少 orderIds')
  }
  if (orderIds.length > 50) {
    throw err('INVALID_PARAMS', '单次最多查询 50 个订单')
  }

  // M11: orderType 白名单校验，防止注入任意字符串查询其他业务订单
  //   - mallService 仅管理 'mall' 和 'group_buy' 两种订单类型
  //   - 传入其他值（如 'boarding'/'feeding'）应拒绝，避免越权查询
  const ALLOWED_ORDER_TYPES = ['mall', 'group_buy'] as const
  if (orderType !== undefined && !(ALLOWED_ORDER_TYPES as readonly string[]).includes(orderType)) {
    throw err('INVALID_PARAMS', `无效的 orderType，仅支持：${ALLOWED_ORDER_TYPES.join(', ')}`)
  }

  // M6: 改用顶部静态 require 的 getWxOrderStatus / reconcileOrderWithWx
  // 订单统一存在 orders 集合，通过 type 字段区分 mall / group_buy
  // （曾经误写为 'group_buy_orders'，但该集合不存在，订单都在 orders 里）
  const collection = 'orders'
  // L3: 严格化 baseWhere 类型，避免 any
  const baseWhere: Record<string, unknown> = { _id: db.command.in(orderIds), ownerId: openid }
  if (orderType === 'group_buy' || orderType === 'mall') {
    baseWhere.type = orderType
  }

  try {
    // 批量查订单的 transaction_id（wx 支付订单号）
    // M5: 删除冗余的 `const _ = db`，避免遮蔽顶部的 db.command
    const orderRes = await db.collection(collection)
      .where(baseWhere)
      .field({ _id: true, transactionId: true, wxTransactionId: true, paidAt: true, status: true, type: true, paymentStatus: true })
      .get()
    const orderMap = new Map<string, any>()
    for (const o of (orderRes.data as any[]) || []) {
      orderMap.set(o._id, o)
    }

    const items = await Promise.all(orderIds.map(async (orderId: string) => {
      const o = orderMap.get(orderId)
      if (!o) {return { orderId, ok: false, error: '订单不存在或无权限' }}
      const transactionId = o.wxTransactionId || o.transactionId || ''
      if (!transactionId) {
        return { orderId, ok: false, error: '该订单缺少 transactionId，无法查询 wx 发货状态' }
      }
      // ★ Plan A：对账式拉取——调 wx getOrder + 按需回写 orders
      const sync = await reconcileOrderWithWx({
        db,
        logger,
        order: { ...o, _id: o._id },
      })
      if (!sync.ok) {
        return { orderId, ok: false, error: sync.error || 'reconcile_failed', wxState: sync.wxState }
      }
      return {
        orderId,
        ok: true,
        order_state: sync.wxState,
        shipping: o.wxShipping || null, // 回写后本次返回的还是原对象引用；用 sync.after 携带最新 status
        transaction_id: transactionId,
        before: sync.before || null,
        after: sync.after || null,
        changed: sync.changed,
      }
    }))

    return handleSuccess({ items })
  } catch (error) {
    logger.error('getWxShippingStatus', error)
    return handleError(error, '查询 wx 发货状态失败', ERROR_CODES.SERVER)
  }
}

// =====================================================================
// 入口聚合：handlers 路由表
// =====================================================================

export const handlers: Record<string, MallActionHandler> = {
  getProductList,
  getProductDetail,
  getCategoryStats,
  listCategories,
  checkCartItems,
  createProduct,
  updateProduct,
  deleteProduct,
  batchUpdateProducts,
  createOrder,
  createGroupBuyOrder,
  getMyOrders,
  getGroupBuyOrders,
  getOrderDetail,
  cancelOrder,
  confirmReceive,
  deleteOrder,
  getWxShippingStatus,
}

// =====================================================================
// Main 入口（云函数调用）
// =====================================================================

export async function main(
  event: CloudEvent,
  context: CloudContext
): Promise<unknown> {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const WRITE_ACTIONS = [
    'createOrder', 'createGroupBuyOrder', 'cancelOrder', 'confirmReceive',
    'deleteOrder',
  ]
  // H3: 商品管理操作需要 admin 权限，防止任意用户创建/修改/删除商品
  const ADMIN_ACTIONS = ['createProduct', 'updateProduct', 'deleteProduct', 'batchUpdateProducts']
  const requireLogin = WRITE_ACTIONS.includes(action) || ADMIN_ACTIONS.includes(action)
  const requireAdmin = ADMIN_ACTIONS.includes(action)

  try {
    const auth = await verifyAuth(event, { requireLogin, ...(requireAdmin ? { permission: 'admin' } : {}) })
    logger.info(action, { openid: auth.openid, isAdmin: !!(auth as AuthLike & { isAdmin?: boolean }).isAdmin })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    const code = (error as { code?: string }).code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message, code)
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  getProductList,
  getProductDetail,
  getCategoryStats,
  listCategories,
  checkCartItems,
  createProduct,
  updateProduct,
  deleteProduct,
  batchUpdateProducts,
  createOrder,
  createGroupBuyOrder,
  getMyOrders,
  getGroupBuyOrders,
  getOrderDetail,
  cancelOrder,
  confirmReceive,
  deleteOrder,
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getProductList,
  getProductDetail,
  getCategoryStats,
  listCategories,
  checkCartItems,
  createProduct,
  updateProduct,
  deleteProduct,
  batchUpdateProducts,
  createOrder,
  createGroupBuyOrder,
  getMyOrders,
  getGroupBuyOrders,
  getOrderDetail,
  cancelOrder,
  confirmReceive,
  deleteOrder,
  handlers,
}
