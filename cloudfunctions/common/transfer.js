/**
 * transfer.js - 微信商家转账到零钱 API 对接（新版 APIv3）
 *
 * 功能：调用微信支付 APIv3「商家转账到零钱」升级版，将资金从商户运营账户
 *       转账至用户微信零钱。
 *
 * 新版特性（2025-01-15 上线）：
 *   - 用户确认收款模式：创建转账后返回 package_info，由小程序端
 *     调用 wx.requestMerchantTransfer 拉起用户确认收款页面
 *   - 转账场景报备：需传入 transfer_scene_report_infos 描述转账背景
 *
 * API 端点：
 *   - 发起转账：POST /v3/fund-app/mch-transfer/transfer-bills
 *   - 商户单号查询：GET /v3/fund-app/mch-transfer/transfer-bills/out-bill-no/{out_bill_no}
 *   - 撤销转账：POST /v3/fund-app/mch-transfer/transfer-bills/out-bill-no/{out_bill_no}/cancel
 *
 * 依赖：
 *   - common/config.js  → WECHAT_PAY（mchId, appId, serialNo, privateKey, transferSceneId）
 *   - common/crypto.js  → randomString
 *   - Node.js crypto    → SHA256withRSA 签名
 */

const crypto = require('crypto')
const https = require('https')
const { WECHAT_PAY, ENDPOINTS } = require('./config')
const { randomString } = require('./crypto')
const { createLogger } = require('./logger')

const logger = createLogger('transfer')

// 微信 APIv3 要求请求头必须携带 Accept 与 User-Agent（缺任一返回 400）
const DEFAULT_USER_AGENT = WECHAT_PAY.appId || 'arooro-wechat-pay'

/**
 * 微信 APIv3 签名随机串：仅允许字母/数字（base64url 含 -/_ 会被判定格式错误），
 * 用 32 位十六进制（与官方示例一致）
 */
function randomNonceStr() {
  return crypto.randomBytes(16).toString('hex')
}

/**
 * 获取当前云函数出口 IP（用于微信商家转账“接口安全”IP 白名单配置）
 * 仅在与微信通信失败且疑似 IP 拦截时调用；失败返回空串不影响主流程
 */
function fetchEgressIp() {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org', { timeout: 5000 }, (res) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { buf += chunk })
      res.on('end', () => { resolve(buf.trim() || '') })
    })
    req.on('error', () => resolve(''))
    req.on('timeout', () => { req.destroy(); resolve('') })
  })
}

// 新版 API 端点
const TRANSFER_API = '/v3/fund-app/mch-transfer/transfer-bills'
const QUERY_BY_OUT_BILL_API = '/v3/fund-app/mch-transfer/transfer-bills/out-bill-no'
const CANCEL_API = '/v3/fund-app/mch-transfer/transfer-bills/out-bill-no'

// 单据状态常量
const BILL_STATE = {
  ACCEPTED: 'ACCEPTED',                   // 转账已受理，可原单重试（非终态）
  PROCESSING: 'PROCESSING',               // 转账锁定资金中（非终态）
  WAIT_USER_CONFIRM: 'WAIT_USER_CONFIRM', // 待收款用户确认（非终态）
  TRANSFERING: 'TRANSFERING',             // 转账中（非终态）
  SUCCESS: 'SUCCESS',                     // 转账成功（终态）
  FAIL: 'FAIL',                           // 转账失败（终态）
  CANCELING: 'CANCELING',                 // 转账撤销中（非终态）
  CANCELLED: 'CANCELLED',                 // 转账撤销完成（终态）
}

/**
 * 私钥格式归一化
 *
 * 环境变量中的私钥可能存在多种格式问题（\n 字面字符、缺少 PEM 头尾、
 * PKCS#1/PKCS#8 头不匹配等），直接传给 sign.sign() 会抛出
 * error:1E08010C:DECODER routines::unsupported。
 *
 * 与 paymentService/services/wechatPayUtils.js 保持一致的兜底策略，
 * 依次尝试多种格式直至签名成功。
 */
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

/**
 * 把单行 PEM（头/体/尾挤在一行，控制台粘贴常见）还原为标准多行 PEM：
 *   -----BEGIN PRIVATE KEY-----\n<base64 每行64字符>\n-----END PRIVATE KEY-----
 */
function reflowPemSingleLine(s) {
  const m = String(s).match(/^(-----BEGIN [^-]+-----)\s*(.*?)\s*(-----END [^-]+-----)$/s)
  if (!m) {return s}
  const body = m[2].replace(/\s+/g, '')
  if (!body) {return s}
  const lines = []
  for (let i = 0; i < body.length; i += 64) {
    lines.push(body.slice(i, i + 64))
  }
  return [m[1], ...lines, m[3]].join('\n')
}

function normalizePrivateKey(key) {
  if (!key) {return ''}
  // 兼容从控制台粘贴时带入的首尾引号（如 "-----BEGIN PRIVATE KEY-----\n..."）
  // 以及单行 PEM（头/体/尾无换行）——先还原为标准多行再解析
  const trimmed = reflowPemSingleLine(String(key).trim().replace(/^["']+|["']+$/g, ''))
  if (_cachedKeyFormat) {return _tryFormatKey(trimmed, _cachedKeyFormat)}

  if (trimmed.includes('-----BEGIN')) {
    try {
      const sign = crypto.createSign('RSA-SHA256')
      sign.update('test')
      sign.end()
      sign.sign(trimmed, 'base64')
      _cachedKeyFormat = 'raw'
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

  logger.error('all key formats failed, using raw value')
  return trimmed
}

/**
 * 私钥诊断信息（不含密钥内容，仅用于定位配置问题）
 */
function describePrivateKey(key) {
  const s = String(key || '').trim().replace(/^["']+|["']+$/g, '')
  const firstLine = (s.split('\n')[0] || '').trim()
  const header = /^-----BEGIN [^-]+-----/.test(firstLine) ? firstLine : '(无PEM头)'
  return {
    header,
    length: s.length,
    lines: s.split('\n').length,
    hasLiteralBackslashN: s.includes('\\n'),
    looksBase64: /^[A-Za-z0-9+/=\s]+$/.test(s.replace(/\\n/g, '').trim()),
    isCertificate: s.includes('BEGIN CERTIFICATE'),
    isEncryptedKey: s.includes('BEGIN ENCRYPTED PRIVATE KEY'),
    isRsaHeader: s.includes('BEGIN RSA PRIVATE KEY'),
    isPkcs8Header: s.includes('BEGIN PRIVATE KEY'),
  }
}

/**
 * 发起商家转账（新版用户确认收款模式）
 *
 * 创建转账单后，转账单进入 WAIT_USER_CONFIRM 状态，
 * 接口返回 package_info 用于小程序端拉起用户确认收款页面。
 *
 * @param {string} openid     - 收款用户 openid
 * @param {number} amount     - 转账金额（元）
 * @param {string} outBillNo  - 商户侧唯一转账单号
 * @param {string} remark     - 转账备注（用户可见）
 * @returns {Promise<{out_bill_no: string, transfer_bill_no: string, state: string, package_info: string}>}
 */
async function initiateTransfer(openid, amount, outBillNo, remark) {
  const { mchId, appId, serialNo, privateKey, transferSceneId, notifyUrl } = WECHAT_PAY

  if (!mchId || !serialNo || !privateKey || !appId) {
    throw new Error('微信支付配置不完整，无法发起转账')
  }

  if (!openid || typeof openid !== 'string') {
    throw new Error('openid 不能为空')
  }

  const amountInFen = Math.round(Number(amount) * 100)
  if (amountInFen < 30) {
    throw new Error('转账金额不能低于 0.3 元')
  }

  // 佣金报酬场景报备信息
  const body = {
    appid: appId,
    out_bill_no: outBillNo,
    transfer_scene_id: transferSceneId || '1000',
    openid,
    transfer_amount: amountInFen,
    transfer_remark: remark || '合作伙伴提现',
    user_recv_perception: '劳务报酬',
    transfer_scene_report_infos: [
      {
        info_type: '岗位类型',
        info_content: '合作伙伴',
      },
      {
        info_type: '报酬说明',
        info_content: remark || '分销佣金提现',
      },
    ],
  }

  // notify_url 可选，配置了才传
  if (notifyUrl) {
    body.notify_url = notifyUrl
  }

  const bodyStr = JSON.stringify(body)
  const url = TRANSFER_API
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = randomNonceStr()

  const signature = signRequest('POST', url, timestamp, nonceStr, bodyStr, privateKey)

  const authorization = buildAuthorization(mchId, nonceStr, timestamp, serialNo, signature)

  const apiBase = ENDPOINTS.WECHAT_PAY_API_BASE || 'https://api.mch.weixin.qq.com'

  const result = await httpsPost(`${apiBase}${url}`, bodyStr, {
    'Content-Type': 'application/json; charset=utf-8',
    'Authorization': authorization,
    'Accept': 'application/json',
  })

  if (!result || !result.out_bill_no) {
    const errMsg = result?.message || result?.detail || JSON.stringify(result).slice(0, 200)
    throw new Error(`微信转账创建失败: ${errMsg}`)
  }

  logger.info('transfer created', {
    out_bill_no: result.out_bill_no,
    transfer_bill_no: result.transfer_bill_no,
    state: result.state,
  })

  return {
    out_bill_no: result.out_bill_no,
    transfer_bill_no: result.transfer_bill_no || '',
    state: result.state || '',
    package_info: result.package_info || '',
  }
}

/**
 * 通过商户单号查询转账单状态
 *
 * @param {string} outBillNo - 商户侧转账单号
 * @returns {Promise<{out_bill_no: string, transfer_bill_no: string, state: string, fail_reason?: string}>}
 */
async function queryTransferByOutBillNo(outBillNo) {
  const { mchId, serialNo, privateKey } = WECHAT_PAY

  if (!mchId || !serialNo || !privateKey) {
    throw new Error('微信支付配置不完整')
  }

  const url = `${QUERY_BY_OUT_BILL_API}/${encodeURIComponent(outBillNo)}`
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = randomNonceStr()

  const signature = signRequest('GET', url, timestamp, nonceStr, '', privateKey)
  const authorization = buildAuthorization(mchId, nonceStr, timestamp, serialNo, signature)

  const apiBase = ENDPOINTS.WECHAT_PAY_API_BASE || 'https://api.mch.weixin.qq.com'

  const result = await httpsGet(`${apiBase}${url}`, {
    'Authorization': authorization,
    'Accept': 'application/json',
  })

  return {
    out_bill_no: result.out_bill_no || outBillNo,
    transfer_bill_no: result.transfer_bill_no || '',
    state: result.state || '',
    fail_reason: result.fail_reason || '',
  }
}

/**
 * 撤销转账
 *
 * 在用户确认收款之前，可调用此接口撤销转账。
 * 返回成功仅表示撤销请求已受理，系统会异步处理退款，需以查询结果为准。
 *
 * @param {string} outBillNo - 商户侧转账单号
 * @returns {Promise<{state: string}>}
 */
async function cancelTransfer(outBillNo) {
  const { mchId, serialNo, privateKey } = WECHAT_PAY

  if (!mchId || !serialNo || !privateKey) {
    throw new Error('微信支付配置不完整')
  }

  const url = `${CANCEL_API}/${encodeURIComponent(outBillNo)}/cancel`
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = randomNonceStr()

  // 撤销转账 POST body 为空
  const signature = signRequest('POST', url, timestamp, nonceStr, '', privateKey)
  const authorization = buildAuthorization(mchId, nonceStr, timestamp, serialNo, signature)

  const apiBase = ENDPOINTS.WECHAT_PAY_API_BASE || 'https://api.mch.weixin.qq.com'

  const result = await httpsPost(`${apiBase}${url}`, '', {
    'Content-Type': 'application/json; charset=utf-8',
    'Authorization': authorization,
    'Accept': 'application/json',
  })

  return {
    state: result.state || '',
  }
}

/**
 * 构建 WECHATPAY2-SHA256-RSA2048 Authorization 头
 */
function buildAuthorization(mchId, nonceStr, timestamp, serialNo, signature) {
  // 微信规范：认证类型与参数之间必须有一个空格（否则返回 401 Authorization值格式错误）
  const params = [
    `mchid="${mchId}"`,
    `nonce_str="${nonceStr}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${serialNo}"`,
    `signature="${signature}"`,
  ].join(',')
  return `WECHATPAY2-SHA256-RSA2048 ${params}`
}

/**
 * APIv3 签名
 *
 * 签名串格式：
 *   HTTP方法\nURL路径\n时间戳\n随机串\n请求体\n
 *
 * 算法：SHA256withRSA
 */
function signRequest(method, url, timestamp, nonceStr, body, privateKeyPem) {
  const signStr = [method, url, timestamp, nonceStr, body, ''].join('\n')

  const normalizedKey = normalizePrivateKey(privateKeyPem)
  try {
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(signStr, 'utf8')
    sign.end()
    return sign.sign(normalizedKey, 'base64')
  } catch (e) {
    // 抛出可读诊断，后台 transferError 可直接定位（不泄露密钥内容）
    const diag = describePrivateKey(privateKeyPem)
    throw new Error(
      `微信支付私钥签名失败: ${e.message}；私钥诊断: ${JSON.stringify(diag)}。` +
      '请检查云函数环境变量 WECHAT_PRIVATE_KEY（需为 apiclient_key.pem 完整内容，' +
      '以 -----BEGIN PRIVATE KEY----- 或 -----BEGIN RSA PRIVATE KEY----- 开头）'
    )
  }
}

/**
 * HTTPS POST（返回 JSON）
 */
function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const payload = Buffer.from(body, 'utf8')
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      timeout: 15000,
      headers: {
        ...headers,
        'Content-Length': payload.length,
        'User-Agent': headers['User-Agent'] || headers['user-agent'] || DEFAULT_USER_AGENT,
      },
    }, (res) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { buf += chunk })
      res.on('end', () => {
        try {
          if (!buf) {
            // 空响应体（如撤销转账可能返回空）
            if (res.statusCode >= 400) {
              reject(new Error(`微信API错误(${res.statusCode})`))
            } else {
              resolve({})
            }
            return
          }
          const data = JSON.parse(buf)
          if (res.statusCode >= 400) {
            const errMsg = data.message || data.detail || `HTTP ${res.statusCode}`
            ;(async () => {
              let msg = `微信API错误(${res.statusCode}): ${errMsg}`
              // 商家转账要求配置请求来源 IP：被拦截时顺带返回云函数出口 IP 供白名单配置
              if (res.statusCode === 400 && /不允许调用接口|IP地址不允许/.test(errMsg)) {
                const ip = await fetchEgressIp()
                if (ip) {
                  msg += `；当前云函数出口IP: ${ip}（请在商户平台 产品中心→商家转账到零钱→接口安全 添加此IP）`
                }
              }
              reject(new Error(msg))
            })()
            return
          } else {
            resolve(data)
          }
        } catch (e) {
          reject(new Error(`微信API返回非JSON: ${buf.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('微信API请求超时')) })
    req.write(payload)
    req.end()
  })
}

/**
 * HTTPS GET（返回 JSON）
 */
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 10000,
      headers: {
        ...headers,
        'User-Agent': headers['User-Agent'] || headers['user-agent'] || DEFAULT_USER_AGENT,
      },
    }, (res) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { buf += chunk })
      res.on('end', () => {
        try {
          if (!buf) {
            if (res.statusCode >= 400) {
              reject(new Error(`微信API错误(${res.statusCode})`))
            } else {
              resolve({})
            }
            return
          }
          const data = JSON.parse(buf)
          if (res.statusCode >= 400) {
            const errMsg = data.message || data.detail || `HTTP ${res.statusCode}`
            ;(async () => {
              let msg = `微信API错误(${res.statusCode}): ${errMsg}`
              if (res.statusCode === 400 && /不允许调用接口|IP地址不允许/.test(errMsg)) {
                const ip = await fetchEgressIp()
                if (ip) {
                  msg += `；当前云函数出口IP: ${ip}（请在商户平台 产品中心→商家转账到零钱→接口安全 添加此IP）`
                }
              }
              reject(new Error(msg))
            })()
            return
          } else {
            resolve(data)
          }
        } catch (e) {
          reject(new Error(`微信API返回非JSON: ${buf.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('微信API请求超时')) })
    req.end()
  })
}

module.exports = {
  // adminService/services/refund.js 依赖此导出（退款签名前私钥归一化）
  normalizePrivateKey,
  initiateTransfer,
  queryTransferByOutBillNo,
  cancelTransfer,
  BILL_STATE,
}
