/**
 * paymentService/notify.ts - 微信支付回调服务（TypeScript 源文件 - Sprint 26 迁移）
 *
 * 业务功能：
 *   - paymentNotify：处理微信支付 V3 回调
 *     1) 验证签名（RSA-SHA256，使用平台证书公钥）
 *     2) AES-256-GCM 解密回调资源
 *     3) 解析订单信息，推进订单状态机
 *     4) 跨集合同步（tuan_orders / orders 活动报名）
 *     5) 触发 commission 记录（best-effort）
 *
 * 与 pay.ts / refund.ts 的关键差异：
 *   - 返回结构：使用 { statusCode, body } HTTP 响应，**不是**标准 API 响应
 *     （微信支付回调直接消费此结构，错误时也必须返回 HTTP 响应而非 ApiResponse）
 *   - 不使用 withErrorHandling 包装：异常路径也需要返回 HTTP 响应
 *   - 鉴权：不需要登录（paymentService/index.js 的 NO_AUTH_ACTIONS 已声明）
 *   - 入口：paymentService/index.js 的 isHttpRequest(event) 判定
 *
 * 迁移目标：
 *   - 强类型化 event / headers / resource / orderInfo
 *   - 与 common/* 共享类型（CloudBaseDB）
 *   - 编译产物（notify.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */

// Sprint 26 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/paymentService/services/notify.js）
//   - 对 .js 文件（config）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - 业务错误码使用 err(...) 工厂，参数校验时抛出，运行时错误走 try/catch 兜底
//   - 不使用 withErrorHandling：保留 HTTP 响应结构

import * as crypto from 'crypto'
import { err } from '../common/errors'
import { initCloud } from '../common/utils'
import { createLogger } from '../common/logger'
import type { CloudBaseDB } from '../common/types'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WECHAT_PAY } = require('../common/config')
// P0-6: 资金事务失败主动告警
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordAlert } = require('../common/alert')

// =====================================================================
// 类型定义
// =====================================================================

/** 订单类型（与 pay.ts / refund.ts 保持一致） */
type OrderType = 'order' | 'mall' | 'tuan' | 'activity' | 'feeding'

/** 微信支付回调的 event 入参 */
interface NotifyEvent {
  headers?: Record<string, string | undefined>
  body?: string | Record<string, unknown> | null
  [k: string]: unknown
}

/** 微信支付回调头（大小写不敏感，统一映射到小写字段） */
interface NotifyHeaders {
  signature: string | undefined
  timestamp: string | undefined
  nonce: string | undefined
  serial: string | undefined
}

/** 微信支付回调的加密 resource */
interface NotifyResource {
  ciphertext?: string
  associated_data?: string
  nonce?: string
}

/** 微信支付回调的 body */
interface NotifyBody {
  resource?: NotifyResource
  [k: string]: unknown
}

/** 解密后的订单信息 */
interface NotifyOrderInfo {
  out_trade_no?: string
  transaction_id?: string
  trade_state?: string
  [k: string]: unknown
}

/** 订单文档（最小子集，避免过宽索引签名） */
interface NotifyOrderDoc {
  _id: string
  outTradeNo?: string
  ownerId?: string
  openid?: string
  activityId?: string
  paymentStatus?: string
  status?: string
  orderType?: string
  [k: string]: unknown
}

/** HTTP 响应（与微信支付回调契约一致） */
interface NotifyHttpResponse {
  statusCode: number
  body: string
}

// =====================================================================
// 模块初始化
// =====================================================================

const { db } = initCloud()
const logger = createLogger('paymentService:notify')

// =====================================================================
// 订单类型元数据（与 pay.ts 保持一致）
// =====================================================================

const ORDER_TYPE_PREFIX_MAP: Record<string, OrderType> = {
  ORDER_: 'order',
  MALL_: 'mall',
  TUAN_: 'tuan',
  ACT_: 'activity',
  FD_: 'feeding',
}

const ORDER_TYPE_COLLECTION: Record<OrderType, string> = {
  order: 'orders',
  mall: 'orders',
  tuan: 'orders',
  activity: 'activity_registrations',
  feeding: 'feedingOrders',
}

// =====================================================================
// 工具函数
// =====================================================================

/**
 * AES-256-GCM 解密（与微信支付 V3 加密方式对齐）
 */
function decryptAes256Gcm(
  data: string,
  key: string,
  nonce: string,
  associatedData: string | undefined
): string {
  const ciphertext = Buffer.from(data, 'base64')
  const keyBuffer = Buffer.from(key, 'utf8')
  const nonceBuffer = Buffer.from(nonce, 'utf8')
  const authTag = ciphertext.slice(ciphertext.length - 16)
  const actualCiphertext = ciphertext.slice(0, ciphertext.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonceBuffer, { authTagLength: 16 })
  decipher.setAuthTag(authTag)
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData))
  }

  let decrypted = decipher.update(actualCiphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * 解析并标准化回调头（兼容大小写）
 */
function parseHeaders(event: NotifyEvent): NotifyHeaders {
  const headers = event.headers || {}
  return {
    signature: headers['Wechatpay-Signature'] || headers['wechatpay-signature'],
    timestamp: headers['Wechatpay-Timestamp'] || headers['wechatpay-timestamp'],
    nonce: headers['Wechatpay-Nonce'] || headers['wechatpay-nonce'],
    serial: headers['Wechatpay-Serial'] || headers['wechatpay-serial'],
  }
}

/**
 * 解析回调 body（兼容 string / object 两种入参）
 */
function parseBody(event: NotifyEvent): NotifyBody {
  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body) as NotifyBody
    } catch (e) {
      throw err('PAYMENT_NOTIFY_INVALID', '回调 body 解析失败')
    }
  }
  return (event.body as NotifyBody) || {}
}

/**
 * 解析 outTradeNo 前缀，识别订单类型
 */
function getOrderType(outTradeNo: string): OrderType | null {
  for (const [prefix, type] of Object.entries(ORDER_TYPE_PREFIX_MAP)) {
    if (outTradeNo.startsWith(prefix)) {return type}
  }
  return null
}

/**
 * 构造微信支付回调标准响应
 */
function httpResponse(statusCode: number, code: 'SUCCESS' | 'FAIL', message: string): NotifyHttpResponse {
  return {
    statusCode,
    body: JSON.stringify({ code, message }),
  }
}

// =====================================================================
// 签名验证
// =====================================================================

/**
 * 验证微信支付回调签名
 *
 * 消息格式：`${timestamp}\n${nonce}\n${rawBody}\n`
 * 签名算法：RSA-SHA256 with 平台证书公钥
 *
 * 失败抛出 BusinessError（PAYMENT_NOTIFY_INVALID）
 */
function verifySignature(
  rawBody: string,
  timestamp: string,
  nonce: string,
  signature: string,
  certificate: string
): void {
  let certOrKey = certificate
  try {
    const decoded = Buffer.from(certOrKey, 'base64').toString('utf8')
    if (decoded.includes('-----BEGIN')) {
      certOrKey = decoded
    }
  } catch (e) {
    // 解码失败时使用原始字符串（公钥内容）
  }

  const message = `${timestamp}\n${nonce}\n${rawBody}\n`
  // M1: createPublicKey 失败时错误信息可能包含证书片段，需包装为业务错误
  let publicKey
  try {
    publicKey = crypto.createPublicKey(certOrKey)
  } catch (e) {
    throw err('PAYMENT_NOTIFY_INVALID', '平台证书格式无效')
  }
  const verify = crypto.createVerify('SHA256withRSA')
  verify.update(message)
  verify.end()
  let isValid = false
  try {
    isValid = verify.verify(publicKey, Buffer.from(signature, 'base64'))
  } catch (e) {
    // verify 失败视为签名无效，不泄露底层错误
    isValid = false
  }
  if (!isValid) {
    throw err('PAYMENT_NOTIFY_INVALID', '签名验证失败')
  }
}

// =====================================================================
// 订单状态推进
// =====================================================================

/**
 * 推进订单状态：paymentStatus=paid + 同步状态字段 + 跨表同步
 *
 * P4-3-4: 订单状态更新 + 业务表同步 + 活动名额递增 纳入单一事务
 * 旧实现各步独立 try/catch，任一步失败留下中间状态（如订单已支付但活动名额未递增）。
 * 新实现：事务前查询 _id 列表（CloudBase 事务内不支持 where().update()），
 * 然后在单一事务内逐个 doc(id).update()，任一失败整体回滚。
 */
async function applyPaidStatus(
  orderType: OrderType,
  existingOrder: NotifyOrderDoc,
  transactionId: string | undefined
): Promise<boolean> {
  const collection = ORDER_TYPE_COLLECTION[orderType]
  const serverDate = db.serverDate()
  const updateData: Record<string, unknown> = {
    paymentStatus: 'paid',
    transactionId: transactionId || '',
    paidAt: serverDate,
    updatedAt: serverDate,
  }

  if (orderType === 'order' || orderType === 'mall') {
    updateData.status = 'paid'
  } else if (orderType === 'tuan') {
    updateData.status = 'paid'
  } else if (orderType === 'activity') {
    updateData.status = 'confirmed'
  } else if (orderType === 'feeding') {
    updateData.status = 'confirmed'
  }

  // 事务前：查询需要在事务内更新的关联文档 _id 列表
  let relatedOrderIds: string[] = []
  const tuanOrderId = (existingOrder as Record<string, unknown>).tuanOrderId as string | undefined

  if (orderType === 'activity' && existingOrder.activityId && existingOrder.openid) {
    try {
      const relatedRes = await db.collection('orders')
        .where({
          activityId: existingOrder.activityId,
          ownerId: existingOrder.openid,
          orderType: 'activity',
        })
        .field({ _id: true } as Record<string, true>)
        .limit(5)
        .get()
      relatedOrderIds = (((relatedRes && relatedRes.data) || []) as Array<{ _id: string }>)
        .map((r) => r._id)
    } catch (e) {
      logger.warn('paymentNotify queryRelatedOrders.failed', {
        outTradeNo: existingOrder.outTradeNo,
        msg: (e as Error)?.message,
      })
    }
  }

  const transaction = await db.startTransaction()
  try {
    // 1) 更新主集合文档（activity_registrations / orders / feedingOrders）
    await transaction.collection(collection).doc(existingOrder._id).update({ data: updateData })

    // 2) 同步业务表
    if (orderType === 'tuan' && tuanOrderId) {
      await transaction.collection('tuan_orders').doc(tuanOrderId).update({
        data: {
          status: 'paid',
          paymentStatus: 'paid',
          transactionId: transactionId || '',
          paidAt: serverDate,
          updatedAt: serverDate,
        },
      })
    }

    if (orderType === 'activity') {
      // 2a) 同步关联的 orders 文档
      for (const oid of relatedOrderIds) {
        await transaction.collection('orders').doc(oid).update({
          data: { status: 'confirmed', paymentStatus: 'paid', paidAt: serverDate, updatedAt: serverDate },
        })
      }

      // 2b) P4-3-4: 活动名额递增（currentParticipants）
      // 修复：按报名单实际 participantCount 递增，避免团体/多宠报名（participantCount > 1）少计名额。
      // 旧实现硬编码 inc(1)，导致多人报名时 currentParticipants 与实际支付人数不一致。
      // 注意：免费活动在 submitRegistration 提交时已按 pCount 递增，付费活动延迟到此回调递增一次（见 activityService.submitRegistration）。
      if (existingOrder.activityId) {
        const pCount = Math.max(1, Math.floor(Number((existingOrder as Record<string, unknown>).participantCount) || 1))
        await transaction.collection('activities').doc(existingOrder.activityId).update({
          data: { currentParticipants: db.command.inc(pCount), updatedAt: serverDate },
        })
      }
    }

    await transaction.commit()
    logger.info('paymentNotify.applyPaidStatus.transaction.success', {
      orderId: existingOrder._id,
      orderType,
      relatedCount: relatedOrderIds.length,
    })
    return true
  } catch (txError) {
    try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
    logger.error('paymentNotify.applyPaidStatus.transaction.failed', {
      orderId: existingOrder._id,
      orderType,
      msg: (txError as Error)?.message,
      alert: '支付回调 DB 状态同步失败，需人工对账',
    })
    // P0-6: 持久化告警，供运维主动查询对账
    await recordAlert(
      'critical',
      'paymentNotify.applyPaidStatus.transaction.failed',
      '支付回调 DB 状态同步失败，需人工对账',
      {
        orderId: existingOrder._id,
        orderType,
        outTradeNo: existingOrder.outTradeNo,
        transactionId: transactionId || '',
        error: (txError as Error)?.message,
      }
    )
    // 不抛错：微信支付回调需要返回 SUCCESS 避免重试轰炸
    return false
  }
}

/**
 * 触发 commission 记录（best-effort）
 */
async function triggerCommission(orderType: string, order: NotifyOrderDoc): Promise<void> {
  if (orderType !== 'mall' && orderType !== 'tuan' && orderType !== 'feeding') { return }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCommissionRecord } = require('./commission')
    await createCommissionRecord(orderType, order)
  } catch (commissionErr) {
    logger.error('paymentNotify commission', {
      msg: (commissionErr as Error)?.message,
    })
  }
}

/**
 * H2: 核销 feeding 订单关联的优惠券（best-effort）
 *
 * 流程：
 *   - 仅 feeding 类型订单需要在此核销（mall/tuan 由前端在支付成功后调用 useCoupon）
 *   - feedingService.createFeedingOrder 已在订单创建时锁定券（lockCoupon）
 *   - 此处在支付成功后调用 couponService.useCoupon 完成「锁定 → 已使用」状态转换
 *   - 失败不阻塞回调返回，仅记日志 + 告警，避免微信支付重复通知
 *
 * 注意：
 *   - 跨云函数调用使用 cloud.callFunction（paymentService 内已有 cloud 实例）
 *   - orderId 必须为 feedingOrders 集合的 _id，与 lockCoupon 时传入的 orderId 一致
 */
async function triggerFeedingCouponUse(order: NotifyOrderDoc): Promise<void> {
  const couponId = (order as Record<string, unknown>).couponId as string | undefined
  if (!couponId) { return }

  const orderId = order._id
  const originalAmount = Number((order as Record<string, unknown>).originalAmount) || 0
  const couponDiscount = Number((order as Record<string, unknown>).couponDiscount) || 0
  const finalAmount = Number((order as Record<string, unknown>).totalAmount) || 0

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initCloud } = require('../common/utils')
    const { cloud } = initCloud()
    const useResult = await cloud.callFunction({
      name: 'couponService',
      data: {
        action: 'useCoupon',
        couponId,
        orderId,
        business: 'feeding',
        originalAmount,
        discountAmount: couponDiscount,
        finalAmount,
      },
    })
    const useRes = useResult && (useResult.result as { code?: number; message?: string })
    if (!useRes || useRes.code !== 0) {
      logger.warn('paymentNotify.feeding.useCoupon.failed', {
        orderId, couponId, msg: useRes && useRes.message,
      })
      try {
        await recordAlert('warning', 'paymentNotify.feeding.useCoupon.failed',
          '喂养订单优惠券核销失败，需人工核对',
          {
            orderId, outTradeNo: order.outTradeNo, couponId,
            message: useRes && useRes.message,
          })
      } catch (_) { /* best-effort */ }
    }
  } catch (useErr) {
    logger.error('paymentNotify.feeding.useCoupon.exception', {
      orderId, couponId, msg: (useErr as Error)?.message,
    })
    try {
      await recordAlert('warning', 'paymentNotify.feeding.useCoupon.exception',
        '喂养订单优惠券核销异常，需人工核对',
        {
          orderId, outTradeNo: order.outTradeNo, couponId,
          error: (useErr as Error)?.message,
        })
    } catch (_) { /* best-effort */ }
  }
}

// =====================================================================
// 主入口
// =====================================================================

/**
 * 微信支付 V3 回调入口
 *
 * 流程：
 *   1. 解析回调头（签名 / 时间戳 / 随机串 / 证书序列号）
 *   2. 验证签名（RSA-SHA256）
 *   3. AES-256-GCM 解密 resource
 *   4. 解析 outTradeNo → 订单类型
 *   5. 查询订单，幂等检查（已 paid 则直接返回）
 *   6. 推进订单状态（paymentStatus=paid + 跨表同步）
 *   7. 触发 commission 记录
 *   8. 返回微信支付期望的响应
 *
 * 错误处理：
 *   - 业务错误：返回 HTTP 200 + SUCCESS（幂等保护）
 *   - 签名 / 格式错误：返回 HTTP 401 / 400 + FAIL
 *   - 未知错误：返回 HTTP 500 + FAIL（同时记日志）
 *
 * 签名约定：
 *   - event: HTTP 触发事件（含 headers / body）
 *   - context: 云函数上下文
 *   - auth: 永远为 null（paymentService/index.js 中 NO_AUTH_ACTIONS 包含 paymentNotify）
 */
export async function paymentNotify(
  event: Record<string, unknown>,
  _context: Record<string, unknown>,
  _auth: { openid?: string; [k: string]: unknown } | null
): Promise<NotifyHttpResponse> {
  try {
    const e = event as NotifyEvent
    const headers = parseHeaders(e)
    const { signature, timestamp, nonce, serial } = headers

    if (!signature || !timestamp || !nonce) {
      return httpResponse(401, 'FAIL', '缺少签名头信息')
    }

    // H3: timestamp 时效校验——拒绝 5 分钟外的回调，防重放
    //   原逻辑未校验时效，攻击者可重放历史合法回调触发重复状态推进
    //   微信回调时间戳为秒级 Unix 时间戳
    const tsNum = Number(timestamp)
    if (!Number.isFinite(tsNum) || tsNum <= 0) {
      return httpResponse(401, 'FAIL', 'timestamp 格式非法')
    }
    const MAX_SKEW_SECONDS = 300 // 5 分钟
    const skew = Math.abs(Math.floor(Date.now() / 1000) - tsNum)
    if (skew > MAX_SKEW_SECONDS) {
      logger.warn('paymentNotify: timestamp 超出时效', { timestamp, skew })
      return httpResponse(401, 'FAIL', 'timestamp 超出时效')
    }

    const rawBody = typeof e.body === 'string' ? e.body : JSON.stringify(e.body || {})
    const body = parseBody(e)
    const resource = body.resource || {}
    const ciphertext = resource.ciphertext
    const associatedData = resource.associated_data
    const resourceNonce = resource.nonce

    if (!ciphertext) {
      return httpResponse(400, 'FAIL', '回调数据缺少 ciphertext')
    }
    // M3: ciphertext 长度上限收紧——实际微信回调 <1KB，1MB 过大易受内存/CPU 攻击
    if (typeof ciphertext !== 'string' || ciphertext.length > 16 * 1024) {
      logger.error('paymentNotify: ciphertext 非法', { len: typeof ciphertext === 'string' ? ciphertext.length : -1 })
      throw err('PAYMENT_NOTIFY_INVALID', '回调数据格式错误')
    }

    const wechatpayCertificate = WECHAT_PAY.certificate
    if (!wechatpayCertificate) {
      // H10: 配置缺失时持久化告警，运维主动感知
      //   微信收到 5xx 会重试 8 次（每次递增），重试期间配置若恢复可成功
      //   原仅 logger.error 无持久化，运维无法主动发现
      logger.error('paymentNotify: 微信支付平台证书/公钥未配置', new Error('certificate missing'))
      await recordAlert(
        'critical',
        'paymentService.wechat_pay.misconfigured',
        '微信支付平台证书/公钥未配置，回调全部失败',
        { missing: 'certificate' }
      ).catch((e: Error) => logger.error('recordAlert failed', { msg: e.message }))
      return httpResponse(500, 'FAIL', '未配置微信支付平台证书/公钥')
    }

    // H3: serial 头与商户证书序列号比对——防伪造回调
    //   原逻辑解析了 serial 但未比对，攻击者持有任意合法 RSA 私钥即可构造通过验签的伪造回调
    //   必须确认 serial 与本商户配置的平台证书序列号一致
    const expectedSerial = WECHAT_PAY.serialNo
    if (serial && expectedSerial && serial !== expectedSerial) {
      logger.warn('paymentNotify: serial 不匹配', { serial, expectedSerial })
      return httpResponse(401, 'FAIL', '证书序列号不匹配')
    }

    verifySignature(rawBody, timestamp, nonce, signature, wechatpayCertificate)

    const apiV3Key = WECHAT_PAY.apiV3Key
    if (!apiV3Key) {
      // H10: 同 certificate 缺失，持久化告警
      logger.error('paymentNotify: 微信支付API V3密钥未配置', new Error('apiV3Key missing'))
      await recordAlert(
        'critical',
        'paymentService.wechat_pay.misconfigured',
        '微信支付API V3密钥未配置，回调全部失败',
        { missing: 'apiV3Key' }
      ).catch((e: Error) => logger.error('recordAlert failed', { msg: e.message }))
      return httpResponse(500, 'FAIL', '未配置微信支付API V3密钥')
    }

    const decryptedData = decryptAes256Gcm(ciphertext, apiV3Key, resourceNonce || '', associatedData)
    const orderInfo = JSON.parse(decryptedData) as NotifyOrderInfo

    const { out_trade_no, transaction_id, trade_state } = orderInfo

    // Sprint 26: 仅处理 SUCCESS 状态，其他状态（REFUND / NOTPAY / CLOSED 等）直接 ACK
    if (trade_state === 'SUCCESS') {
      const orderType = getOrderType(out_trade_no || '')
      if (!orderType) {
        logger.error('paymentNotify', { msg: `未知订单类型: ${out_trade_no}` })
        return httpResponse(200, 'SUCCESS', 'OK')
      }

      const collection = ORDER_TYPE_COLLECTION[orderType]
      const orderRes = await db.collection(collection).where({ outTradeNo: out_trade_no }).limit(1).get()
      const list = (orderRes && (orderRes as { data?: NotifyOrderDoc[] }).data) || []

      if (list.length > 0) {
        const existingOrder = list[0]

        // 幂等：已 paid 直接返回
        if (existingOrder.paymentStatus === 'paid') {
          return httpResponse(200, 'SUCCESS', 'OK')
        }

        const paidSuccess = await applyPaidStatus(orderType, existingOrder, transaction_id)
        // 仅当支付状态同步成功后才触发佣金记录，避免为未确认的订单创建佣金
        if (paidSuccess) {
          await triggerCommission(orderType, existingOrder)
          // H2: feeding 订单支付成功后核销优惠券（mall/tuan 由前端调用 useCoupon）
          if (orderType === 'feeding') {
            await triggerFeedingCouponUse(existingOrder)
          }
        }
      } else {
        logger.warn('paymentNotify: 未找到订单', { outTradeNo: out_trade_no, orderType, serial })
      }
    } else {
      logger.info('paymentNotify: trade_state 非 SUCCESS', { outTradeNo: out_trade_no, trade_state, serial })
    }

    return httpResponse(200, 'SUCCESS', 'OK')
  } catch (error: unknown) {
    // 参数校验阶段的 BusinessError（PAYMENT_NOTIFY_INVALID）映射为 401
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'PAYMENT_NOTIFY_INVALID') {
      const msg = (error as { message?: string }).message || '回调无效'
      logger.warn('paymentNotify: 回调无效', { msg })
      return httpResponse(401, 'FAIL', msg)
    }
    const errMsg = error instanceof Error ? error.message : '内部错误'
    logger.error('paymentNotify', { msg: errMsg })
    return httpResponse(500, 'FAIL', errMsg)
  }
}

// =====================================================================
// 默认导出（保持 CommonJS 兼容）
// =====================================================================

export default { paymentNotify }
