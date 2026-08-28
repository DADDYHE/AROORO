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

import { err, isBusinessError, withErrorHandling, type WrappedHandler } from '../common/errors'
import { initCloud, handleSuccess, type SuccessResult } from '../common/utils'
import { createLogger } from '../common/logger'
import { withRateLimit } from '../common/risk-rate-limit'
import type { CloudBaseDB } from '../common/types'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WECHAT_PAY, ENDPOINTS } = require('../common/config')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { randomString, rsaSign, httpsRequest, generateAuthorization } = require('./wechatPayUtils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { paymentStateMachine } = require('../common/payment-state-machine')
// P0-6: 资金事务失败主动告警
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordAlert } = require('../common/alert')

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

const { db }: { db: CloudBaseDB } = initCloud()
const _ = db.command
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
  // P0-A: mall 改 finalAmount（实付）——原 totalPrice 字段 mall 订单不写、fallback 到 totalAmount(原价)，
  //   与前端支付折后价不匹配导致有券下单必失败；老单无 finalAmount 时 fallback totalPrice/totalAmount（P1-3 前无券记录=实付）
  order: 'totalPrice',
  mall: 'finalAmount',
  tuan: 'totalPrice',
  activity: 'finalAmount',
  feeding: 'totalAmount',
}

// H4+M15: 导出供 refund.ts 复用，避免 orderType 推断逻辑双份漂移
//   refund 旧实现 `outTradeNo.split('_')[0].toLowerCase()`：
//   - ACT_xxx → act（不匹配 activity）；FD_xxx → fd（不匹配 feeding）
//   - 导致 activity/feeding 退款时业务表同步全部跳过
export const ORDER_TYPE_PREFIX_MAP: Record<string, OrderType> = {
  ORDER_: 'order',
  MALL_: 'mall',
  TUAN_: 'tuan',
  ACT_: 'activity',
  FD_: 'feeding',
}

// H4: 导出 collection 映射，refund 按 orderType 路由到正确集合
export const ORDER_TYPE_COLLECTION_MAP = ORDER_TYPE_COLLECTION
// H4+M12: 导出 amount 字段映射，commission 复用避免字段优先级不一致
export const ORDER_TYPE_AMOUNT_FIELD_MAP = ORDER_TYPE_AMOUNT_FIELD

export function getOrderType(outTradeNo: string): OrderType | null {
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
export const createPayment: WrappedHandler<SuccessResult<CreatePaymentResult>> = withErrorHandling<SuccessResult<CreatePaymentResult>>(async (
  event: Record<string, unknown>,
  context: Record<string, unknown>,
  auth: { openid?: string; [k: string]: unknown }
) => {
  const openid = auth.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { type, orderId, amount, description } = event as CreatePaymentEvent
  // H11: amount 类型严格校验——必须为有限正整数（分单位）
  //   原仅 `!amount || amount <= 0`，字符串 "100"/NaN/Infinity/浮点数 99.99 均可绕过
  //   Math.round("100")=100 / Math.round(99.99)=100 隐式转换导致单位混乱
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw err('INVALID_PARAMS', '支付金额必须为正数')
  }
  if (!Number.isInteger(amount)) {
    throw err('INVALID_PARAMS', '支付金额必须为整数（分单位）')
  }
  if (!type || !orderId) {
    throw err('INVALID_PARAMS', '缺少订单类型或订单号')
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

  // M16: ownership 校验——仅订单 owner 可发起支付
  //   原无校验，任意登录用户凭 orderId 即可为他人订单发起支付，
  //   虽然金额校验仍生效（不会造成直接资金损失），但会导致：
  //   - 订单状态被推进到 paying，影响 owner 正常支付流程
  //   - prepay_id 被滥用，违反微信支付用户身份一致性约定
  if (orderData.ownerId && orderData.ownerId !== openid) {
    throw err('PERMISSION_DENIED', '无权操作他人订单')
  }

  if (orderData.paymentStatus === 'paid') {
    throw err('ORDER_ALREADY_PAID', '订单已支付', { orderId })
  }

  // P0 修复（2026-08-28）：已取消订单禁止发起支付。
  //   原实现只校验 paymentStatus，不校验 status=cancelled，
  //   导致被超时/主动取消的订单仍可调起微信支付（createPayment 放行 →
  //   notify.ts cancelled 防护拒绝置 paid → 用户扣款但订单取消，P0 资损）。
  if (orderData.status === 'cancelled') {
    throw err('ORDER_STATUS_CHANGED', '订单已取消，无法支付', { orderId, status: orderData.status })
  }

  // H2: 旧逻辑 `if (amount && orderData.totalPrice && ...)` 在 totalPrice=0/缺失时跳过比对
  //   该校验与下方 actualAmount 比对语义重复，统一在下方 actualAmount 校验中处理
  //   避免 totalPrice 与 amountField 字段不一致时双重判断产生分歧

  // Sprint 25: 旧预付单回收（如果订单有 outTradeNo 且 paymentStatus=paying，先关掉）
  // P0-A: activity 中间态为 'pending'，同样纳入旧单回收
  const oldPayingStatus = orderType === 'activity' ? 'pending' : 'paying'
  if (orderData.outTradeNo && orderData.paymentStatus === oldPayingStatus) {
    try {
      await closePaymentInternal({ outTradeNo: orderData.outTradeNo }, context, auth, config)
      logger.info('createPayment: 关闭旧支付单', { outTradeNo: orderData.outTradeNo })
    } catch (closeErr) {
      logger.warn('createPayment: 关闭旧支付单失败', { msg: (closeErr as Error)?.message })
      // P2 修复：旧预付单关闭失败会导致微信侧单泄漏（2 小时自动关闭），持久化告警供运维关注
      try {
        await recordAlert(
          'warning',
          'createPayment.close_old_prepay.failed',
          '创建新支付单前关闭旧预付单失败，旧单可能泄漏',
          { orderId: orderId as string, outTradeNo: orderData.outTradeNo, error: (closeErr as Error)?.message },
        )
      } catch (_) { /* best-effort */ }
    }
  }

  let actualAmount = 0
  try {
    const amountField = ORDER_TYPE_AMOUNT_FIELD[orderType] || 'totalPrice'
    actualAmount = Number(orderData[amountField] || orderData.totalPrice || orderData.totalAmount || orderData.amount || 0)
  } catch (e) {
    logger.warn('createPayment: 解析订单金额失败', { msg: (e as Error)?.message })
  }
  // H2: 强制 actualAmount > 0——免费订单不应进入 createPayment 流程
  //   原逻辑 `if (actualAmount > 0 && ...)` 在 actualAmount=0 时跳过比对，
  //   客户端可传任意小额 amount（如 1 分）调起微信下单成功，造成资金损失
  if (!Number.isFinite(actualAmount) || actualAmount <= 0) {
    logger.error('createPayment: 订单金额异常', {
      orderId, type, amountField: ORDER_TYPE_AMOUNT_FIELD[orderType] || 'totalPrice',
      dbAmount: actualAmount,
    })
    throw err('PAYMENT_AMOUNT_MISMATCH', '订单金额异常，无法发起支付', { dbAmount: actualAmount })
  }
  // H2: 客户端入参 amount 必须与 DB 订单金额一致（统一以分为单位比对）
  if (Math.round(amount) !== Math.round(actualAmount * 100)) {
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
  // H5: 条件更新——仅当 paymentStatus 仍为 unpaid/paying 时才推进到 paying
  //   原 `doc(orderId).update(...)` 无条件写入，并发场景下：
  //   - 已被并发流程置为 paid 的订单会被覆盖为 paying（资金与状态不一致）
  //   - 同一订单两次 createPayment 同时进行，outTradeNo 被后写入覆盖，旧 prepay 单泄漏
  //   新逻辑：where paymentStatus in ['unpaid','paying'] 条件更新，
  //   更新失败说明订单已被其他流程推进，需回滚微信侧预付单
  // P0-A 修复：activity 报名单支付中间态为 'pending'（activityService 写入），
  //   且历史单可能字段缺失，故 activity 条件放宽到 in(['unpaid','pending',null])、
  //   写回 'pending'（保持活动口径统一，orderTimeoutService 超时扫描 in(['unpaid','pending',null]) 才能命中）
  const allowedPaymentStatus = orderType === 'activity'
    ? ['unpaid', 'paying', 'pending', null]
    : ['unpaid', 'paying']
  const targetPaymentStatus = orderType === 'activity' ? 'pending' : 'paying'
  const updateRes = await db.collection(orderCollection)
    .where({ _id: orderId as string, paymentStatus: _.in(allowedPaymentStatus) })
    .update({ data: { outTradeNo, paymentStatus: targetPaymentStatus, updatedAt: db.serverDate() } })

  // H5: 更新未命中（订单已被并发推进为 paid/cancelled 等）
  //   此时微信侧 prepay_id 已生成，必须主动关闭避免泄漏
  if (!updateRes.stats || updateRes.stats.updated === 0) {
    logger.error('createPayment: 订单状态已变更，回滚微信侧预付单', {
      orderId, outTradeNo, currentStatus: orderData.paymentStatus,
    })
    try {
      await closePaymentInternal({ outTradeNo }, context, auth, config)
    } catch (closeErr) {
      logger.error('createPayment: 回滚预付单失败', { outTradeNo, msg: (closeErr as Error)?.message })
    }
    throw err('ORDER_STATUS_CHANGED', '订单状态已变更，请刷新后重试', { orderId, currentStatus: orderData.paymentStatus })
  }

  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = randomString(32)
  const packageStr = `prepay_id=${payResult.prepay_id}`
  const payMessage = `${[config.appId, timeStamp, nonceStr, packageStr].join('\n')}\n`
  const paySign = rsaSign(config.privateKey, payMessage)

  // H7 修复：必须用 handleSuccess 包装返回值，否则客户端 CloudFunctionService.call
  //   会因 result.code !== 0 走错误分支，抛出"云函数执行失败"（code 9999）
  return handleSuccess({
    orderId: orderId as string,
    outTradeNo,
    paymentParams: { timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign },
  }, '创建支付订单成功')
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

  // H9: ownership 校验——仅订单 owner 可关闭自己的 prepay 单
  //   原无校验，任何登录用户凭 outTradeNo 即可关闭他人 prepay 单（拒绝服务）
  //   通过 outTradeNo 前缀推断 orderType，路由到对应集合查询 ownerId
  const orderType = getOrderType(outTradeNo)
  if (orderType) {
    const collection = ORDER_TYPE_COLLECTION[orderType]
    try {
      const orderRes = await db.collection(collection).where({ outTradeNo }).limit(1).get()
      if (orderRes.data && orderRes.data.length > 0) {
        const orderDoc = orderRes.data[0] as OrderDoc
        if (orderDoc.ownerId && orderDoc.ownerId !== _auth.openid) {
          throw err('PERMISSION_DENIED', '无权操作他人订单')
        }
      }
    } catch (e) {
      // 重新抛出 BusinessError
      if (e && typeof e === 'object' && 'code' in e) { throw e }
      // 查询失败不阻断关闭流程（best-effort 校验）
      logger.warn('closePayment.ownership_check.failed', { outTradeNo, msg: (e as Error)?.message })
    }
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
 *   5. 校验实付金额与订单金额一致
 *
 * P0 修复（只读确认）：不再推进订单状态/同步业务表/触发佣金——
 *   状态推进统一由微信支付回调（paymentNotify）完成，避免 confirmPayment 与回调
 *   竞态导致"回调条件更新失败 → 名额/券核销/收入/佣金缺失"的资金一致性问题。
 *   本接口仅用于前端支付成功后即时确认"微信侧已扣款"，返回 paid:true 供展示。
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

  // H9+M9: ownership 校验——仅订单 owner 可触发他人订单的状态推进与佣金创建
  //   原无校验，任何登录用户凭 outTradeNo 即可触发他人订单的状态推进
  //   虽然需微信 trade_state=SUCCESS 才推进，但副作用如 alert/日志会污染
  if (existingOrder.ownerId && existingOrder.ownerId !== _auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人订单')
  }

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

  // P1 修复：实付金额一致性校验（微信查询响应 amount.total 为分）
  const amountObj = (result.amount || {}) as { total?: number }
  const paidAmountFen = typeof amountObj.total === 'number' ? amountObj.total : null
  if (paidAmountFen !== null && Number.isFinite(paidAmountFen)) {
    const amountField = ORDER_TYPE_AMOUNT_FIELD[orderType] || 'totalPrice'
    const expectedYuan = Number(existingOrder[amountField] || existingOrder.totalPrice || existingOrder.totalAmount || 0)
    if (Number.isFinite(expectedYuan) && expectedYuan > 0 && Math.round(expectedYuan * 100) !== Math.round(paidAmountFen)) {
      logger.error('confirmPayment.amount_mismatch', {
        outTradeNo, orderType, orderId: existingOrder._id,
        paidFen: paidAmountFen, expectedFen: Math.round(expectedYuan * 100),
      })
      await recordAlert(
        'critical',
        'confirmPayment.amount_mismatch',
        '确认支付时微信实付金额与订单金额不一致，需人工对账',
        { outTradeNo, orderType, orderId: existingOrder._id, paidFen: paidAmountFen, expectedFen: Math.round(expectedYuan * 100) },
      )
      // 金额不一致不确认成功（状态推进由回调负责；回调侧同样校验并告警）
      return { paid: false, tradeState: result.trade_state || 'SUCCESS' }
    }
  }

  return { paid: true }
})

// =====================================================================
// 默认导出（保持 CommonJS 兼容）
// =====================================================================

export default { createPayment, queryPayment, closePayment, confirmPayment }
