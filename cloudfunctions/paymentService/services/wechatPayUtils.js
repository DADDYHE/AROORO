const crypto = require('crypto')
const https = require('https')
const { createLogger } = require('../common/logger')

const logger = createLogger('wechatPayUtils')

function randomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(bytes[i] % chars.length)
  }
  return result
}

function _tryFormatKey(key, format) {
  let formatted = String(key).trim()
  switch (format) {
  case 'raw':
    return formatted
  case 'base64-decode':
    return Buffer.from(formatted, 'base64').toString('utf8')
  case 'literal-n':
    return formatted.replace(/\\n/g, '\n')
  case 'strip-rebuild-pkcs8':
    formatted = formatted.replace(/-----BEGIN[^-]*-----/, '')
      .replace(/-----END[^-]*-----/, '')
      .replace(/[\s\n\\n]/g, '')
    return [
      '-----BEGIN PRIVATE KEY-----',
      ...Array.from({ length: Math.ceil(formatted.length / 64) }, (_, i) => formatted.substring(i * 64, i * 64 + 64)),
      '-----END PRIVATE KEY-----',
    ].join('\n')
  case 'strip-rebuild-rsa':
    formatted = formatted.replace(/-----BEGIN[^-]*-----/, '')
      .replace(/-----END[^-]*-----/, '')
      .replace(/[\s\n\\n]/g, '')
    return [
      '-----BEGIN RSA PRIVATE KEY-----',
      ...Array.from({ length: Math.ceil(formatted.length / 64) }, (_, i) => formatted.substring(i * 64, i * 64 + 64)),
      '-----END RSA PRIVATE KEY-----',
    ].join('\n')
  default:
    return formatted
  }
}

let _cachedKeyFormat = null

function normalizePrivateKey(key) {
  if (!key) {return ''}
  if (_cachedKeyFormat) {return _tryFormatKey(key, _cachedKeyFormat)}

  const trimmed = String(key).trim()

  if (trimmed.includes('-----BEGIN')) {
    try {
      const sign = crypto.createSign('RSA-SHA256')
      sign.update('test')
      sign.end()
      sign.sign(trimmed, 'base64')
      _cachedKeyFormat = 'raw'
      logger.info('privateKey format resolved', { format: 'raw PEM' })
      return trimmed
    } catch (e) {
      logger.warn('raw PEM format test failed', { error: e?.message })
    }
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
    if (decoded.includes('-----BEGIN')) {
      const sign = crypto.createSign('RSA-SHA256')
      sign.update('test')
      sign.end()
      sign.sign(decoded, 'base64')
      _cachedKeyFormat = 'base64-decode'
      logger.info('privateKey format resolved', { format: 'base64-decode' })
      return decoded
    }
  } catch (e) {
    logger.warn('base64-decode format test failed', { error: e?.message })
  }

  const formats = ['literal-n', 'strip-rebuild-pkcs8', 'strip-rebuild-rsa']
  for (const fmt of formats) {
    try {
      const formatted = _tryFormatKey(key, fmt)
      const sign = crypto.createSign('RSA-SHA256')
      sign.update('test')
      sign.end()
      sign.sign(formatted, 'base64')
      _cachedKeyFormat = fmt
      logger.info('privateKey format resolved', { format: fmt })
      return formatted
    } catch (e) {
      continue
    }
  }

  logger.error('all key formats failed')
  return String(key).trim()
}

function rsaSign(privateKey, data) {
  const key = normalizePrivateKey(privateKey)
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(data)
  sign.end()
  return sign.sign(key, 'base64')
}

/**
 * H8: 微信 API HTTPS 请求——必须设置超时，避免 hang 导致云函数 15s 超时
 *
 * 分级超时策略（毫秒）：
 *   - GET 查询类（queryPayment/queryRefund）：5000ms——查询应快速响应
 *   - POST 下单类（createPayment）：8000ms——下单可能稍慢
 *   - POST 退款类（createRefund）：12000ms——退款涉及资金清算，给予充分时间
 *   - 默认：10000ms
 *
 * 超时后主动 destroy 连接，释放资源并 reject，调用方可重试或上抛
 *
 * L2: 响应拼接改用 Buffer.concat——避免 += 字符串的 O(n²) 性能问题
 */
const DEFAULT_HTTP_TIMEOUT_MS = 10000
const TIMEOUT_BY_METHOD = {
  GET: 5000,
  POST: 8000,
  REFUND: 12000, // createRefund 调用时通过 options.timeoutHint = 'REFUND' 传入
}

function httpsRequest(url, data, authorization, method = 'POST', options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const bodyStr = method === 'GET' ? '' : JSON.stringify(data)
    // H8: 按调用类型分级超时
    const timeoutHint = options.timeoutHint && TIMEOUT_BY_METHOD[options.timeoutHint]
    const timeoutMs = timeoutHint || DEFAULT_HTTP_TIMEOUT_MS
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
        'User-Agent': 'WeChat-Mini-Program-Pay',
      },
    }
    if (method === 'POST') {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }

    const req = https.request(reqOptions, res => {
      // L2: 用 Buffer 数组替代字符串拼接，避免大响应 O(n²)
      const chunks = []
      res.on('data', chunk => { chunks.push(Buffer.from(chunk)) })
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8')
          const json = JSON.parse(body || '{}')
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json)
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`))
          }
        } catch (e) {
          const body = Buffer.concat(chunks).toString('utf8')
          reject(new Error(`解析响应失败：${body}`))
        }
      })
    })

    // H8: 设置超时——超时后 destroy 连接，触发 'error' 事件
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`wechat_api_timeout after ${timeoutMs}ms`))
    })
    req.on('error', reject)
    if (method === 'POST') {req.write(bodyStr)}
    req.end()
  })
}

function generateAuthorization(method, path, body, mchId, serialNo, privateKey) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = randomString(32)
  const message = `${[method, path, timestamp, nonceStr, body].join('\n')}\n`
  const signature = rsaSign(privateKey, message)
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`
}

module.exports = { randomString, rsaSign, httpsRequest, generateAuthorization, _normalizePrivateKey: normalizePrivateKey }
