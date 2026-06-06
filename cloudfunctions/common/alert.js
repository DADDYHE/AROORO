/**
 * 关键错误告警通道（Sprint 10 新增）
 *
 * 目标：
 *   - 关键错误码（PAYMENT_AMOUNT_MISMATCH / REFUND_FAILED / DB_ERROR 等）触发后
 *     异步发送告警到飞书/企微 webhook
 *   - 不阻塞主流程（fire-and-forget）
 *   - 同一错误码同一 key 在告警时间窗口内去重（避免告警风暴）
 *
 * 配置（通过环境变量）：
 *   ALERT_WEBHOOK_URL       飞书/企微机器人 URL
 *   ALERT_WEBHOOK_TIMEOUT   超时毫秒数（默认 5000）
 *   ALERT_DEDUPE_WINDOW_MS  同 key 去重窗口（默认 60s）
 *   ALERT_DISABLE=1         关闭告警（CI 环境）
 *
 * 用法：
 *   const alert = require('./common/alert')
 *
 *   try {
 *     await refund()
 *   } catch (e) {
 *     alert.notify('REFUND_FAILED', { orderId, reason: e.message })
 *     throw e
 *   }
 *
 * 配套：
 *   - errors.js：所有 err(code, ...) 在 _severity=SEVERE 的错误应触发 alert
 *   - 测试：jest.mock('https') / fetch mock
 */

const SEVERE_CODES = new Set([
  'PAYMENT_AMOUNT_MISMATCH',
  'PAYMENT_CREATE_FAILED',
  'PAYMENT_NOTIFY_INVALID',
  'REFUND_FAILED',
  'DB_ERROR',
  'DATA_ERROR',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'WECHAT_API_ERROR',
  'DECRYPT_FAILED',
  'ENCRYPT_FAILED',
])

const _dedupeMap = new Map() // key -> lastSentAt
const _stats = { sent: 0, deduped: 0, failed: 0 }

/**
 * 判定一个错误码是否需要告警
 * @param {string} code
 * @returns {boolean}
 */
function isAlertable(code) {
  return SEVERE_CODES.has(code)
}

/**
 * 构造去重 key
 * @param {string} code
 * @param {object} context
 * @returns {string}
 */
function buildDedupeKey(code, context) {
  // 优先用业务 ID（orderId / outTradeNo），其次用 message hash
  const ctx = context || {}
  const idPart = ctx.orderId || ctx.outTradeNo || ctx.userId || ctx.openid
  if (idPart) {return `${code}:${idPart}`}
  // 没有业务 ID 时只用 code（会高频去重）
  return code
}

/**
 * 发送告警（fire-and-forget）
 *
 * @param {string} code - 错误码
 * @param {object} [context] - 业务上下文
 * @returns {Promise<{sent: boolean, deduped: boolean, reason?: string}>}
 */
async function notify(code, context = {}) {
  if (process.env.ALERT_DISABLE === '1') {return { sent: false, deduped: false, reason: 'disabled' }}
  if (!isAlertable(code)) {return { sent: false, deduped: false, reason: 'not_alertable' }}
  if (!process.env.ALERT_WEBHOOK_URL) {return { sent: false, deduped: false, reason: 'no_webhook' }}

  // 去重窗口
  const windowMs = Number(process.env.ALERT_DEDUPE_WINDOW_MS) || 60_000
  const dedupeKey = buildDedupeKey(code, context)
  const now = Date.now()
  const lastSent = _dedupeMap.get(dedupeKey) || 0
  if (now - lastSent < windowMs) {
    _stats.deduped += 1
    return { sent: false, deduped: true, reason: 'in_window' }
  }
  _dedupeMap.set(dedupeKey, now)

  // 构造消息体（飞书/企微通用）
  const payload = {
    msg_type: 'text',
    content: {
      text: formatMessage(code, context),
    },
  }

  // 异步发送，错误吞掉
  try {
    await sendWebhook(payload)
    _stats.sent += 1
    return { sent: true, deduped: false }
  } catch (e) {
    _stats.failed += 1
    return { sent: false, deduped: false, reason: e.message }
  }
}

/**
 * 构造可读告警文本
 * @param {string} code
 * @param {object} context
 * @returns {string}
 */
function formatMessage(code, context) {
  const ctx = context || {}
  const lines = [
    `🚨 [AROORO] 关键错误 ${code}`,
    `时间: ${new Date().toISOString()}`,
  ]
  if (ctx.orderId) {lines.push(`订单: ${ctx.orderId}`)}
  if (ctx.outTradeNo) {lines.push(`商户单号: ${ctx.outTradeNo}`)}
  if (ctx.userId || ctx.openid) {lines.push(`用户: ${ctx.userId || ctx.openid}`)}
  if (ctx.service) {lines.push(`服务: ${ctx.service}`)}
  if (ctx.action) {lines.push(`操作: ${ctx.action}`)}
  if (ctx.amount !== undefined) {lines.push(`金额: ${ctx.amount}`)}
  if (ctx.reason) {lines.push(`原因: ${ctx.reason}`)}
  if (ctx.stack) {lines.push(`Stack: ${String(ctx.stack).split('\n').slice(0, 3).join(' | ')}`)}
  return lines.join('\n')
}

/**
 * 发送 HTTP POST（不依赖 fetch 以兼容旧版 Node）
 * @param {object} payload
 * @returns {Promise<void>}
 */
function sendWebhook(payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(process.env.ALERT_WEBHOOK_URL)
    const body = JSON.stringify(payload)
    const useHttps = url.protocol === 'https:'
    const lib = useHttps ? require('https') : require('http')
    const opts = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (useHttps ? 443 : 80),
      path: url.pathname + (url.search || ''),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: Number(process.env.ALERT_WEBHOOK_TIMEOUT) || 5000,
    }
    const req = lib.request(opts, res => {
      res.on('data', () => {}) // 丢弃
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {resolve()} else {reject(new Error(`webhook status ${res.statusCode}`))}
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {req.destroy(new Error('webhook timeout'))})
    req.write(body)
    req.end()
  })
}

/**
 * 错误处理装饰器增强版：发生 SEVERE 错误时自动告警
 *
 * 用法：
 *   const { withErrorHandling } = require('./common/errors')
 *   const { alertOnError } = require('./common/alert')
 *
 *   const myHandler = withErrorHandling(alertOnError('paymentService')(async (event) => {
 *     // ... 业务逻辑
 *   }))
 *
 * @param {string} service - 服务名（用于告警 context）
 * @returns {function} 装饰器工厂
 */
function alertOnError(service) {
  return function (handler) {
    return async function wrapped(event, context, auth) {
      try {
        return await handler(event, context, auth)
      } catch (e) {
        const code = e && e.code
        if (code && isAlertable(code)) {
          // fire-and-forget
          notify(code, {
            service,
            action: event && event.action,
            orderId: event && event.orderId,
            outTradeNo: event && event.outTradeNo,
            userId: (auth && auth.openid) || (event && event.openid),
            amount: event && (event.totalPrice || event.refundAmount),
            reason: e.message,
            stack: e.stack,
          }).catch(() => {})
        }
        throw e
      }
    }
  }
}

/**
 * 测试用：重置内部状态
 */
function _reset() {
  _dedupeMap.clear()
  _stats.sent = 0
  _stats.deduped = 0
  _stats.failed = 0
}

function _getStats() {
  return { ..._stats }
}

module.exports = {
  isAlertable,
  notify,
  alertOnError,
  formatMessage,
  buildDedupeKey,
  SEVERE_CODES,
  _reset,
  _getStats,
}
