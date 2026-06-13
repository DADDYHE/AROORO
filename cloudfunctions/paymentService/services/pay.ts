/**
 * paymentService/pay.ts - 支付服务（TypeScript 源文件 - Sprint 25 迁移）
 *
 * 业务功能：
 *   - createPayment：发起微信支付预付单（含限流 + 订单状态校验 + 金额校验）
 *   - queryPayment：查询微信支付单状态
 *   - closePayment：主动关闭未支付预付单
 *   - confirmPayment：确认支付（从微信拉起，验证 trade_state 后落库 + 状态机）
 *
 * 迁移目标：
 *   - 强类型化 event / auth / 返回值
 *   - 与 common/* 共享类型（CloudBaseDB）
 *   - 编译产物（pay.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */

// Sprint 25 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/paymentService/services/pay.js）
//   - 对 .js 文件（wechatPayUtils / config / payment-state-machine）使用 require() 而非 import
//   - 强类型仅作用于 common/*（已有 .d.ts 产物）
//   - 业务错误码使用 err(...) 工厂，与 risk-rate-limit 共用同一个 BusinessError 类

import { err, isBusinessError, withErrorHandling, type WrappedHandler } from '../../common/errors'
import { initCloud } from '../../common/utils'
import { createLogger } from '../../common/logger'
import { withRateLimit } from '../../common/risk-rate-limit'
import type { CloudBaseDB } from '../../common/types'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WECHAT_PAY, ENDPOINTS } = require('../common/config')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { randomString, rsaSign, httpsRequest, generateAuthorization } = require('./wechatPayUtils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { paymentStateMachine, resolveOrderStatus, isKnownOrderType } = require('../common/payment-state-machine')

// =====================================================================
// 类型定义
// =====================================================================

type OrderType = 'order' | 'mall' | 'tuan' | 'activity' | 'feeding'

interface CreatePaymentEvent {
  type?: string
  orderId?: string
  amount?: number
  description?: string
}

interface CreatePaymentResult {
  orderId: string
  outTradeNo: string
  paymentParams: {
    timeStamp: string
    nonceStr: string
    package: string
    signType: string
    paySign: string
  }
}

interface QueryPaymentEvent {
  outTradeNo?: string
  transactionId?: string
}

interface ClosePaymentEvent {
  outTradeNo?: string
}

interface ConfirmPaymentEvent {
  outTradeNo?: string
}

interface ConfirmPaymentPaidResult {
  paid: true
  alreadyConfirmed?: boolean
}

interface ConfirmPaymentUnpaidResult {
  paid: false
  tradeState: string
}

type ConfirmPaymentResult = ConfirmPaymentPaidResult | ConfirmPaymentUnpaidResult

interface OrderDoc {
  _id: string
  outTradeNo?: string
  ownerId?: string
  openid?: string
  activityId?: string
  totalPrice?: number
  totalAmount?: number
  amount?: number
  paidAmount?: number
  paymentStatus?: string
  status?: string
  orderType?: string
  [k: string]: unknown
}

interface WechatPayJsapiResult {
  prepay_id?: string
  errcode?: string | number
  errmsg?: string
  [k: string]: unknown
}

interface WechatPayQueryResult {
  trade_state?: string
  transaction_id?: string
  [k: string]: unknown
}

// =====================================================================
// 模块初始化
// =====================================================================

const { db } = initCloud()
const logger = createLogger('paymentService:pay')

// =====================================================================
// 订单类型元数据
// =====================================================================

const ORDER_TYPE_PREFIX: Record<OrderType, string> = {
  order: 'ORDER_',
  mall: 'MALL_',
  tuan: 'TUAN_',
  activity: 'ACT_',
  feeding: 'FD_',
}

const ORDER_TYPE_COLLECTION: Record<OrderType, string> = {
  order: 'orders',
  mall: 'orders',
  tuan: 'orders',
  activity: 'activity_registrations',
  feeding: 'feedingOrders',
}

const ORDER_TYPE_DESC: Record<OrderType, string> = {
  order: '寄养订单',
  mall: '商城订单',
  tuan: '团购订单',
  activity: '活动报名',
  feeding: '上门喂养服务',
}

const ORDER_TYPE_AMOUNT_FIELD: Record<OrderType, string> = {
  order: 'totalPrice',
  mall: 'totalPrice',
  tuan: 'totalPrice',
  activity: 'finalAmount',
  feeding: 'totalPrice',
}

const ORDER_TYPE_PREFIX_MAP: Record<string, OrderType> = {
  ORDER_: 'order',
  MALL_: 'mall',
  TUAN_: 'tuan',
  ACT_: 'activity',
  FD_: 'feeding',
}

function getOrderType(outTradeNo: string): OrderType | null {
  for (const [prefix, type] of Object.entries(ORDER_TYPE_PREFIX_MAP)) {
    if (outTradeNo.startsWith(prefix)) {return type as OrderType}
  }
  return null
}

// =====================================================================
// createPayment：发起微信支付预付单
// =====================================================================

/**
 * 发起微信支付预付单
 *
 * 流程：
 *   1. 业务参数校验（type / orderId / amount）
 *   2. 微信支付配置校验
 *   3. 订单存在性 + 支付状态校验
 *   4. 金额一致性校验（客户端入参 vs DB 订单金额）
 *   5. 旧预付单回收（如果存在 paying 状态）
 *   6. 调微信支付 API 发起预付单（受限流保护）
 *   7. 更新订单 paymentStatus = paying
 *   8. 返回小程序支付签名
 *
 * @throws BusinessError AUTH_REQUIRED / INVALID_PARAMS / WECHAT_API_ERROR / ORDER_NOT_FOUND
 *         ORDER_ALREADY_PAID / PAYMENT_AMOUNT_MISMATCH / PAYMENT_CREATE_FAILED / RATE_LIMITED
 */
export const createPayment: WrappedHandler<CreatePaymentResult> = withErrorHandling<CreatePaymentResult>(async (
  event: Record<string, unknown>,
  context: Record<string, unknown>,
  auth: { openid?: string; [k: string]: unknown }
) => {
  const openid = auth.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { type, orderId, amount, description } = event as CreatePaymentEvent
  if (!type || !orderId || !amount || amount <= 0) {
    throw err('INVALID_PARAMS', '参数不完整')
  }
  if (!ORDER_TYPE_PREFIX[type as OrderType]) {
    throw err('INVALID_PARAMS', '不支持的订单类型')
  }

  const orderType = type as OrderType
  const config = WECHAT_PAY
  if (!config.mchId || !config.privateKey) {
    logger.error('createPayment: 微信支付未配置', { mchId: Boolean(config.mchId), privateKey: Boolean(config.privateKey) })
    throw err('WECHAT_API_ERROR', '微信支付未配置')
  }

  const collection = ORDER_TYPE_COLLECTION[orderType]
  const orderRes = await db.collection(collection).doc(orderId).get()
  if (!orderRes.data) {
    throw err('ORDER_NOT_FOUND', '订单不存在', { orderId })
  }
  const orderData = orderRes.data as OrderDoc

  if (orderData.paymentStatus === 'paid') {
    throw err('ORDER_ALREADY_PAID', '订单已支付', { orderId })
  }

  if (amount && orderData.totalPrice && Math.round(amount) !== Math.round(orderData.totalPrice * 100)) {
    throw err('PAYMENT_AMOUNT_MISMATCH', '支付金额与订单金额不一致')
  }

  // Sprint 25: 旧预付单回收（如果订单有 outTradeNo 且 paymentStatus=paying，先关掉）
  if (orderData.outTradeNo && orderData.paymentStatus === 'paying') {
    try {
      await closePaymentInternal({ outTradeNo: orderData.outTradeNo }, context, auth, config)
      logger.info('createPayment: 关闭旧支付单', { outTradeNo: orderData.outTradeNo })
    } catch (closeErr) {
      logger.warn('createPayment: 关闭旧支付单失败', { msg: (closeErr as Error)?.message })
    }
  }

  let actualAmount = 0
  try {
    const amountField = ORDER_TYPE_AMOUNT_FIELD[orderType] || 'totalPrice'
    actualAmount = Number(orderData[amountField] || orderData.totalPrice || orderData.totalAmount || orderData.amount || 0)
  } catch (e) {
    logger.warn('createPayment: 解析订单金额失败', { msg: (e as Error)?.message })
  }
  if (actualAmount > 0 && Math.round(amount) !== Math.round(actualAmount * 100)) {
    logger.error('createPayment: 金额不符', {
      clientAmount: amount, dbAmount: actualAmount, dbAmountCents: Math.round(actualAmount * 100), type, orderId,
    })
    throw err('PAYMENT_AMOUNT_MISMATCH', '支付金额异常', { clientAmount: amount, dbAmount: actualAmount })
  }

  const prefix = ORDER_TYPE_PREFIX[orderType]
  const outTradeNo = `${prefix}${Date.now()}_${randomString(6).toUpperCase()}`
  const desc = description || ORDER_TYPE_DESC[orderType] || '订单支付'

  const expireTime = new Date(Date.now() + 30 * 60 * 1000)
  const timeExpire = expireTime.toISOString().replace(/\.\d{3}Z$/, '+08:00')

  const requestBody = {
    appid: config.appId,
    mchid: config.mchId,
    description: desc,
    out_trade_no: outTradeNo,
    time_expire: timeExpire,
    notify_url: config.notifyUrl,
    attach: JSON.stringify({ type, orderId }),
    amount: { total: Math.round(amount), currency: 'CNY' },
    payer: { openid },
  }

  logger.info('createPayment: 请求微信支付', { outTradeNo, amount: Math.round(amount), orderId, type })

  const bodyStr = JSON.stringify(requestBody)
  const authorization = generateAuthorization(
    'POST', '/v3/pay/transactions/jsapi',
    bodyStr, config.mchId, config.serialNo, config.privateKey
  )

  // Sprint 18: 接入风控限流（防恶意调起支付 / 刷预付单）
  //   - 全局：每用户每分钟最多 N 次创建支付
  //   - 目标级：每用户对同一 orderId 每分钟最多 M 次
  let payResult: WechatPayJsapiResult
  try {
    payResult = (await withRateLimit(
      { userId: openid, type: 'payment', targetId: orderId as string },
      () => httpsRequest(
        `${ENDPOINTS.WECHAT_PAY_API_BASE}${ENDPOINTS.WECHAT_PAY_JSAPI}`,
        requestBody, authorization
      )
    )) as WechatPayJsapiResult
  } catch (e) {
    // Sprint 18: RATE_LIMITED 必须透传（限流是保护性拦截）
    if (isBusinessError(e) && e.code === 'RATE_LIMITED') {
      logger.warn('createPayment.rate_limited', { orderId, userId: openid, msg: e.message })
    }
    throw e
  }

  if (!payResult.prepay_id) {
    logger.error('createPayment: 未获取到prepay_id', { payResult })
    if (payResult.errcode) {
      throw err('PAYMENT_CREATE_FAILED', `微信支付下单失败：${payResult.errmsg || payResult.errcode}`)
    }
    throw err('WECHAT_API_ERROR', '获取支付参数失败')
  }

  const orderCollection = ORDER_TYPE_COLLECTION[orderType]
  await db.collection(orderCollection).doc(orderId as string).update({
    data: { outTradeNo, paymentStatus: 'paying', updatedAt: db.serverDate() },
  })

  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = randomString(32)
  const packageStr = `prepay_id=${payResult.prepay_id}`
  const payMessage = `${[config.appId, timeStamp, nonceStr, packageStr].join('\n')}\n`
  const paySign = rsaSign(config.privateKey, payMessage)

  return {
    orderId: orderId as string,
    outTradeNo,
    paymentParams: { timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign },
  }
})

// =====================================================================
// queryPayment：查询微信支付单状态
// =====================================================================

/**
 * 查询微信支付单
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR
 */
export const queryPayment: WrappedHandler<WechatPayQueryResult> = withErrorHandling<WechatPayQueryResult>(async (
  event: Record<string, unknown>,
  _context: Record<string, unknown>,
  _auth: { openid?: string; [k: string]: unknown }
) => {
  const { outTradeNo, transactionId } = event as QueryPaymentEvent

  if (!outTradeNo && !transactionId) {
    throw err('INVALID_PARAMS', '缺少订单号')
  }

  const config = WECHAT_PAY
  if (!config.mchId || !config.privateKey) {
    throw err('BUSINESS_ERROR', '微信支付未配置')
  }

  let path: string
  if (transactionId) {
    path = `/v3/pay/transactions/id/${transactionId}?mchid=${config.mchId}`
  } else {
    path = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${config.mchId}`
  }

  const authorization = generateAuthorization(
    'GET', path, '', config.mchId, config.serialNo, config.privateKey
  )

  const result = (await httpsRequest(
    `${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`,
    null, authorization, 'GET'
  )) as WechatPayQueryResult

  return result
})

// =====================================================================
// closePayment：主动关闭预付单
// =====================================================================

/**
 * 主动关闭未支付预付单
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR
 */
export const closePayment: WrappedHandler<null> = withErrorHandling<null>(async (
  event: Record<string, unknown>,
  _context: Record<string, unknown>,
  _auth: { openid?: string; [k: string]: unknown }
) => {
  const { outTradeNo } = event as ClosePaymentEvent
  if (!outTradeNo) {
    throw err('INVALID_PARAMS', '缺少订单号')
  }

  const config = WECHAT_PAY
  if (!config.mchId || !config.privateKey) {
    throw err('BUSINESS_ERROR', '微信支付未配置')
  }

  await closePaymentInternal({ outTradeNo }, _context, _auth, config)
  return null
})

/**
 * 内部复用：直接关闭预付单（无 withErrorHandling 包装），供 createPayment 回收旧单时调用
 */
async function closePaymentInternal(
  event: ClosePaymentEvent,
  _context: Record<string, unknown>,
  _auth: { openid?: string; [k: string]: unknown },
  config: { mchId?: string; serialNo?: string; privateKey?: string }
): Promise<void> {
  const { outTradeNo } = event
  if (!outTradeNo) {
    throw err('INVALID_PARAMS', '缺少订单号')
  }

  const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`
  const body = { mchid: config.mchId }
  const bodyStr = JSON.stringify(body)
  const authorization = generateAuthorization(
    'POST', path, bodyStr, config.mchId, config.serialNo, config.privateKey
  )

  await httpsRequest(
    `${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`,
    body, authorization
  )
}

// =====================================================================
// confirmPayment：确认支付（拉起 trade_state 后落库）
// =====================================================================

/**
 * 确认支付
 *
 * 流程：
 *   1. 通过 outTradeNo 向微信拉取交易状态
 *   2. 校验 trade_state === SUCCESS
 *   3. 解析订单类型（orderType）
 *   4. 查询订单并校验状态机可转移性
 *   5. 更新订单 paymentStatus=paid + status=resolveOrderStatus(...)
 *   6. 同步 tuan / activity 类型到对应业务表
 *   7. 触发 commission 记录（best-effort）
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR / NOT_FOUND / STATE_INVALID
 */
export const confirmPayment: WrappedHandler<ConfirmPaymentResult> = withErrorHandling<ConfirmPaymentResult>(async (
  event: Record<string, unknown>,
  _context: Record<string, unknown>,
  _auth: { openid?: string; [k: string]: unknown }
) => {
  const { outTradeNo } = event as ConfirmPaymentEvent
  if (!outTradeNo) {
    throw err('INVALID_PARAMS', '缺少订单号')
  }

  const config = WECHAT_PAY
  if (!config.mchId || !config.privateKey) {
    throw err('BUSINESS_ERROR', '微信支付未配置')
  }

  const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${config.mchId}`
  const authorization = generateAuthorization(
    'GET', path, '', config.mchId, config.serialNo, config.privateKey
  )

  const result = (await httpsRequest(
    `${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`,
    null, authorization, 'GET'
  )) as WechatPayQueryResult

  if (result.trade_state !== 'SUCCESS') {
    return { paid: false, tradeState: result.trade_state || 'UNKNOWN' }
  }

  const orderType = getOrderType(outTradeNo)
  if (!orderType) {
    throw err('INVALID_PARAMS', '未知订单类型')
  }

  const collection = ORDER_TYPE_COLLECTION[orderType]
  const orderRes = await db.collection(collection).where({ outTradeNo }).limit(1).get()

  if (orderRes.data.length === 0) {
    throw err('NOT_FOUND', '订单不存在')
  }

  const existingOrder = orderRes.data[0] as OrderDoc

  if (existingOrder.paymentStatus === 'paid') {
    return { paid: true, alreadyConfirmed: true }
  }

  // 校验支付状态机：当前必须是 paying/unpaid → 目标 paid
  if (!paymentStateMachine.canTransition(existingOrder.paymentStatus || 'unpaid', 'paid')) {
    logger.warn('confirmPayment.illegalTransition', {
      orderType, from: existingOrder.paymentStatus, to: 'paid', outTradeNo,
    })
    throw err('STATE_INVALID', `非法状态转移 ${existingOrder.paymentStatus} -> paid`)
  }

  const updateData: Record<string, unknown> = {
    paymentStatus: 'paid',
    transactionId: result.transaction_id,
    paidAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  // 订单状态由类型决定，统一从 payment-state-machine 解析
  updateData.status = resolveOrderStatus(orderType, 'paid')

  if (!isKnownOrderType(orderType)) {
    logger.warn('confirmPayment.unknownOrderType', { orderType, outTradeNo })
  }

  // 跨集合状态同步：tuan 与 activity 类型还需同步到对应业务表
  if (orderType === 'tuan') {
    try {
      await db.collection('tuan_orders').where({ outTradeNo }).limit(1).update({
        data: { status: 'paid', paymentStatus: 'paid', paidAt: db.serverDate(), updatedAt: db.serverDate() },
      })
    } catch (e) {
      logger.warn('confirmPayment.tuan_orders.sync', { outTradeNo, code: (e as { errCode?: string })?.errCode, msg: (e as Error)?.message })
    }
  } else if (orderType === 'activity') {
    try {
      await db.collection('orders').where({
        activityId: existingOrder.activityId,
        ownerId: existingOrder.openid,
        orderType: 'activity',
      }).limit(1).update({
        data: { status: 'confirmed', paymentStatus: 'paid', paidAt: db.serverDate(), updatedAt: db.serverDate() },
      })
    } catch (e) {
      logger.warn('confirmPayment.activity.sync', { outTradeNo, code: (e as { errCode?: string })?.errCode, msg: (e as Error)?.message })
    }
  }

  await db.collection(collection).doc(existingOrder._id).update({ data: updateData })

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCommissionRecord } = require('./commission')
    await createCommissionRecord(orderType, existingOrder)
  } catch (commissionErr) {
    logger.error('confirmPayment commission', { msg: (commissionErr as Error)?.message })
  }

  return { paid: true }
})

// =====================================================================
// 默认导出（保持 CommonJS 兼容）
// =====================================================================

export default { createPayment, queryPayment, closePayment, confirmPayment }
