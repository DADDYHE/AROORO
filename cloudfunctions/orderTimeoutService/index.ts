/**
 * orderTimeoutService/index.ts - 订单超时自动取消服务（TypeScript 源文件 - Sprint 45 迁移）
 *
 * 业务功能：
 *   - 定时器触发：每 30 分钟一次（cron 7 段表达式，每段含义：秒 分 时 日 月 星期 年）
 *   - 扫描各业务线的过期未支付订单，自动取消
 *   - 释放优惠券锁定 / 商城库存 / 团名额 / 活动名额
 *   - 关闭微信支付未支付订单
 *
 * 覆盖 5 类订单：
 *   1. 寄养订单（orders collection，type=hosting 或无 type）
 *   2. 喂养订单（feedingOrders collection）
 *   3. 商城订单（orders collection，type=mall）
 *   4. 团购订单（orders collection，type=group_buy）
 *   5. 活动报名（activity_registrations collection）
 *
 * 共 7 个内部函数：
 *   1. main - 入口（cron 触发）
 *   2. fetchAllExpired - 分批拉取过期订单
 *   3. closeWechatOrder - 关闭微信支付订单
 *   4. restoreProductStock - 恢复商品库存
 *   5. unlockOrderCoupons - 解锁订单相关优惠券
 *   6. restoreTuanDealStock - 恢复团购名额
 *   7. restoreActivityQuota - 恢复活动名额
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 5 类订单 / 6 个辅助函数 / 7 个超时时长常量全部强类型化
 *   - 与已迁移的 11 个服务保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderTimeoutService.json
 */

// =====================================================================
// 公共类型（与已迁移的 11 个服务保持一致）
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
  /** cron 触发时携带的时间戳 */
  Time?: string
  /** cron 触发时携带的时间戳（毫秒） */
  Timestamp?: number
  /** cron 触发时携带的触发器名称 */
  TriggerName?: string
  /** cron 触发时携带的消息 */
  Message?: string
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

// =====================================================================
// 业务类型定义
// =====================================================================

/** 5 类订单业务线 */
export type OrderBusinessLine =
  | 'boarding'      // 寄养订单
  | 'feeding'       // 喂养订单
  | 'mall'          // 商城订单
  | 'group_buy'     // 团购订单
  | 'activity'      // 活动报名

/** 订单状态 */
export type OrderStatus =
  | 'pending'
  | 'pending_payment'
  | 'paid'
  | 'cancelled'

/** 支付状态 */
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'

/** 订单类型（业务类型） */
export type OrderType = 'hosting' | 'feeding' | 'activity' | 'group_buy' | 'mall'

/** 通用订单文档基类（按业务投影字段） */
export interface OrderDoc {
  _id: string
  outTradeNo?: string
  productId?: string
  skuId?: string
  quantity?: number
  dealId?: string
  activityId?: string
  participantCount?: number
  /** 关联的团订单 ID（type=group_buy 时由 tuanService.createTuanOrder 写入） */
  tuanOrderId?: string
  type?: OrderType
  status?: OrderStatus
  paymentStatus?: PaymentStatus
  [k: string]: unknown
}

/** 喂养订单文档 */
export interface FeedingOrderDoc {
  _id: string
  outTradeNo?: string
  status?: OrderStatus
  [k: string]: unknown
}

/** 活动报名文档 */
export interface ActivityRegistrationDoc {
  _id: string
  outTradeNo?: string
  activityId?: string
  participantCount?: number
  status?: OrderStatus
  [k: string]: unknown
}

/** 商品 SKU 字段（投影用） */
export interface ProductSku {
  skuId?: string
  stock?: number
  soldCount?: number
  [k: string]: unknown
}

/** 商品文档 */
export interface ProductDoc {
  _id: string
  stock?: number
  totalStock?: number
  soldCount?: number
  skus?: ProductSku[]
  [k: string]: unknown
}

/** 用户优惠券（解锁用投影） */
export interface UserCouponUnlock {
  _id: string
  endTime?: string | Date
  status?: 'locked' | 'unused' | 'used' | 'expired'
  [k: string]: unknown
}

/** 团购团单 */
export interface TuanDealDoc {
  _id: string
  totalStock?: number
  soldCount?: number
  [k: string]: unknown
}

/** 活动 */
export interface ActivityDoc {
  _id: string
  currentParticipants?: number
  [k: string]: unknown
}

/** 微信支付 v3 配置 */
export interface WechatPayConfig {
  appId: string
  mchId: string
  serialNo: string
  privateKey: string
  apiV3Key: string
}

/** 关闭微信订单的 HTTP 响应 */
export interface WechatCloseResponse {
  statusCode: number
  data: string
}

/** 超时处理结果 */
export interface TimeoutResult {
  cancelledBoardingOrders: number
  cancelledFeedingOrders: number
  cancelledMallOrders: number
  cancelledGroupBuyOrders: number
  cancelledActivityOrders: number
  closedWechatOrders: number
  errors: Array<{
    type?: string
    orderId?: string
    error?: string
    stockRestoreError?: string
  }>
}

/** HTTPS 请求选项（关闭微信订单） */
export interface HttpsRequestOptions {
  hostname: string
  port: number
  path: string
  method: 'POST'
  headers: Record<string, string | number>
}

/** https.IncomingMessage 简化类型 */
export interface IncomingMessageLite {
  statusCode?: number
  on: (event: 'data' | 'end', listener: (chunk?: string | Buffer) => void) => void
}

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ENDPOINTS } = require('./common/config')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError, ERROR_CODES } = require('./common/utils')

// 动态 require wx-server-sdk（cron 触发时使用 DYNAMIC_CURRENT_ENV）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloud = require('wx-server-sdk') as {
  init: (opts: { env: string }) => void
  DYNAMIC_CURRENT_ENV: string
  database: () => {
    collection: (name: string) => CloudCollection
    command: CloudCommand
    serverDate: (opts?: { offset?: number }) => Date
  }
}

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const logger = createLogger('orderTimeoutService')

// =====================================================================
// CloudBase 数据库操作类型（精确类型）
// =====================================================================

interface UpdateOp {
  _op: 'inc' | 'push' | 'set'
  v: unknown
}

interface CloudCommand {
  inc: (n: number) => UpdateOp
  lte: (d: Date) => unknown
  in: (arr: unknown[]) => unknown
}

interface UpdateResult {
  updated?: number
  stats?: { updated?: number; created?: number; read?: number }
}

interface QueryResult<T> {
  data: T[]
}

interface CloudQuery<T> {
  where: (q: Record<string, unknown>) => CloudQuery<T>
  field: (f: Record<string, boolean>) => CloudQuery<T>
  skip: (n: number) => CloudQuery<T>
  limit: (n: number) => CloudQuery<T>
  get: () => Promise<QueryResult<T>>
}

interface CloudDoc<T> {
  get: () => Promise<{ data: T | null }>
  update: (params: { data: Record<string, unknown> }) => Promise<UpdateResult>
}

interface CloudCollection {
  where: (q: Record<string, unknown>) => CloudQuery<unknown>
  doc: (id: string) => CloudDoc<unknown>
}

// =====================================================================
// 超时常量（7 个，全部 30 分钟）
// =====================================================================

/** 寄养订单超时（分钟） */
export const ORDER_TIMEOUT_MINUTES = 30
/** 喂养订单超时（分钟） */
export const FEEDING_ORDER_TIMEOUT_MINUTES = 30
/** 商城订单超时（分钟） */
export const MALL_ORDER_TIMEOUT_MINUTES = 30
/** 团购订单超时（分钟） */
export const GROUP_BUY_TIMEOUT_MINUTES = 30
/** 活动报名超时（分钟） */
export const ACTIVITY_ORDER_TIMEOUT_MINUTES = 30
/** 批量处理：每批拉取数量 */
export const BATCH_SIZE = 100
/** 批量处理：最大批次数（10 批 × 100 = 1000 单） */
export const MAX_BATCHES = 10

// =====================================================================
// 微信支付 v3 配置
// =====================================================================

const WECHAT_PAY_CONFIG: WechatPayConfig = {
  appId: process.env.WECHAT_APPID || '',
  mchId: process.env.WECHAT_MCHID || '',
  serialNo: process.env.WECHAT_SERIAL_NO || '',
  privateKey: process.env.WECHAT_PRIVATE_KEY || '',
  apiV3Key: process.env.WECHAT_API_V3_KEY || '',
}

// =====================================================================
// 辅助函数 1：归一化微信支付私钥
// =====================================================================

/**
 * 归一化微信支付私钥。
 * 支持原始 PEM 或 base64 编码 PEM（自动 decode）。
 */
export function normalizePrivateKey(key: string | undefined | null): string {
  if (!key) { return '' }
  const trimmed = String(key).trim()
  if (trimmed.includes('-----BEGIN')) { return trimmed }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
    if (decoded.includes('-----BEGIN')) { return decoded }
  } catch (e) {
    // ignore decode failure
  }
  return trimmed
}

// =====================================================================
// 辅助函数 2：生成微信支付 v3 Authorization
// =====================================================================

/**
 * 生成微信支付 v3 API 的 Authorization header。
 * 遵循 WECHATPAY2-SHA256-RSA2048 签名规范。
 */
export function generateAuthorization(
  method: 'POST' | 'GET',
  path: string,
  body: string,
  mchId: string,
  serialNo: string,
  privateKey: string
): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto')

  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = Math.random().toString(36).substring(2, 34)
  const message = `${[method, path, timestamp, nonceStr, body].join('\n')}\n`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  sign.end()
  const signature = sign.sign(privateKey, 'base64')
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`
}

// =====================================================================
// 辅助函数 3：关闭微信支付订单
// =====================================================================

/**
 * 调用微信支付 v3 关闭订单接口。
 *
 * - POST /v3/pay/transactions/out-trade-no/{outTradeNo}/close
 * - 缺配置时跳过并返回 false
 * - 网络异常 / 非 2xx 响应也返回 false（不抛错，让外层继续处理其他订单）
 */
export function closeWechatOrder(outTradeNo: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const https = require('https') as typeof import('https')

  return new Promise((resolve) => {
    const privateKey = normalizePrivateKey(WECHAT_PAY_CONFIG.privateKey)
    if (!privateKey || !WECHAT_PAY_CONFIG.mchId || !WECHAT_PAY_CONFIG.serialNo) {
      logger.warn('closeWechatOrder', { msg: '缺少微信支付配置，跳过关单' })
      return resolve(false)
    }

    const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`
    const body = JSON.stringify({ mchid: WECHAT_PAY_CONFIG.mchId })
    const authorization = generateAuthorization(
      'POST', path, body,
      WECHAT_PAY_CONFIG.mchId, WECHAT_PAY_CONFIG.serialNo, privateKey
    )

    const urlObj = new URL(`${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`)
    const options: HttpsRequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, (res: IncomingMessageLite) => {
      let data = ''
      res.on('data', (chunk) => { data += String(chunk) })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          logger.info('closeWechatOrder.success', { outTradeNo })
          resolve(true)
        } else {
          logger.warn('closeWechatOrder.fail', { outTradeNo, statusCode: res.statusCode, data })
          resolve(false)
        }
      })
    })
    req.on('error', (e: Error) => {
      logger.warn('closeWechatOrder.exception', { outTradeNo, msg: e.message })
      resolve(false)
    })
    req.write(body)
    req.end()
  })
}

// =====================================================================
// 辅助函数 4：恢复商品库存
// =====================================================================

/**
 * 取消订单时恢复商品库存：
 *   - totalStock / soldCount
 *   - stock 兜底
 *   - SKU 维度：skus[index].stock / soldCount
 */
export async function restoreProductStock(
  productId: string | undefined,
  skuId: string | null | undefined,
  quantity: number | undefined
): Promise<void> {
  if (!productId) { return }
  try {
    const productRes = await db.collection('products').doc(productId).get() as { data: ProductDoc | null }
    if (!productRes.data) { return }

    const qty = quantity || 1
    const updateData: Record<string, unknown> = {
      totalStock: _.inc(qty),
      soldCount: _.inc(-qty),
      updatedAt: db.serverDate(),
    }

    if (skuId && productRes.data.skus) {
      const skuIndex = productRes.data.skus.findIndex((s: ProductSku) => s.skuId === skuId)
      if (skuIndex >= 0) {
        updateData[`skus.${skuIndex}.stock`] = _.inc(qty)
        updateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty)
      }
      updateData.stock = _.inc(qty)
    } else {
      updateData.stock = _.inc(qty)
    }

    await db.collection('products').doc(productId).update({ data: updateData })
  } catch (stockErr) {
    logger.error('restoreProductStock', stockErr)
    throw stockErr
  }
}

// =====================================================================
// 辅助函数 5：解锁订单相关优惠券
// =====================================================================

/**
 * 取消订单时解锁 user_coupons 集合中 status='locked' 且 lockedOrderId=orderId 的记录：
 *   - 已过期 → status='expired'
 *   - 未过期 → status='unused'
 */
export async function unlockOrderCoupons(orderId: string): Promise<void> {
  if (!orderId) { return }
  try {
    const lockedCoupons = await db.collection('user_coupons')
      .where({ lockedOrderId: orderId, status: 'locked' })
      .field({ _id: true, endTime: true })
      .limit(20)
      .get() as QueryResult<UserCouponUnlock>
    const now = new Date()
    for (const coupon of (lockedCoupons.data || [])) {
      const isExpired = coupon.endTime ? new Date(coupon.endTime as string) < now : false
      await db.collection('user_coupons').doc(coupon._id).update({
        data: { status: isExpired ? 'expired' : 'unused', updatedAt: db.serverDate() },
      })
    }
  } catch (e) {
    logger.error('unlockOrderCoupons', e)
  }
}

// =====================================================================
// 辅助函数 6：恢复团购名额
// =====================================================================

/**
 * 取消团购订单时恢复 tuan_deals 集合的 totalStock / soldCount。
 */
export async function restoreTuanDealStock(
  dealId: string | undefined,
  quantity: number | undefined
): Promise<void> {
  if (!dealId) { return }
  try {
    const qty = quantity || 1
    await db.collection('tuan_deals').doc(dealId).update({
      data: {
        totalStock: _.inc(qty),
        soldCount: _.inc(-qty),
        updatedAt: db.serverDate(),
      },
    })
  } catch (e) {
    logger.error('restoreTuanDealStock', e)
  }
}

// =====================================================================
// 辅助函数 6.5：取消团订单（同步 tuan_orders 状态）
// =====================================================================

/**
 * 取消 orders 中 type=group_buy 记录时，同步把 tuan_orders 表对应记录也置为 cancelled。
 *
 * 背景：
 *   paymentService 在支付回调中会把 tuan_orders 状态从 pending → paid，
 *   但 orderTimeoutService 取消时只更新 orders，没联动 tuan_orders，
 *   导致管理后台 / 团长视图看到 "待确认" 的幽灵订单。
 */
export async function cancelTuanOrder(
  tuanOrderId: string | undefined,
  outTradeNo: string | undefined
): Promise<void> {
  if (!tuanOrderId && !outTradeNo) { return }
  try {
    const query: Record<string, unknown> = {}
    if (tuanOrderId) { query._id = tuanOrderId }
    else if (outTradeNo) { query.outTradeNo = outTradeNo }
    // 先查 ID（避开 db.collection().where().update() 的 TS 类型问题）
    const lookup = await db.collection('tuan_orders').where(query).limit(1).field({ _id: true }).get()
    const target = (lookup.data && lookup.data[0]) as { _id?: string } | undefined
    if (!target || !target._id) { return }
    await db.collection('tuan_orders').doc(target._id).update({
      data: {
        status: 'cancelled',
        paymentStatus: 'cancelled',
        cancelReason: '超时未支付，系统自动取消',
        cancelledAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
  } catch (e) {
    logger.error('cancelTuanOrder', e)
  }
}

// =====================================================================
// 辅助函数 7：恢复活动名额
// =====================================================================

/**
 * 取消活动报名时回退 activities 集合的 currentParticipants。
 */
export async function restoreActivityQuota(
  activityId: string | undefined,
  participantCount: number | undefined
): Promise<void> {
  if (!activityId) { return }
  try {
    const count = participantCount || 1
    await db.collection('activities').doc(activityId).update({
      data: {
        currentParticipants: _.inc(-count),
        updatedAt: db.serverDate(),
      },
    })
  } catch (e) {
    logger.error('restoreActivityQuota', e)
  }
}

// =====================================================================
// 辅助函数 8：分批拉取过期订单
// =====================================================================

/**
 * 通用分批拉取接口（最大 MAX_BATCHES * BATCH_SIZE = 1000 条）。
 */
export async function fetchAllExpired<T = OrderDoc>(
  collection: string,
  where: Record<string, unknown>,
  fields: Record<string, boolean>
): Promise<T[]> {
  const allOrders: T[] = []
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const res = await db.collection(collection)
      .where(where)
      .field(fields)
      .skip(batch * BATCH_SIZE)
      .limit(BATCH_SIZE)
      .get() as QueryResult<T>
    const data = res.data || []
    allOrders.push(...data)
    if (data.length < BATCH_SIZE) { break }
  }
  return allOrders
}

// =====================================================================
// 业务函数 1：取消寄养订单
// =====================================================================

async function cancelBoardingOrders(result: TimeoutResult, boardingTimeout: Date): Promise<void> {
  try {
    const expiredBoardingOrders = await fetchAllExpired<OrderDoc>('orders', {
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      createdAt: _.lte(boardingTimeout),
    }, { _id: true, outTradeNo: true })

    for (const order of expiredBoardingOrders) {
      try {
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })
        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) { result.closedWechatOrders++ }
        }
        await unlockOrderCoupons(order._id)
        result.cancelledBoardingOrders++
      } catch (error) {
        result.errors.push({ orderId: order._id, error: (error as Error).message })
      }
    }
  } catch (error) {
    result.errors.push({ type: 'boarding', error: (error as Error).message })
  }
}

// =====================================================================
// 业务函数 2：取消喂养订单
// =====================================================================

async function cancelFeedingOrders(result: TimeoutResult, feedingTimeout: Date): Promise<void> {
  try {
    const expiredFeedingOrders = await fetchAllExpired<FeedingOrderDoc>('feedingOrders', {
      status: 'pending_payment',
      createdAt: _.lte(feedingTimeout),
    }, { _id: true, outTradeNo: true })

    for (const order of expiredFeedingOrders) {
      try {
        await db.collection('feedingOrders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })
        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) { result.closedWechatOrders++ }
        }
        await unlockOrderCoupons(order._id)
        result.cancelledFeedingOrders++
      } catch (error) {
        result.errors.push({ orderId: order._id, error: (error as Error).message })
      }
    }
  } catch (error) {
    result.errors.push({ type: 'feeding', error: (error as Error).message })
  }
}

// =====================================================================
// 业务函数 3：取消商城订单（含库存回退）
// =====================================================================

async function cancelMallOrders(result: TimeoutResult, mallTimeout: Date): Promise<void> {
  try {
    const expiredMallOrders = await fetchAllExpired<OrderDoc>('orders', {
      type: 'mall',
      status: 'pending_payment',
      createdAt: _.lte(mallTimeout),
    }, { _id: true, productId: true, skuId: true, quantity: true, outTradeNo: true })

    for (const order of expiredMallOrders) {
      try {
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })

        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) { result.closedWechatOrders++ }
        }

        try {
          await restoreProductStock(order.productId, order.skuId, order.quantity)
        } catch (stockErr) {
          result.errors.push({ orderId: order._id, stockRestoreError: (stockErr as Error).message })
        }

        await unlockOrderCoupons(order._id)
        result.cancelledMallOrders++
      } catch (error) {
        result.errors.push({ orderId: order._id, error: (error as Error).message })
      }
    }
  } catch (error) {
    result.errors.push({ type: 'mall', error: (error as Error).message })
  }
}

// =====================================================================
// 业务函数 4：取消团购订单（含库存 + 团名额回退）
// =====================================================================

async function cancelGroupBuyOrders(result: TimeoutResult, groupBuyTimeout: Date): Promise<void> {
  try {
    const expiredGroupBuyOrders = await fetchAllExpired<OrderDoc>('orders', {
      type: 'group_buy',
      status: 'pending_payment',
      createdAt: _.lte(groupBuyTimeout),
    }, { _id: true, productId: true, quantity: true, dealId: true, outTradeNo: true, tuanOrderId: true })

    for (const order of expiredGroupBuyOrders) {
      try {
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })

        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) { result.closedWechatOrders++ }
        }

        try {
          await restoreProductStock(order.productId, null, order.quantity)
        } catch (stockErr) {
          result.errors.push({ orderId: order._id, stockRestoreError: (stockErr as Error).message })
        }

        await restoreTuanDealStock(order.dealId, order.quantity)
        // ★ 同步取消 tuan_orders 集合（避免管理后台显示"待确认"幽灵订单）
        await cancelTuanOrder(order.tuanOrderId, order.outTradeNo)
        await unlockOrderCoupons(order._id)
        result.cancelledGroupBuyOrders++
      } catch (error) {
        result.errors.push({ orderId: order._id, error: (error as Error).message })
      }
    }
  } catch (error) {
    result.errors.push({ type: 'group_buy', error: (error as Error).message })
  }
}

// =====================================================================
// 业务函数 5：取消活动报名（含名额回退）
// =====================================================================

async function cancelActivityOrders(result: TimeoutResult, activityTimeout: Date): Promise<void> {
  try {
    const expiredActivityOrders = await fetchAllExpired<ActivityRegistrationDoc>('activity_registrations', {
      status: 'pending_payment',
      createdAt: _.lte(activityTimeout),
    }, { _id: true, activityId: true, participantCount: true, outTradeNo: true })

    for (const order of expiredActivityOrders) {
      try {
        await db.collection('activity_registrations').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })

        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) { result.closedWechatOrders++ }
        }

        await restoreActivityQuota(order.activityId, order.participantCount)
        await unlockOrderCoupons(order._id)
        result.cancelledActivityOrders++
      } catch (error) {
        result.errors.push({ orderId: order._id, error: (error as Error).message })
      }
    }
  } catch (error) {
    result.errors.push({ type: 'activity', error: (error as Error).message })
  }
}

// =====================================================================
// Main 入口（cron 触发：每 30 分钟一次）
// =====================================================================

/**
 * 订单超时自动取消主入口。
 *
 * cron 表达式：7 段（秒 分 时 日 月 星期 年），每 30 分钟触发一次
 * 入口签名遵循 CloudBase 云函数约定（event, context）
 *
 * 流程：
 *   1. 计算 5 类订单各自的超时截止时间（now - 30min）
 *   2. 依次扫描 5 类订单集合的过期未支付记录
 *   3. 标记 status='cancelled' + 记录 cancelReason
 *   4. 关闭对应的微信支付订单
 *   5. 恢复相关资源（库存 / 团名额 / 活动名额 / 优惠券锁定）
 *   6. 汇总结果（各类取消数 + 微信关单数 + 错误列表）
 */
export async function main(
  event: CloudEvent,
  _context: CloudContext
): Promise<unknown> {
  logger.info('orderTimeoutService.start', {
    trigger: event.TriggerName || 'manual',
    message: event.Message,
  })

  const results: TimeoutResult = {
    cancelledBoardingOrders: 0,
    cancelledFeedingOrders: 0,
    cancelledMallOrders: 0,
    cancelledGroupBuyOrders: 0,
    cancelledActivityOrders: 0,
    closedWechatOrders: 0,
    errors: [],
  }

  const now = new Date()
  const boardingTimeout = new Date(now.getTime() - ORDER_TIMEOUT_MINUTES * 60 * 1000)
  const feedingTimeout = new Date(now.getTime() - FEEDING_ORDER_TIMEOUT_MINUTES * 60 * 1000)
  const mallTimeout = new Date(now.getTime() - MALL_ORDER_TIMEOUT_MINUTES * 60 * 1000)
  const groupBuyTimeout = new Date(now.getTime() - GROUP_BUY_TIMEOUT_MINUTES * 60 * 1000)
  const activityTimeout = new Date(now.getTime() - ACTIVITY_ORDER_TIMEOUT_MINUTES * 60 * 1000)

  try {
    await cancelBoardingOrders(results, boardingTimeout)
    await cancelFeedingOrders(results, feedingTimeout)
    await cancelMallOrders(results, mallTimeout)
    await cancelGroupBuyOrders(results, groupBuyTimeout)
    await cancelActivityOrders(results, activityTimeout)

    logger.info('orderTimeoutService.success', {
      ...results,
      errorsCount: results.errors.length,
    })
  } catch (error) {
    logger.error('orderTimeoutService.fatal', error)
    return handleError(error, '订单超时处理异常', ERROR_CODES.SERVER)
  }

  return handleSuccess(
    results,
    `处理完成：取消寄养${results.cancelledBoardingOrders}笔，喂养${results.cancelledFeedingOrders}笔，商城${results.cancelledMallOrders}笔，团购${results.cancelledGroupBuyOrders}笔，活动${results.cancelledActivityOrders}笔，微信关单${results.closedWechatOrders}笔`
  )
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  // 超时常量
  ORDER_TIMEOUT_MINUTES,
  FEEDING_ORDER_TIMEOUT_MINUTES,
  MALL_ORDER_TIMEOUT_MINUTES,
  GROUP_BUY_TIMEOUT_MINUTES,
  ACTIVITY_ORDER_TIMEOUT_MINUTES,
  BATCH_SIZE,
  MAX_BATCHES,
  // 辅助函数（测试用）
  normalizePrivateKey,
  generateAuthorization,
  closeWechatOrder,
  restoreProductStock,
  unlockOrderCoupons,
  restoreTuanDealStock,
    cancelTuanOrder,
    restoreActivityQuota,
  fetchAllExpired,
}
_mod.exports.default = _mod.exports

export default {
  main,
  ORDER_TIMEOUT_MINUTES,
  FEEDING_ORDER_TIMEOUT_MINUTES,
  MALL_ORDER_TIMEOUT_MINUTES,
  GROUP_BUY_TIMEOUT_MINUTES,
  ACTIVITY_ORDER_TIMEOUT_MINUTES,
  BATCH_SIZE,
  MAX_BATCHES,
  normalizePrivateKey,
  generateAuthorization,
  closeWechatOrder,
  restoreProductStock,
  unlockOrderCoupons,
  restoreTuanDealStock,
    cancelTuanOrder,
    restoreActivityQuota,
  fetchAllExpired,
}
