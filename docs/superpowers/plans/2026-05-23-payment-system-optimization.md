# 支付体系优化实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于微信支付官方文档（小程序支付 V3），修复当前支付系统的关键缺陷，补全回调链路，统一代码架构，使支付系统健壮可靠。

**Architecture:** 保持 paymentService 云函数为统一支付入口，补全 notify_url 回调链路，优化前端 PaymentService 的支付结果处理逻辑（遵循官方"回调+查单"双保险模式），清理冗余代码，统一金额校验策略。

**Tech Stack:** 微信小程序 wx.requestPayment、微信支付 V3 API（JSAPI/小程序下单）、云函数（Node.js 18.15）、云数据库

---

## 当前问题与官方规范差距

| # | 问题 | 官方规范要求 | 当前状态 |
|---|------|-------------|---------|
| 1 | notify_url 未配置 | 下单接口必传 notify_url | 环境变量为空，回调完全失效 |
| 2 | 平台证书未配置 | 回调验签必须使用平台证书 | 环境变量为空 |
| 3 | 前端支付成功后未查单 | 官方要求：前端返回"成功"或"报错"时必须调查单接口确认 | confirmPayment 是 fire-and-forget（catch 吞错） |
| 4 | 前端取消支付时未查单 | 官方要求：前端返回"用户取消"时保持未支付状态即可 | ✅ 已正确处理 |
| 5 | 缺少定时查单兜底 | 官方要求：未收到回调时应主动轮询查单 | 完全缺失 |
| 6 | 旧支付单关闭不在事务内 | 关单与下单应保证一致性 | 非事务操作 |
| 7 | 金额校验逻辑脆弱 | 不同订单类型金额字段不同，硬编码 | if/else 硬编码 |
| 8 | 私钥 Base64 编码存储 | 应直接存 PEM 格式 | 试错法兜底 |
| 9 | orderService/payment.js 冗余 | 应统一到 paymentService | 两套独立实现 |
| 10 | notify.js 中 ORDER_TYPE_PREFIX_MAP 缺少 feeding | 与 pay.js 不一致 | FD_ 前缀缺失 |
| 11 | 缺少 time_expire 参数 | 官方建议设置支付超时时间 | 未传，默认7天 |
| 12 | 缺少 attach 参数 | 可用于回传订单类型等信息 | 未使用 |

---

## 文件变更清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `cloudfunctions/paymentService/common/config.js` | 修改 | 新增 notifyUrl 默认值推导 |
| `cloudfunctions/paymentService/services/pay.js` | 修改 | 统一金额校验、添加 time_expire/attach、优化关单逻辑 |
| `cloudfunctions/paymentService/services/notify.js` | 修改 | 补全 feeding 类型、优化幂等处理 |
| `cloudfunctions/paymentService/services/wechatPayUtils.js` | 修改 | 优化私钥解析逻辑 |
| `services/PaymentService.js` | 修改 | 支付成功后同步查单确认、优化错误处理 |
| `cloudfunctions/paymentService/index.js` | 修改 | 注册 paymentNotify handler |
| `cloudfunctions/orderService/payment.js` | 标记废弃 | 添加废弃注释 |

---

### Task 1: 配置 notify_url 和平台证书

**Files:**
- Modify: `cloudfunctions/paymentService/common/config.js`

**背景：** 微信支付下单接口 `notify_url` 为必传参数。当前 `WECHAT_NOTIFY_URL` 环境变量为空，导致回调完全失效。同时 `WECHAT_PAY_CERTIFICATE`（平台证书）也为空，回调验签无法进行。

- [ ] **Step 1: 修改 config.js，添加 notifyUrl 的默认值推导**

当环境变量未配置时，基于云函数环境 ID 自动推导回调地址：

```js
const ENV_ID = process.env.ENV_ID || process.env.CLOUDBASE_ENV || ''
const APP_ID = process.env.APP_ID || process.env.WECHAT_APPID || ''
const JWT_SECRET = process.env.JWT_SECRET || ''
const IS_PRODUCTION = process.env.ENV === 'production'

const DEFAULT_NOTIFY_URL = ENV_ID
  ? `https://${ENV_ID}.ap-shanghai.tcb.qcloud.la/paymentService`
  : ''

const WECHAT_PAY = {
  appId: process.env.WECHAT_APPID || APP_ID,
  mchId: process.env.WECHAT_MCHID || '',
  serialNo: process.env.WECHAT_SERIAL_NO || '',
  privateKey: process.env.WECHAT_PRIVATE_KEY || '',
  notifyUrl: process.env.WECHAT_NOTIFY_URL || DEFAULT_NOTIFY_URL,
  certificate: process.env.WECHAT_PAY_CERTIFICATE || '',
  apiV3Key: process.env.WECHAT_API_V3_KEY || '',
}

const CLOUDBASE = {
  env: ENV_ID,
  appid: APP_ID,
  secret: process.env.CLOUDBASE_SECRET || '',
  baseUrl: process.env.CLOUDBASE_BASE_URL || 'https://api.tcloudbasegateway.com/v1/',
  apiKey: process.env.CLOUDBASE_API_KEY || '',
}

module.exports = {
  ENV_ID,
  APP_ID,
  JWT_SECRET,
  IS_PRODUCTION,
  WECHAT_PAY,
  CLOUDBASE,
}
```

- [ ] **Step 2: 通过云函数管理工具设置环境变量 WECHAT_NOTIFY_URL**

需要用户在微信商户平台确认回调地址格式。CloudBase 云函数的 HTTP 触发地址通常为：
- `https://{envId}.service.tcloudbase.com/paymentService`

或者使用云接入网关地址。需要与用户确认正确的回调 URL。

- [ ] **Step 3: 下载并配置微信支付平台证书**

从微信商户平台 → API安全 → 平台证书，下载证书并设置为 `WECHAT_PAY_CERTIFICATE` 环境变量。

---

### Task 2: 注册 paymentNotify handler

**Files:**
- Modify: `cloudfunctions/paymentService/index.js`

**背景：** 当前 index.js 中 handlers 只包含了 payHandlers 和 refundHandlers，但 `paymentNotify` 定义在 `notify.js` 中，未被注册到 handlers。虽然 `NO_AUTH_ACTIONS` 中包含了 `paymentNotify`，但实际调用时会因为 handler 不存在而返回"未知操作"。

- [ ] **Step 1: 修改 index.js，注册 notify handler**

```js
const { handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')

const payHandlers = require('./services/pay')
const refundHandlers = require('./services/refund')
const notifyHandlers = require('./services/notify')

const handlers = {
  ...payHandlers,
  ...refundHandlers,
  ...notifyHandlers,
}

const NO_AUTH_ACTIONS = ['paymentNotify']

const logger = createLogger('paymentService')

exports.main = async (event, context) => {
  const { action } = event
  if (!action || !handlers[action]) {
    return handleError(new Error(`未知操作: ${action}`), '无效的操作类型', ERROR_CODES.VALIDATION)
  }

  try {
    const requireLogin = !NO_AUTH_ACTIONS.includes(action)
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth?.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}
```

---

### Task 3: 修复 notify.js 中缺失的 feeding 类型

**Files:**
- Modify: `cloudfunctions/paymentService/services/notify.js`

**背景：** `notify.js` 中的 `ORDER_TYPE_PREFIX_MAP` 缺少 `FD_`（feeding）前缀，且 `ORDER_TYPE_COLLECTION` 缺少 `feeding` 映射。导致喂养订单的支付回调无法正确处理。

- [ ] **Step 1: 修改 notify.js 中的映射表，与 pay.js 保持一致**

```js
const ORDER_TYPE_PREFIX_MAP = {
  ORDER_: 'order',
  MALL_: 'mall',
  TUAN_: 'tuan',
  ACT_: 'activity',
  FD_: 'feeding',
}

const ORDER_TYPE_COLLECTION = {
  order: 'orders',
  mall: 'orders',
  tuan: 'orders',
  activity: 'activity_registrations',
  feeding: 'feedingOrders',
}
```

- [ ] **Step 2: 在 paymentNotify 的状态更新逻辑中添加 feeding 类型处理**

在 `if (trade_state === 'SUCCESS')` 分支中，在 `else if (orderType === 'activity')` 之后添加：

```js
} else if (orderType === 'feeding') {
  updateData.status = 'confirmed'
}
```

---

### Task 4: 优化 pay.js — 统一金额校验、添加 time_expire/attach

**Files:**
- Modify: `cloudfunctions/paymentService/services/pay.js`

**背景：**
1. 金额校验逻辑因订单类型而异，硬编码 if/else
2. 缺少 `time_expire` 参数（官方建议设置支付超时）
3. 缺少 `attach` 参数（可用于回传订单类型，回调时原样返回）

- [ ] **Step 1: 添加金额字段映射配置，替代硬编码 if/else**

在文件顶部常量区域添加：

```js
const ORDER_TYPE_AMOUNT_FIELD = {
  order: 'totalPrice',
  mall: 'totalPrice',
  tuan: 'totalPrice',
  activity: 'finalAmount',
  feeding: 'totalPrice',
}
```

- [ ] **Step 2: 替换金额校验逻辑**

将原来的 if/else 替换为统一逻辑：

```js
    let actualAmount = 0
    try {
      const amountField = ORDER_TYPE_AMOUNT_FIELD[type] || 'totalPrice'
      actualAmount = Number(orderData[amountField] || orderData.totalPrice || orderData.totalAmount || orderData.amount || 0)
    } catch (e) {
      logger.warn('createPayment: 解析订单金额失败', e.message)
    }
    if (actualAmount > 0 && Math.round(amount) !== Math.round(actualAmount * 100)) {
      logger.error('createPayment: 金额不符', { clientAmount: amount, dbAmount: actualAmount, dbAmountCents: Math.round(actualAmount * 100), type, orderId })
      return handleError(new Error('支付金额与订单金额不符'), '支付金额异常', ERROR_CODES.VALIDATION)
    }
```

- [ ] **Step 3: 在下单请求体中添加 time_expire 和 attach**

在 `requestBody` 构建中添加：

```js
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
```

---

### Task 5: 优化前端 PaymentService — 支付成功后同步查单确认

**Files:**
- Modify: `services/PaymentService.js`

**背景：** 官方文档明确要求：前端 `wx.requestPayment` 返回"成功"或"报错"时，必须调用查单接口确认订单状态。当前实现中 `confirmPayment` 是 fire-and-forget（`catch(() => {})` 吞掉错误），不等待结果就 resolve，导致支付成功但订单状态未更新。

- [ ] **Step 1: 重写 PaymentService.pay()，支付成功后同步查单确认**

```js
const { CloudFunctionService } = require('./CloudFunctionService')

class PaymentService {
  createPayment(data) {
    return CloudFunctionService.call('paymentService', { action: 'createPayment', ...data }, { retryCount: 1 })
  }

  queryPayment(data) {
    return CloudFunctionService.call('paymentService', { action: 'queryPayment', ...data }, { retryCount: 0 })
  }

  closePayment(data) {
    return CloudFunctionService.call('paymentService', { action: 'closePayment', ...data }, { retryCount: 0 })
  }

  confirmPayment(data) {
    return CloudFunctionService.call('paymentService', { action: 'confirmPayment', ...data }, { retryCount: 0 })
  }

  createRefund(data) {
    return CloudFunctionService.call('paymentService', { action: 'createRefund', ...data }, { retryCount: 0 })
  }

  queryRefund(data) {
    return CloudFunctionService.call('paymentService', { action: 'queryRefund', ...data }, { retryCount: 0 })
  }

  async pay(params) {
    const { type, orderId, amount, description } = params

    const result = await this.createPayment({ type, orderId, amount, description })
    if (!result || result.code !== 0 || !result.data || !result.data.paymentParams) {
      throw new Error(result?.message || '创建支付订单失败')
    }

    const outTradeNo = result.data.outTradeNo

    const paymentResult = await new Promise((resolve, reject) => {
      wx.requestPayment({
        timeStamp: result.data.paymentParams.timeStamp,
        nonceStr: result.data.paymentParams.nonceStr,
        package: result.data.paymentParams.package,
        signType: result.data.paymentParams.signType,
        paySign: result.data.paymentParams.paySign,
        success: () => resolve('success'),
        fail: (err) => {
          if (err && err.errMsg && err.errMsg.includes('cancel')) {
            resolve('cancel')
          } else {
            resolve('error')
          }
        },
      })
    })

    if (paymentResult === 'cancel') {
      const err = new Error('cancel')
      err.isCancel = true
      throw err
    }

    try {
      const confirmResult = await this.confirmPayment({ outTradeNo })
      if (confirmResult && confirmResult.code === 0 && confirmResult.data && confirmResult.data.paid) {
        return { ...result.data, paid: true }
      }
    } catch (e) {
      console.warn('[PaymentService] confirmPayment failed, will rely on callback', e)
    }

    return result.data
  }
}

module.exports = new PaymentService()
```

**关键变更：**
1. `wx.requestPayment` 的 `success` 不再直接 resolve，而是返回状态标记
2. 支付成功后**同步等待** `confirmPayment` 结果
3. `confirmPayment` 失败时不阻塞（回调会兜底），但会记录警告
4. `createPayment` 恢复 1 次重试（网络抖动保护）
5. 用户取消支付时抛出带 `isCancel` 标记的错误，方便调用方区分

- [ ] **Step 2: 更新所有调用方对 cancel 的处理**

在 `payment.js`、`confirm-service.js`、`order-status.js` 中，将 cancel 判断从 `payErr.message === 'cancel'` 改为 `payErr.isCancel`：

```js
if (payErr.isCancel) {
  // 用户取消支付
} else {
  // 支付失败
}
```

---

### Task 6: 优化 wechatPayUtils.js — 稳定私钥解析

**Files:**
- Modify: `cloudfunctions/paymentService/services/wechatPayUtils.js`

**背景：** 当前私钥以 Base64 编码存储在环境变量中，试错法虽然能工作但不够健壮。优化方案：先检测是否为 Base64 编码（特征：不含 `-----BEGIN` 且长度为4的倍数且只含 Base64 字符），直接解码后再走 PEM 格式检查。

- [ ] **Step 1: 优化 normalizePrivateKey，优先检测 Base64 编码**

```js
function normalizePrivateKey(key) {
  if (!key) return ''
  if (_cachedKeyFormat) return _tryFormatKey(key, _cachedKeyFormat)

  const trimmed = String(key).trim()

  if (trimmed.includes('-----BEGIN')) {
    try {
      const sign = crypto.createSign('RSA-SHA256')
      sign.update('test')
      sign.end()
      sign.sign(trimmed, 'base64')
      _cachedKeyFormat = 'raw'
      console.log('[wechatPayUtils] privateKey format resolved: raw PEM')
      return trimmed
    } catch (e) {}
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
    if (decoded.includes('-----BEGIN')) {
      const sign = crypto.createSign('RSA-SHA256')
      sign.update('test')
      sign.end()
      sign.sign(decoded, 'base64')
      _cachedKeyFormat = 'base64-decode'
      console.log('[wechatPayUtils] privateKey format resolved: base64-decode')
      return decoded
    }
  } catch (e) {}

  const formats = ['literal-n', 'strip-rebuild-pkcs8', 'strip-rebuild-rsa']
  for (const fmt of formats) {
    try {
      const formatted = _tryFormatKey(key, fmt)
      const sign = crypto.createSign('RSA-SHA256')
      sign.update('test')
      sign.end()
      sign.sign(formatted, 'base64')
      _cachedKeyFormat = fmt
      console.log('[wechatPayUtils] privateKey format resolved:', fmt)
      return formatted
    } catch (e) {
      continue
    }
  }

  console.error('[wechatPayUtils] all key formats failed')
  return String(key).trim()
}
```

---

### Task 7: 标记旧支付实现为废弃

**Files:**
- Modify: `cloudfunctions/orderService/payment.js`

**背景：** `orderService/payment.js` 是旧版支付实现，与 `paymentService` 功能重复。当前所有前端调用已走 `paymentService`，旧代码仅保留兼容性。

- [ ] **Step 1: 在文件顶部添加废弃注释**

```js
/**
 * @deprecated 此文件为旧版支付实现，请使用 paymentService 云函数。
 * 新版支付入口: cloudfunctions/paymentService/services/pay.js
 * 保留此文件仅为向后兼容，请勿新增调用。
 */
```

---

### Task 8: 部署并验证

**背景：** 所有代码修改完成后，需要重新部署 paymentService 云函数，并设置缺失的环境变量。

- [ ] **Step 1: 部署 paymentService 云函数**

- [ ] **Step 2: 设置 WECHAT_NOTIFY_URL 环境变量**

需要确认云函数的 HTTP 触发地址。通过云开发控制台或 API 获取 paymentService 的公网访问 URL。

- [ ] **Step 3: 设置 WECHAT_PAY_CERTIFICATE 环境变量**

从微信商户平台下载平台证书，设置为环境变量。

- [ ] **Step 4: 端到端测试**

1. 创建一笔活动订单，点击支付
2. 确认支付成功后，检查数据库中订单状态是否更新为 `confirmed`/`paid`
3. 检查云函数日志，确认回调通知是否正常接收和处理
4. 测试取消支付场景，确认订单状态保持 `pending_payment`
5. 测试喂养订单支付流程

---

## 执行优先级

| 优先级 | Task | 原因 |
|--------|------|------|
| P0 | Task 1 + Task 2 | 回调链路完全失效，是最严重的缺陷 |
| P0 | Task 3 | feeding 订单回调无法处理 |
| P1 | Task 5 | 前端支付结果处理不符合官方规范 |
| P1 | Task 4 | 金额校验脆弱 + 缺少 time_expire |
| P2 | Task 6 | 私钥解析优化 |
| P2 | Task 7 | 代码清理 |
| P0 | Task 8 | 部署验证 |
