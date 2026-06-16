/**
 * mallService/index.ts - 商城服务主入口（TypeScript 源文件 - Sprint 40 迁移）
 *
 * 业务功能：
 *   - 商品管理（CRUD + 批量操作 + 上下架/精选）
 *   - 商品浏览（列表 / 详情 / 分类统计 / 购物车状态）
 *   - 下单流程（普通下单 + 团购下单，含风控前置）
 *   - 订单管理（我的订单 / 详情 / 取消 / 确认收货 / 删除）
 *
 * 共 16 个 action：
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
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService / activityService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.mallService.json
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
// 辅助函数：佣金记录
// =====================================================================

async function createCommissionRecord(orderType: string, order: OrderRecord): Promise<void> {
  try {
    if (!order.ownerId) { return }
    let user: UserRecord | null = null
    try {
      const userRes = await db.collection('users').doc(order.ownerId).field({ _id: true, inviterId: true }).get()
      user = userRes.data
    } catch (e) {
      logger.warn('commission.users.fetch', { ownerId: order.ownerId, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      return
    }
    if (!user || !user.inviterId) { return }

    let config: Record<string, unknown> = {}
    try {
      const configRes = await db.collection('tuan_config').doc('commission_rates').get()
      config = configRes.data || {}
    } catch (e) {
      logger.warn('commission.tuan_config', { code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      return
    }
    const rate = config[orderType] !== undefined ? Number(config[orderType]) : 0
    if (!rate || rate <= 0) { return }

    const orderAmount = Number(order.totalAmount || order.totalPrice || order.basicPrice || 0)
    if (orderAmount <= 0) { return }
    const commissionAmount = Math.round(orderAmount * rate / 100 * 100) / 100

    let inviter: UserRecord | null = null
    try {
      const inviterRes = await db.collection('users').doc(user.inviterId).field({ _id: true, nickName: true }).get()
      inviter = inviterRes.data
    } catch (e) {
      logger.warn('commission.inviter.fetch', { inviterId: user.inviterId, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      return
    }
    if (!inviter) { return }

    const existRes = await db.collection('tuan_commissions').where({ orderNo: order.orderNo || order._id, inviterId: user.inviterId }).count()
    if (existRes.total > 0) { return }

    const commissionId = generateId('commission', order.ownerId)
    await db.collection('tuan_commissions').add({
      data: {
        _id: commissionId,
        inviterId: user.inviterId,
        inviterNickName: inviter.nickName || '',
        ownerId: user._id || order.ownerId,
        orderType,
        orderId: order._id,
        orderNo: order.orderNo || order._id,
        orderAmount,
        commissionRate: rate,
        commissionAmount,
        status: 'pending',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
    logger.info('commission_created', { orderType, orderNo: order.orderNo || order._id, amount: orderAmount, rate, commission: commissionAmount })
  } catch (e) {
    logger.error('commission_error', e)
  }
}

// =====================================================================
// 辅助函数：批量获取临时文件 URL
// =====================================================================

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
    const res = await db.collection('products')
      .where({ status: 'on_sale' })
      .field({ category: true, categoryId: true })
      .limit(1000)
      .get()

    const stats: Record<string, number> = {}
    for (const item of (res.data || []) as ProductRecord[]) {
      if (item.category) {
        stats[item.category] = (stats[item.category] || 0) + 1
      }
      if (item.categoryId) {
        stats[item.categoryId] = (stats[item.categoryId] || 0) + 1
      }
    }
    return handleSuccess(stats, '获取成功')
  } catch (error) {
    logger.error('getCategoryStats', error)
    return handleSuccess({}, '获取成功')
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
    const res = await db.collection('categories')
      .orderBy('sortOrder', 'asc')
      .limit(100)
      .get()
    return handleSuccess(res.data, '获取成功')
  } catch (error) {
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

  try {
    const res = await db.collection('products')
      .where({ _id: _.in(productIds) })
      .field({ _id: true, status: true, coverUrl: true, coverImage: true, name: true, price: true })
      .limit(100)
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
    logger.error('checkCartItems', error)
    return handleSuccess({}, '获取成功')
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
    return handleError(error, '商品不存在', ERROR_CODES.NOT_FOUND)
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
    originalPrice: Number(originalPrice) || undefined as unknown as number,
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

  for (const productId of productIds as string[]) {
    try {
      // 验证商品归属权（防止操作其他用户的商品）
      const productRes = await db.collection('products').doc(productId).get()
      const product = productRes.data as { createdBy?: string } | null
      if (!product || product.createdBy !== openid) {
        logger.warn('batchUpdateProducts: permission denied', { productId, openid })
        results.failed++
        continue
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
  }

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
    const product = previewProduct
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
    const totalAmount = unitPrice * Number(quantity)
    const orderNo = `G${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`

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
    const product = previewProduct
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

    const orderNo = `M${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`

    const order: OrderRecord = {
      orderNo,
      productId,
      productName: product.name || '',
      productImage: product.coverImage || product.coverUrl || ((product.images && product.images[0]) as string) || '',
      skuId: skuId || '',
      skuText,
      unitPrice,
      quantity: Number(quantity),
      totalAmount: unitPrice * Number(quantity),
      receiverName: receiverName || '',
      receiverPhone: receiverPhone || '',
      receiverAddress,
      ownerId: openid,
      ownerName: auth.nickName || '',
      status: 'pending_payment',
      type: 'mall',
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
  const where: Record<string, unknown> = { ownerId: openid, type: 'mall', status: _.neq('deleted') }
  if (status && status !== 'all') { where.status = status }

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
  const where: Record<string, unknown> = { ownerId: openid, type: 'group_buy', status: _.neq('deleted') }
  if (status && status !== 'all') { where.status = status }

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

    await db.collection('orders').doc(orderId).update({
      data: { status: 'cancelled', cancelReason: '买家主动取消', cancelledAt: db.serverDate(), updatedAt: db.serverDate() },
    })

    // 取消佣金记录
    try {
      const { cancelCommissionRecord } = require('../../common/commission-utils')
      await cancelCommissionRecord(orderId)
    } catch (commissionErr) {
      logger.warn('cancelCommissionRecord', { msg: (commissionErr as Error)?.message })
    }

    const qty = orderData.quantity || 1
    const stockUpdateData: Record<string, unknown> = {
      totalStock: _.inc(qty),
      soldCount: _.inc(-qty),
      stock: _.inc(qty),
      updatedAt: db.serverDate(),
    }

    if (orderData.skuId && orderData.productId) {
      const productRes = await db.collection('products').doc(orderData.productId).get()
      const productData = productRes.data as ProductRecord | null
      if (productData && productData.skus) {
        const skuIndex = productData.skus.findIndex((s: SkuSpec) => s.skuId === orderData.skuId)
        if (skuIndex >= 0) {
          stockUpdateData[`skus.${skuIndex}.stock`] = _.inc(qty)
          stockUpdateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty)
        }
      }
    }

    if (orderData.productId) {
      await db.collection('products').doc(orderData.productId).update({
        data: stockUpdateData,
      })
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
        // @ts-ignore -- wxOrderSync.js 是 .js 写法
        const { reconcileOrderWithWx } = await import('./common/wxOrderSync')
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

  // @ts-ignore -- 编译产物 mallService/common/wxAccessToken.js 没有 .d.ts
  const { getWxOrderStatus } = await import('./common/wxAccessToken')
  // @ts-ignore -- 同上，wxOrderSync.js 是 .js 写法（被 orderReconcileService 复用）
  const { reconcileOrderWithWx } = await import('./common/wxOrderSync')
  // 订单统一存在 orders 集合，通过 type 字段区分 mall / group_buy
  // （曾经误写为 'group_buy_orders'，但该集合不存在，订单都在 orders 里）
  const collection = 'orders'
  const baseWhere: Record<string, any> = { _id: db.command.in(orderIds), ownerId: openid }
  if (orderType === 'group_buy' || orderType === 'mall') {
    baseWhere.type = orderType
  }

  try {
    // 批量查订单的 transaction_id（wx 支付订单号）
    const _ = db
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
    'createProduct', 'updateProduct', 'deleteProduct', 'batchUpdateProducts',
    'createOrder', 'createGroupBuyOrder', 'cancelOrder', 'confirmReceive',
    'deleteOrder', 'getGroupBuyOrders',
  ]
  const requireLogin = WRITE_ACTIONS.includes(action)

  try {
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
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
