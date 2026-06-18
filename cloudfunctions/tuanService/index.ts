/**
 * tuanService/index.ts - 团购服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - getTuanDealList - 拉取团购列表（分页 + 状态过滤 + 计算 minPrice）
 *   - getTuanDealDetail - 拉取团购详情（含 SKU 维度 minPrice 计算）
 *   - createTuanOrder - 创建团购订单（含库存扣减 + 双订单写入）
 *
 * 迁移目标：
 *   - 强类型化 3 个 action handler 签名
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
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')

const { cloud, db } = initCloud()
const logger = createLogger('tuanService')
const _ = db.command

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
// Action 1：拉取团购列表
// =====================================================================

export async function getTuanDealList(event: CloudEvent): Promise<unknown> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, status } = event
  const where: Record<string, unknown> = {}
  if (status) {
    where.status = status
  } else {
    where.status = _.in(['published', 'active'])
  }
  const now = new Date()
  where.startTime = _.lte(now)
  where.endTime = _.gte(now)

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
            if (price < (p.minSkuPrice as number)) { p.minSkuPrice = price }
          }
        }
        if (p.minSkuPrice === Infinity) { p.minSkuPrice = p.tuanPrice || 0 }
      }
    }
    return handleSuccess(deal, '获取成功')
  } catch (error) {
    return handleError(error, '团购不存在', ERROR_CODES.NOT_FOUND)
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

  const { dealId, productId, skuId, quantity = 1, tuanPrice, totalAmount, originalAmount, couponId, couponDiscount, specText, receiverName, receiverPhone, receiverAddress, remark } = event
  if (!dealId) { throw err('INVALID_PARAMS', '缺少dealId') }
  if (!productId) { throw err('INVALID_PARAMS', '缺少productId') }

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
    finalStock = Number(sku.stock) || 0
    if (finalStock < (quantity as number)) { throw err('BUSINESS_ERROR', '库存不足') }
  } else {
    if (finalStock < (quantity as number)) { throw err('BUSINESS_ERROR', '库存不足') }
  }

  // 金额始终从数据库价格计算，忽略客户端传入的 totalAmount（防止金额篡改）
  const finalAmount = finalPrice * (quantity as number)

  // 仅在使用优惠券时，校验优惠后金额下限（直接使用前端传入的已扣券金额）
  if (couponId && Number(totalAmount) > 0 && Number(totalAmount) < 0.1) {
    throw err('INVALID_PARAMS', '优惠后订单金额必须 ≥ 0.1 元')
  }

  const orderNo = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`

  const order: TuanOrder = {
    dealId: dealId as string,
    productId: productId as string,
    skuId: (skuId as string) || '',
    specText: (specText as string) || '',
    ownerId: openid,
    quantity: quantity as number,
    tuanPrice: finalPrice,
    originalAmount: (originalAmount as number) || finalAmount,
    totalAmount: finalAmount,
    couponId: (couponId as string) || '',
    couponDiscount: Number(couponDiscount) || 0,
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  order._id = generateId('tuan', openid)
  const orderRes = await db.collection('tuan_orders').add({ data: order })

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
    originalAmount: (originalAmount as number) || finalAmount,
    totalAmount: finalAmount,
    couponId: (couponId as string) || '',
    couponDiscount: Number(couponDiscount) || 0,
    receiverName: (receiverName as string) || '',
    receiverPhone: (receiverPhone as string) || '',
    receiverAddress: (receiverAddress as string) || '',
    remark: (remark as string) || '',
    ownerId: openid,
    status: 'pending_payment',
    type: 'group_buy',
    tuanOrderId: orderRes._id,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  unifiedOrder._id = generateId('order', openid)
  const unifiedOrderRes = await db.collection('orders').add({ data: unifiedOrder })

  const updateData: Record<string, unknown> = {
    totalOrders: _.inc(1),
    totalAmount: _.inc(finalAmount),
    updatedAt: new Date(),
  }

  const productIndex = dealProducts.indexOf(dealProduct)
  
  // 原子性库存扣减：重新查询最新库存并验证
  const freshDealRes = await db.collection('tuan_deals').doc(dealId as string).get()
  const freshDeal = freshDealRes.data as TuanDeal
  const freshProducts = freshDeal.products || []
  const freshProduct = freshProducts.find(p => p.productId === productId)
  
  if (!freshProduct) {
    throw err('BUSINESS_ERROR', '商品不存在')
  }
  
  // 验证最新库存
  if (skuId && freshProduct.skuType === 'multi' && freshProduct.skus) {
    const freshSku = freshProduct.skus.find(s => s.skuId === skuId)
    if (!freshSku) {
      throw err('BUSINESS_ERROR', 'SKU不存在')
    }
    const freshSkuStock = Number(freshSku.stock) || 0
    if (freshSkuStock < (quantity as number)) {
      throw err('BUSINESS_ERROR', '库存不足')
    }
  } else {
    const freshStock = Number(freshProduct.stock) || 0
    if (freshStock < (quantity as number)) {
      throw err('BUSINESS_ERROR', '库存不足')
    }
  }
  
  // 执行库存扣减
  const freshProductIndex = freshProducts.indexOf(freshProduct)
  if (skuId && freshProduct.skuType === 'multi' && freshProduct.skus) {
    // Multi-SKU 商品：只扣减 SKU 级库存，不扣减商品级库存（避免双重扣减）
    const skuIndex = freshProduct.skus.findIndex(s => s.skuId === skuId)
    if (skuIndex >= 0) {
      updateData[`products.${freshProductIndex}.skus.${skuIndex}.stock`] = _.inc(-(quantity as number))
      updateData[`products.${freshProductIndex}.skus.${skuIndex}.sold`] = _.inc(quantity as number)
    }
  } else {
    // 非 Multi-SKU 商品：扣减商品级库存
    updateData[`products.${freshProductIndex}.stock`] = _.inc(-(quantity as number))
    updateData[`products.${freshProductIndex}.sold`] = _.inc(quantity as number)
  }

  await db.collection('tuan_deals').doc(dealId as string).update({ data: updateData })

  return handleSuccess({ _id: orderRes._id, unifiedOrderId: unifiedOrderRes._id, ...order }, '下单成功')
}

// =====================================================================
// Handler 4: shipTuanOrder（商家发货）
// =====================================================================
async function shipTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown> {
  const { orderId } = event.data || {}
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
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

  await db.collection('orders').doc(orderId as string).update({
    data: { status: 'pending_shipment', updatedAt: db.serverDate() },
  })

  if (order.tuanOrderId) {
    try {
      await db.collection('tuan_orders').doc(order.tuanOrderId).update({
        data: { status: 'pending_shipment', updatedAt: db.serverDate() },
      })
    } catch (e) {
      logger.warn('shipTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: (e as Error).message })
    }
  }

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
      logger.warn('confirmReceiveTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: (e as Error).message })
    }
  }

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

  // 取消佣金
  try {
    const { cancelCommissionRecord } = require('./common/commission-utils')
    await cancelCommissionRecord(orderId as string)
    logger.info('cancelTuanOrder.cancelCommissionRecord.success', { orderId })
  } catch (e) {
    logger.warn('cancelTuanOrder.cancelCommissionRecord.failed', { orderId, msg: (e as Error).message })
  }

  // 调用微信支付退款（已支付/待发货状态）
  if (['paid', 'pending_shipment'].includes(order.status)) {
    try {
      const totalAmount = Math.round(Number(order.totalAmount) * 100)
      if (totalAmount > 0) {
        await cloud.callFunction({
          name: 'paymentService',
          data: {
            action: 'createRefund',
            outTradeNo: order.orderNo || (orderId as string),
            refundAmount: totalAmount,
            totalAmount: totalAmount,
          },
        })
        logger.info('cancelTuanOrder.refundCreated', { orderId })
      }
    } catch (e) {
      logger.warn('cancelTuanOrder.refundFailed', { orderId, msg: (e as Error).message })
    }
  }

  // 未支付订单直接标记取消
  if (order.status === 'pending_payment') {
    await db.collection('orders').doc(orderId as string).update({
      data: { status: 'cancelled', updatedAt: db.serverDate() },
    })
    if (order.tuanOrderId) {
      try {
        await db.collection('tuan_orders').doc(order.tuanOrderId).update({
          data: { status: 'cancelled', updatedAt: db.serverDate() },
        })
      } catch (e) {
        logger.warn('cancelTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: (e as Error).message })
      }
    }
  }

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
