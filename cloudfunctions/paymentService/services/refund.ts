/**
 * paymentService/refund.ts - 退款服务（TypeScript 源文件 - Sprint 24 迁移）
 *
 * 业务功能：
 *   - createRefund：发起微信支付退款（含风控前置扫描 + 限流 + 业务校验）
 *   - queryRefund：查询退款单进度
 *
 * 迁移目标：
 *   - 强类型化 event / auth / 返回值
 *   - 与 common/* 共享类型（CloudBaseDB）
 *   - 编译产物（refund.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */

// Sprint 24 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/paymentService/services/refund.js）
//   - 对 .js 文件（wechatPayUtils / config）使用 require() 而非 import
//   - 强类型仅作用于 common/*（已有 .d.ts 产物）

import { err, isBusinessError, withErrorHandling, type WrappedHandler } from '../../common/errors'
import { initCloud } from '../../common/utils'
import { createLogger } from '../../common/logger'
import { detectRefundAbuse, mapActionToErrorCode } from '../../common/risk-control'
import { withRateLimit } from '../../common/risk-rate-limit'
import type { CloudBaseDB } from '../../common/types'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WECHAT_PAY, ENDPOINTS } = require('../common/config')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { randomString, httpsRequest, generateAuthorization } = require('./wechatPayUtils')

// =====================================================================
// 类型定义
// =====================================================================

interface CreateRefundEvent {
  outTradeNo?: string
  refundAmount?: number
  totalAmount?: number
  reason?: string
}

interface CreateRefundResult {
  refundId?: string
  outRefundNo: string
  status?: string
  channel?: string
  userReceivedAccount?: string
  pendingReview: boolean
  riskDecision: string
  riskReasons: string[]
}

interface QueryRefundEvent {
  outRefundNo?: string
}

interface WechatRefundResponse {
  refund_id?: string
  out_refund_no?: string
  status?: string
  channel?: string
  user_received_account?: string
  message?: string
}

interface OrderDoc {
  _id: string
  outTradeNo?: string
  ownerId?: string
  totalPrice?: number
  paidAmount?: number
}

// =====================================================================
// 模块初始化
// =====================================================================

const { db } = initCloud()
const logger = createLogger('paymentService:refund')

// =====================================================================
// 退款发起
// =====================================================================

/**
 * 发起退款
 *
 * 流程：
 *   1. 业务参数校验
 *   2. 订单归属校验（必须是订单 owner）
 *   3. 风控前置扫描（detectRefundAbuse，受限流保护）
 *   4. 调微信支付 API 发起退款
 *   5. 返回退款结果（含 riskDecision 供客户端/后台决策）
 *
 * @throws BusinessError INVALID_PARAMS / PERMISSION_DENIED / RISK_REJECT / RATE_LIMITED / REFUND_FAILED
 */
export const createRefund: WrappedHandler<CreateRefundResult> = withErrorHandling<CreateRefundResult>(async (
  event: Record<string, unknown>,
  _context: Record<string, unknown>,
  auth: { openid?: string; [k: string]: unknown }
) => {
  const { outTradeNo, refundAmount, totalAmount, reason } = event as CreateRefundEvent
  const openid = auth.openid || ''

  if (!outTradeNo || !refundAmount || !totalAmount) {
    throw err('INVALID_PARAMS', '参数不完整')
  }

  // 安全校验：退款金额不得超过支付金额
  if (Math.round(refundAmount) > Math.round(totalAmount)) {
    throw err('INVALID_PARAMS', '退款金额异常')
  }

  // 安全校验：查询订单，校验调用者是订单所有者 + 实际支付金额校验
  const orderDoc = await fetchOrderAndVerifyOwnership(db, outTradeNo, openid, Number(refundAmount))

  // Sprint 16: 风控前置扫描
  const { pendingReview, riskDecision, riskReasons } = await runRiskControl({
    db,
    openid,
    outTradeNo,
    orderDoc,
    refundAmount: Number(refundAmount),
    totalAmount: Number(totalAmount),
    reason: reason || '',
  })

  // 调微信支付 API
  const config = WECHAT_PAY
  if (!config.mchId || !config.privateKey) {
    throw err('BUSINESS_ERROR', '微信支付未配置')
  }

  const outRefundNo = `REFUND_${Date.now()}_${randomString(6).toUpperCase()}`
  const requestBody = {
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    reason: reason || '用户申请退款',
    amount: {
      refund: Math.round(refundAmount),
      total: Math.round(totalAmount),
      currency: 'CNY',
    },
  }
  const bodyStr = JSON.stringify(requestBody)
  const authorization = generateAuthorization(
    'POST', '/v3/refund/domestic/refunds',
    bodyStr, config.mchId, config.serialNo, config.privateKey
  )

  const refundResult = (await httpsRequest(
    `${ENDPOINTS.WECHAT_PAY_API_BASE}${ENDPOINTS.WECHAT_PAY_REFUND}`,
    requestBody, authorization
  )) as WechatRefundResponse

  if (refundResult && refundResult.status === 'FAIL') {
    throw err('REFUND_FAILED', `微信退款失败：${refundResult.message || '未知原因'}`)
  }

  // 返回 raw data：withErrorHandling 透传，由 index.js 统一 toResponse
  return {
    refundId: refundResult.refund_id,
    outRefundNo,
    status: refundResult.status,
    channel: refundResult.channel,
    userReceivedAccount: refundResult.user_received_account,
    pendingReview,
    riskDecision,
    riskReasons: pendingReview ? riskReasons : [],
  } as CreateRefundResult
})

// =====================================================================
// 退款查询
// =====================================================================

/**
 * 查询退款单进度
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR
 */
export const queryRefund: WrappedHandler<WechatRefundResponse> = withErrorHandling<WechatRefundResponse>(async (
  event: Record<string, unknown>,
  _context: Record<string, unknown>,
  _auth: { openid?: string; [k: string]: unknown }
) => {
  const { outRefundNo } = event as QueryRefundEvent
  if (!outRefundNo) {
    throw err('INVALID_PARAMS', '缺少退款单号')
  }

  const config = WECHAT_PAY
  if (!config.mchId || !config.privateKey) {
    throw err('BUSINESS_ERROR', '微信支付未配置')
  }

  const path = `/v3/refund/domestic/refunds/out-refund-no/${outRefundNo}`
  const authorization = generateAuthorization(
    'GET', path, '', config.mchId, config.serialNo, config.privateKey
  )

  const result = (await httpsRequest(
    `${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`,
    null, authorization, 'GET'
  )) as WechatRefundResponse

  return result as WechatRefundResponse
})

// =====================================================================
// 内部辅助
// =====================================================================

async function fetchOrderAndVerifyOwnership(
  db: CloudBaseDB,
  outTradeNo: string,
  openid: string,
  refundAmount: number
): Promise<OrderDoc> {
  let orderDoc: OrderDoc | null = null
  try {
    const orderRes = await db.collection('orders')
      .where({ outTradeNo }).limit(1).get()
    const list = (orderRes && (orderRes as { data?: OrderDoc[] }).data) || []
    if (list.length > 0) {
      orderDoc = list[0]
      if (orderDoc.ownerId && orderDoc.ownerId !== openid) {
        throw err('PERMISSION_DENIED', '权限不足')
      }
      // 使用数据库中的实际支付金额校验：申请退款金额不能超过实际已支付金额
      const actualTotal = Number(orderDoc.paidAmount || orderDoc.totalPrice || 0)
      if (actualTotal > 0 && Math.round(refundAmount) > Math.round(actualTotal)) {
        throw err('INVALID_PARAMS', '退款金额异常')
      }
    }
  } catch (e) {
    // 重新抛出 BusinessError（带 code 的错误）
    if (e && typeof e === 'object' && 'code' in e) { throw e }
    // DB 异常时记录日志并抛出错误（不吞掉异常）
    logger.error('createRefund: 查询订单校验失败', { msg: (e as Error)?.message })
    throw err('DATA_ERROR', '订单查询失败，无法验证所有权')
  }
  
  // 订单不存在时抛出错误（不允许绕过所有权校验）
  if (!orderDoc) {
    throw err('NOT_FOUND', '订单不存在')
  }
  
  return orderDoc
}

interface RiskControlInput {
  db: CloudBaseDB
  openid: string
  outTradeNo: string
  orderDoc: OrderDoc | null
  refundAmount: number
  totalAmount: number
  reason: string
}

interface RiskControlOutput {
  pendingReview: boolean
  riskDecision: string
  riskReasons: string[]
}

async function runRiskControl(input: RiskControlInput): Promise<RiskControlOutput> {
  const { db, openid, outTradeNo, orderDoc, refundAmount, totalAmount, reason } = input

  let pendingReview = false
  let riskDecision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT' = 'RISK_PASS'
  let riskReasons: string[] = []

  try {
    // Sprint 17: 风控检测入口限流（防滥用 detect API）
    const risk = await withRateLimit(
      { userId: openid, type: 'refund', targetId: outTradeNo },
      () => detectRefundAbuse({
        db,
        userId: openid,
        orderId: orderDoc ? orderDoc._id : outTradeNo,
        refundAmount,
        totalAmount,
        reason,
      })
    )
    riskDecision = mapActionToErrorCode(risk.action)
    riskReasons = risk.reasons
    if (risk.action === 'reject') {
      logger.warn('createRefund.risk_reject', { outTradeNo, userId: openid, reasons: risk.reasons })
      throw err('RISK_REJECT', '退款被风控拦截', {
        reasons: risk.reasons,
        level: risk.level,
        outTradeNo,
      })
    }
    if (risk.action === 'review') {
      pendingReview = true
      logger.info('createRefund.risk_pending', { outTradeNo, userId: openid, reasons: risk.reasons })
    } else {
      logger.debug?.('createRefund.risk_pass', { outTradeNo, userId: openid })
    }
  } catch (e) {
    if (isBusinessError(e) && e.code === 'RATE_LIMITED') {
      logger.warn('createRefund.rate_limited', { outTradeNo, userId: openid, msg: e.message })
      throw e
    }
    if (isBusinessError(e) && e.code === 'RISK_REJECT') {throw e}
    // 风控系统异常时降级为放行（fail-open），记录详细日志便于监控和排查
    logger.warn('createRefund.risk_control_fail_open', {
      outTradeNo,
      userId: openid,
      refundAmount,
      errorType: typeof e,
      errorMessage: (e as Error)?.message || String(e),
      errorStack: (e as Error)?.stack,
      timestamp: new Date().toISOString(),
    })
    riskDecision = 'RISK_PASS' // 异常降级为放行，避免误伤
  }

  return { pendingReview, riskDecision, riskReasons }
}

// =====================================================================
// 默认导出（保持 CommonJS 兼容）
// =====================================================================

export default { createRefund, queryRefund }
