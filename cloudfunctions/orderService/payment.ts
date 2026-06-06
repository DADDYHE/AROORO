/**
 * orderService/payment.ts - 旧版支付实现（TypeScript 源文件 - Sprint 29 迁移）
 *
 * @deprecated 此文件为旧版支付实现，请使用 paymentService 云函数。
 *   新版支付入口: cloudfunctions/paymentService/services/pay.js
 *   保留此文件仅为向后兼容，请勿新增调用。
 *
 * 业务功能（2 个 handler）：
 *   1. wechatPay          微信支付下单（旧版）
 *   2. wechatPayNotify    微信支付回调（旧版）
 *
 * 关键设计：
 *   - 鉴权：wechatPay 需 auth，wechatPayNotify 不需（由 index.js 判定）
 *   - 错误：使用 err() 工厂（参数校验），withErrorHandling 包装（统一响应）
 *   - 业务错误：isBusinessError 类型守卫（替代裸字符串 e.code === 'X'）
 *   - wechatPayNotify 返回原始 HTTP 响应（statusCode + body）
 *   - wechatPay 返回 ApiResponse（标准 handler 响应）
 *
 * 迁移目标：
 *   - 强类型化 2 个 handler 的 event / context / auth
 *   - 强类型化微信支付配置、请求体、响应（避免拼写错误）
 *   - 编译产物（payment.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 *
 * 后续计划：
 *   - Sprint 30: 移除旧版 payment.js（在新版 paymentService 完全替代后）
 *   - 现阶段保留 .js 是为了与 orderService/index.js 兼容
 */

// Sprint 29 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/orderService/payment.js）
//   - 对 .js 文件（utils / errors / config / logger）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - handler 在 module.exports 时统一用 withErrorHandling 包装

import { initCloud, handleSuccess, handleError, ERROR_CODES } from '../common/utils'
import { createLogger, type ServiceLogger } from '../common/logger'
import type { CloudBaseDB, ApiResponse, Logger } from '../common/types'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, withErrorHandling } = require('./common/errors')

// =====================================================================
// 类型定义
// =====================================================================

/** 通用 handler 签名（event / context / auth） */
type AuthLike = { openid?: string, [k: string]: unknown }
type EventLike = Record<string, unknown>
type ContextLike = Record<string, unknown>
type HandlerResult = Promise<ApiResponse<unknown> | unknown>
type NotifyHttpResponse = { statusCode: number, body: string }

/** 微信支付配置 */
interface WechatPayConfig {
  appId: string
  mchId: string
  serialNo: string
  privateKey: string
  notifyUrl: string
  certificate?: string
  apiV3Key?: string
}

/** 微信支付下单请求体（v3 jsapi） */
interface WechatPayJsapiRequest {
  appid: string
  mchid: string
  description: string
  out_trade_no: string
  notify_url: string
  amount: { total: number, currency: string }
  payer: { openid: string }
}

/** 微信支付下单响应 */
interface WechatPayJsapiResponse {
  prepay_id?: string
  [k: string]: unknown
}

/** 微信支付回调 headers */
interface WechatPayNotifyHeaders {
  'Wechatpay-Signature'?: string
  'wechatpay-signature'?: string
  'Wechatpay-Timestamp'?: string
  'wechatpay-timestamp'?: string
  'Wechatpay-Nonce'?: string
  'wechatpay-nonce'?: string
  [k: string]: string | undefined
}

/** 微信支付回调 body */
interface WechatPayNotifyBody {
  resource?: {
    ciphertext?: string
    associated_data?: string
    nonce?: string
  }
  [k: string]: unknown
}

/** 微信支付回调 - 解密后的订单信息 */
interface WechatPayOrderInfo {
  out_trade_no: string
  transaction_id: string
  trade_state: string
  [k: string]: unknown
}

/** 微信支付统一下单 - 返回给客户端的参数 */
interface WechatPayClientParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}

/** 微信支付下单 - 返回给客户端的完整数据 */
interface WechatPayClientData {
  orderId: string
  outTradeNo: string
  paymentParams: WechatPayClientParams
}

/** httpsRequest 选项 */
interface HttpsRequestOptions {
  hostname: string
  port: number
  path: string
  method: string
  headers: Record<string, string | number>
}

// =====================================================================
// 模块初始化
// =====================================================================

const { db } = initCloud() as { cloud: unknown, db: CloudBaseDB }
const _ = (db as CloudBaseDB & { command: unknown }).command
const logger: ServiceLogger = createLogger('orderService')

// =====================================================================
// 内部辅助
// =====================================================================

/** 生成指定长度的随机字符串（用于 nonce / outTradeNo） */
function randomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto')
  const bytes = crypto.randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(bytes[i] % chars.length)
  }
  return result
}

/** RSA-SHA256 签名（用于微信支付 v3） */
function rsaSign(privateKey: string, data: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto')
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(data)
  sign.end()
  return sign.sign(privateKey, 'base64')
}

/** HTTPS POST 请求（用于调用微信支付 v3 API） */
function httpsRequest(url: string, data: unknown, authorization: string): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const https = require('https') as typeof import('https')
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options: HttpsRequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
        'User-Agent': 'WeChat-Mini-Program-Pay',
        'Content-Length': Buffer.byteLength(JSON.stringify(data)),
      },
    }

    const req = https.request(options, res => {
      let chunks = ''
      res.on('data', chunk => { chunks += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(chunks || '{}')
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json)
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`))
          }
        } catch (e) {
          reject(new Error(`解析响应失败：${chunks}`))
        }
      })
    })

    req.on('error', reject)
    req.write(JSON.stringify(data))
    req.end()
  })
}

/** 生成微信支付 v3 鉴权头 */
function generateAuthorization(
  method: string,
  path: string,
  body: string,
  mchId: string,
  serialNo: string,
  privateKey: string,
): string {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = randomString(32)
  const message = `${[method, path, timestamp, nonceStr, body].join('\n')}\n`
  const signature = rsaSign(privateKey, message)
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`
}

/** AES-256-GCM 解密（用于微信支付回调） */
function decryptAes256Gcm(data: string, key: string, nonce: string, associatedData: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto')
  const ciphertext = Buffer.from(data, 'base64')
  const keyBuffer = Buffer.from(key, 'utf8')
  const nonceBuffer = Buffer.from(nonce, 'utf8')
  const authTag = ciphertext.slice(ciphertext.length - 16)
  const actualCiphertext = ciphertext.slice(0, ciphertext.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonceBuffer, { authTagLength: 16 })
  decipher.setAuthTag(authTag)
  decipher.setAAD(Buffer.from(associatedData))

  let decrypted = decipher.update(actualCiphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}

// =====================================================================
// Handler 实现
// =====================================================================

/**
 * 1. wechatPay - 微信支付下单（旧版）
 * @deprecated 请使用 paymentService 云函数
 */
export async function wechatPay(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const { openid } = auth as { openid: string }
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId, amount } = event as { orderId?: string, amount?: number }
  if (!orderId || !amount || amount <= 0) {
    throw err('INVALID_PARAMS', '订单信息不完整')
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WECHAT_PAY } = require('./common/config') as { WECHAT_PAY: WechatPayConfig }
    const config: WechatPayConfig = {
      appId: WECHAT_PAY.appId,
      mchId: WECHAT_PAY.mchId,
      serialNo: WECHAT_PAY.serialNo,
      privateKey: WECHAT_PAY.privateKey,
      notifyUrl: WECHAT_PAY.notifyUrl,
    }

    if (!config.mchId || !config.privateKey) {
      throw err('BUSINESS_ERROR', '微信支付未配置')
    }

    const outTradeNo = `ORDER_${Date.now()}_${randomString(6).toUpperCase()}`

    const requestBody: WechatPayJsapiRequest = {
      appid: config.appId,
      mchid: config.mchId,
      description: '宠物寄养订单',
      out_trade_no: outTradeNo,
      notify_url: config.notifyUrl,
      amount: { total: amount, currency: 'CNY' },
      payer: { openid },
    }

    const authorization = generateAuthorization(
      'POST', '/v3/pay/transactions/jsapi',
      JSON.stringify(requestBody), config.mchId, config.serialNo, config.privateKey
    )

    const payResult = await httpsRequest(
      'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi',
      requestBody, authorization
    ) as WechatPayJsapiResponse

    if (!payResult.prepay_id) {
      throw err('BUSINESS_ERROR', '获取支付参数失败')
    }

    await db.collection('orders').doc(orderId).update({
      data: { outTradeNo, updatedAt: db.serverDate() },
    })

    const timeStamp = String(Math.floor(Date.now() / 1000))
    const nonceStr = randomString(32)
    const packageStr = `prepay_id=${payResult.prepay_id}`
    const payMessage = `${[config.appId, timeStamp, nonceStr, packageStr].join('\n')}\n`
    const paySign = rsaSign(config.privateKey, payMessage)

    const clientData: WechatPayClientData = {
      orderId,
      outTradeNo,
      paymentParams: { timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign },
    }
    return handleSuccess(clientData, '获取支付参数成功')
  } catch (error: unknown) {
    if (isBusinessError(error)) {
      return handleError(error as Error, '支付下单失败', ERROR_CODES.BUSINESS)
    }
    logger.error('wechatPay', { msg: (error as Error)?.message })
    return handleError(error as Error, '支付下单失败', ERROR_CODES.BUSINESS)
  }
}

/**
 * 2. wechatPayNotify - 微信支付回调（旧版）
 *
 * 注意：此 handler 返回原始 HTTP 响应（statusCode + body），
 *       而非 ApiResponse。原因：微信支付回调需要返回特定的状态码和 body。
 *
 * @deprecated 请使用 paymentService 云函数
 */
export async function wechatPayNotify(event: EventLike): Promise<NotifyHttpResponse> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WECHAT_PAY } = require('./common/config') as { WECHAT_PAY: WechatPayConfig }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto')

  // Sprint 29: 强类型化 transaction 对象
  const tx = db as unknown as { startTransaction: () => Transaction }
  const transaction = tx.startTransaction()
  try {
    const headers = (event.headers || {}) as WechatPayNotifyHeaders
    const signature = headers['Wechatpay-Signature'] || headers['wechatpay-signature']
    const timestamp = headers['Wechatpay-Timestamp'] || headers['wechatpay-timestamp']
    const nonce = headers['Wechatpay-Nonce'] || headers['wechatpay-nonce']

    if (!signature || !timestamp || !nonce) {
      await transaction.rollback()
      return {
        statusCode: 401,
        body: JSON.stringify({ code: 'FAIL', message: '缺少签名头信息' }),
      }
    }

    const rawBody = event.body
    const body: WechatPayNotifyBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : (rawBody || {})
    const resource = body.resource || {}
    const ciphertext = resource.ciphertext
    const associatedData = resource.associated_data
    const resourceNonce = resource.nonce

    if (!ciphertext) {
      await transaction.rollback()
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 'FAIL', message: '回调数据缺少 ciphertext' }),
      }
    }

    const wechatpayCertificate = WECHAT_PAY.certificate
    if (!wechatpayCertificate) {
      await transaction.rollback()
      return {
        statusCode: 500,
        body: JSON.stringify({ code: 'FAIL', message: '未配置微信支付平台证书，无法验证签名' }),
      }
    }

    const message = `${timestamp}\n${nonce}\n${JSON.stringify(body)}\n`
    const publicKey = crypto.createPublicKey(wechatpayCertificate)
    const verify = crypto.createVerify('SHA256withRSA')
    verify.update(message)
    verify.end()
    const isValid = verify.verify(publicKey, Buffer.from(signature, 'base64'))
    if (!isValid) {
      await transaction.rollback()
      return {
        statusCode: 401,
        body: JSON.stringify({ code: 'FAIL', message: '签名验证失败' }),
      }
    }

    const apiV3Key = WECHAT_PAY.apiV3Key
    if (!apiV3Key) {
      await transaction.rollback()
      return {
        statusCode: 500,
        body: JSON.stringify({ code: 'FAIL', message: '未配置微信支付API V3密钥' }),
      }
    }

    const decryptedData = decryptAes256Gcm(ciphertext, apiV3Key, resourceNonce || '', associatedData || '')
    const orderInfo = JSON.parse(decryptedData) as WechatPayOrderInfo

    const { out_trade_no, transaction_id, trade_state } = orderInfo

    if (trade_state === 'SUCCESS') {
      const txCol = transaction as unknown as { collection: (name: string) => TransactionCollection }
      const orderRes = await txCol.collection('orders').where({ outTradeNo: out_trade_no }).limit(1).get()
      if (orderRes.data && orderRes.data.length > 0) {
        const existingOrder = orderRes.data[0] as { _id: string, paymentStatus?: string }

        if (existingOrder.paymentStatus === 'paid') {
          await transaction.rollback()
          return {
            statusCode: 200,
            body: JSON.stringify({ code: 'SUCCESS', message: 'OK' }),
          }
        }

        await txCol.collection('orders').doc(existingOrder._id).update({
          data: {
            status: 'paid',
            paymentStatus: 'paid',
            transactionId: transaction_id,
            paidAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })
      }
    }

    await transaction.commit()
    return {
      statusCode: 200,
      body: JSON.stringify({ code: 'SUCCESS', message: 'OK' }),
    }
  } catch (error: unknown) {
    logger.error('wechatPayNotify', { msg: (error as Error)?.message })
    await transaction.rollback()
    return {
      statusCode: 500,
      body: JSON.stringify({ code: 'FAIL', message: (error as Error)?.message || 'internal error' }),
    }
  }
}

// =====================================================================
// 内部类型（交易相关）
// =====================================================================

interface Transaction {
  rollback(): Promise<void>
  commit(): Promise<void>
  collection(name: string): TransactionCollection
}

interface TransactionCollection {
  where(query: Record<string, unknown>): TransactionCollection
  limit(n: number): TransactionCollection
  doc(id: string): TransactionDoc
  get(): Promise<{ data: Array<Record<string, unknown>> }>
}

interface TransactionDoc {
  update(opts: { data: Record<string, unknown> }): Promise<unknown>
}

// =====================================================================
// 默认导出（保持 CommonJS 兼容：module.exports = { handler: withErrorHandling(...) }）
// =====================================================================

/** wechatPayNotify 返回原始 HTTP 响应，不通过 withErrorHandling 包装（保留原始 statusCode） */
const _handlers = {
  wechatPay: withErrorHandling(wechatPay),
  wechatPayNotify,
}

// Runtime shim: 把 module.exports 指向包装后的 handlers
// (兼容原 CommonJS 模式 `module.exports = { ... }`，
//  避免消费方需用 .default 才能取到包装后的 handler)
// index.js 使用 `require('./payment').wechatPay`，因此需要这个 shim。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = _handlers
// 同步设置 default 以保持 ESM 互操作
;(_handlers as Record<string, unknown>).default = _handlers

export default _handlers
