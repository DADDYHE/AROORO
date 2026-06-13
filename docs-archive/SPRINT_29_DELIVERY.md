# Sprint 29 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W1-W2

## 目标

- 将 `cloudfunctions/orderService/payment.js` 迁移到 `payment.ts`（Sprint 29）
- 强类型化 2 个 handler：wechatPay（微信支付下单）+ wechatPayNotify（微信支付回调）
- 强类型化微信支付 v3 配置 / 请求 / 响应 / 回调 headers / 解密后的订单信息
- 保留 NotifyHttpResponse 类型（wechatPayNotify 返回原始 HTTP 响应）
- 保留 @deprecated 标记（旧版支付，后续可移除）
- 补齐 CI 门禁：`audit:s29-order-service-payment-ts:strict` 进入 `ci:check`
- 全量 `ci:check` 验证通过

## 关键任务完成度

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S29-01 | `cloudfunctions/orderService/payment.ts` 源文件创建 | ✅ | 2 handler + 5 helper，~470 行 |
| S29-02 | `tsconfig.orderService.json` include 扩展 payment.ts | ✅ | 与 orders.ts 共享配置 |
| S29-03 | `scripts/build-order-service.js` TARGETS 包含 payment.js | ✅ | 自动注入 `/* eslint-disable */` 标记 |
| S29-04 | `payment.js` 编译产物 | ✅ | 含 `_mod.exports = _handlers` CommonJS shim |
| S29-05 | `payment.d.ts` 类型声明 | ✅ | 2 处 `export declare function` |
| S29-06 | 强类型化 10 个核心接口 | ✅ | WechatPayConfig / WechatPayJsapiRequest / WechatPayJsapiResponse / WechatPayNotifyHeaders / WechatPayNotifyBody / WechatPayOrderInfo / WechatPayClientParams / WechatPayClientData / NotifyHttpResponse / HttpsRequestOptions |
| S29-07 | wechatPay 使用 withErrorHandling 包装 | ✅ | 返回 ApiResponse |
| S29-08 | wechatPayNotify 返回原始 HTTP 响应（不通过 withErrorHandling） | ✅ | 保留 statusCode + body |
| S29-09 | @deprecated 标记保留 | ✅ | 注释中 + 函数 JSDoc 中 |
| S29-10 | Runtime shim 修复 CommonJS 导出 | ✅ | `_mod.exports = _handlers` + `_handlers.default = _handlers` |
| S29-11 | 5+ 内部 helper 强类型化 | ✅ | randomString / rsaSign / httpsRequest / generateAuthorization / decryptAes256Gcm |
| S29-12 | `order-service-payment-ts-migration.test.js` 迁移测试（53 个用例） | ✅ | 10 个 describe 套件 |
| S29-13 | `audit-s29-order-service-payment-ts.js` CI 审计脚本（42 项 strict 检查） | ✅ | 进入 `ci:check` 链 |
| S29-14 | 更新 `audit-s28-order-service-orders-ts.js` 反映 Sprint 29 完成 | ✅ | 33 项检查全通过 |
| S29-15 | Sprint 29 交付文档 | ✅ | 本文档 |

## 1. payment.ts 迁移概览

### 1.1 迁移范围

`payment.js` 是 orderService 的旧版支付实现，**已被新版 `paymentService` 取代**。此文件保留仅为向后兼容：

| Handler | 业务功能 | 鉴权 | 关键流程 |
| --- | --- | --- | --- |
| `wechatPay` | 微信支付下单（旧版） | 需 | 鉴权 + 参数校验 + WECHAT_PAY 配置 + RSA 签名 + HTTPS 调用 v3 jsapi + 客户端签名 |
| `wechatPayNotify` | 微信支付回调（旧版） | 不需 | headers 校验 + 签名验证 + AES-256-GCM 解密 + 事务更新订单状态 |

### 1.2 内部辅助函数

| Helper | 用途 |
| --- | --- |
| `randomString` | 生成指定长度的随机字符串（nonce / outTradeNo） |
| `rsaSign` | RSA-SHA256 签名（用于微信支付 v3） |
| `httpsRequest` | HTTPS POST 请求（用于调用微信支付 v3 API） |
| `generateAuthorization` | 生成微信支付 v3 鉴权头 |
| `decryptAes256Gcm` | AES-256-GCM 解密（用于微信支付回调） |

### 1.3 CommonJS 互操作的关键点

与 Sprint 28 orders.ts 一致，使用 Runtime shim：

```typescript
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = _handlers
;(_handlers as Record<string, unknown>).default = _handlers
export default _handlers
```

`wechatPay` 通过 `withErrorHandling` 包装（返回 ApiResponse），`wechatPayNotify` 不通过包装（保留原始 HTTP 响应）。

### 1.4 强类型化收益

```typescript
// 之前（JS）—— 字段含义靠注释
async function wechatPayNotify(event) {
  const headers = event.headers || {}
  const signature = headers['Wechatpay-Signature'] || headers['wechatpay-signature']
  // ...
}

// 现在（TS）—— 编译器强制结构正确
export async function wechatPayNotify(event: EventLike): Promise<NotifyHttpResponse> {
  const headers = (event.headers || {}) as WechatPayNotifyHeaders
  const signature = headers['Wechatpay-Signature'] || headers['wechatpay-signature']
  // ...
}
```

**消除 6+ 处魔法字符串**（'Wechatpay-Signature' / 'wechatpay-signature' 等 header 名 / 'paid' 状态 / 'CNY' 货币）

## 2. 类型架构设计

### 2.1 接口分层

```
WechatPayConfig (微信支付配置)
  └─ WechatPayJsapiRequest (下单请求)
       └─ WechatPayJsapiResponse (下单响应)
WechatPayNotifyHeaders (回调 headers)
  └─ WechatPayNotifyBody (回调 body)
       └─ WechatPayOrderInfo (解密后的订单信息)
WechatPayClientParams (客户端签名参数)
  └─ WechatPayClientData (返回给客户端的完整数据)
NotifyHttpResponse (原始 HTTP 响应)
HttpsRequestOptions (HTTPS 请求选项)
```

### 2.2 接口详情

| 接口 | 关键字段 | 用途 |
| --- | --- | --- |
| `WechatPayConfig` | `appId` / `mchId` / `serialNo` / `privateKey` / `notifyUrl` / `certificate?` / `apiV3Key?` | 微信支付配置 |
| `WechatPayJsapiRequest` | `appid` / `mchid` / `description` / `out_trade_no` / `notify_url` / `amount: { total, currency }` / `payer: { openid }` | v3 jsapi 下单请求 |
| `WechatPayJsapiResponse` | `prepay_id?` | v3 jsapi 下单响应 |
| `WechatPayNotifyHeaders` | `Wechatpay-Signature?` / `wechatpay-signature?` / `Wechatpay-Timestamp?` / `Wechatpay-Nonce?` | 回调 headers（兼容大小写） |
| `WechatPayNotifyBody` | `resource?: { ciphertext? / associated_data? / nonce? }` | 回调 body |
| `WechatPayOrderInfo` | `out_trade_no` / `transaction_id` / `trade_state` | 解密后的订单信息 |
| `WechatPayClientParams` | `timeStamp` / `nonceStr` / `package` / `signType` / `paySign` | 客户端签名参数 |
| `WechatPayClientData` | `orderId` / `outTradeNo` / `paymentParams` | 返回给客户端的完整数据 |
| `NotifyHttpResponse` | `statusCode: number` / `body: string` | 原始 HTTP 响应 |
| `HttpsRequestOptions` | `hostname` / `port` / `path` / `method` / `headers` | HTTPS 请求选项 |

## 3. 业务流程序列

### 3.1 wechatPay（典型序列）

```
1. 鉴权 (auth.openid)                → AUTH_REQUIRED
2. 参数校验 (orderId/amount > 0)     → INVALID_PARAMS
3. 读取 WECHAT_PAY 配置              → BUSINESS_ERROR（未配置）
4. 生成 outTradeNo                  → ORDER_时间戳_随机6位
5. 构建 jsapi 请求体
6. generateAuthorization (POST + path + body)
7. httpsRequest → api.mch.weixin.qq.com/v3/pay/transactions/jsapi
8. 检查 prepay_id                    → BUSINESS_ERROR
9. 更新 orders.outTradeNo
10. 生成客户端签名
11. handleSuccess({ orderId, outTradeNo, paymentParams })
12. 错误 → isBusinessError + handleError
```

### 3.2 wechatPayNotify（典型序列）

```
1. 解析 headers (signature/timestamp/nonce) → 401 缺少签名头
2. 解析 body.resource (ciphertext/associated_data/nonce) → 400 缺少 ciphertext
3. 读取 WECHAT_PAY.certificate → 500 未配置平台证书
4. SHA256withRSA 验签 → 401 签名验证失败
5. 读取 WECHAT_PAY.apiV3Key → 500 未配置 API V3 密钥
6. decryptAes256Gcm 解密 → 200 SUCCESS
7. 启动数据库事务
8. trade_state === 'SUCCESS' ?
   - 是：查询订单 → paymentStatus === 'paid' ? 跳过：更新 status=paid + paymentStatus=paid
   - 否：跳过
9. transaction.commit() → 200 SUCCESS
10. catch (error: unknown) → transaction.rollback() → 500 FAIL
```

## 4. 编译产物

### 4.1 payment.js 关键导出

```javascript
exports.wechatPay = withErrorHandling(wechatPay)
exports.wechatPayNotify = wechatPayNotify
exports.default = _handlers
// Runtime shim: _mod.exports = _handlers（保持 CommonJS 兼容）
```

支持三种 require 方式：
- `const payment = require('./payment')` → `payment.wechatPay(...)` ✓
- `const { wechatPay } = require('./payment')` ✓
- `const payment = require('./payment').default` ✓

### 4.2 payment.d.ts 关键签名

```typescript
export declare function wechatPay(
  event: EventLike,
  _context: ContextLike,
  auth: AuthLike | null
): HandlerResult

export declare function wechatPayNotify(event: EventLike): Promise<NotifyHttpResponse>

export default _handlers
```

## 5. 与新版 paymentService 的对比

| 维度 | 旧版 payment.ts | 新版 paymentService/services/pay.ts |
| --- | --- | --- |
| 角色 | orderService 内嵌 handler | 独立云函数 |
| 鉴权 | 需 auth | 无（云函数网关鉴权） |
| 错误处理 | `withErrorHandling` + `handleError` | 统一错误处理 + i18n |
| 签名 | RSA-SHA256 | RSA-SHA256（共享 crypto 工具） |
| 解密 | AES-256-GCM | AES-256-GCM（共享 crypto 工具） |
| 回调响应 | `statusCode: 200 + { code: 'SUCCESS' }` | 同 |
| 状态机 | 直接更新 orders.status | 走订单状态机 |
| 佣金 | 不创建 | 创建佣金记录 |
| 通知 | 不发 | 发通知 |
| 幂等 | 不支持 | 支持（idempotencyKey） |
| i18n | 错误消息硬编码 | 支持 zh-CN / en-US / ja-JP |

**结论**：Sprint 29 是技术债务清理，**业务上**应继续向新版 paymentService 迁移。Sprint 30 后可以逐步废弃旧版 payment.ts。

## 6. CI 门禁

### 6.1 audit 脚本 42 项检查

```
[1]  payment.ts / .d.ts / .js 文件存在性 × 3
[2]  tsconfig.orderService.json include payment.ts
[3]  build-order-service.js 包含 payment.js
[4]  package.json 注册 audit:s29 + strict + ci:check × 4
[5]  payment.ts 注释 "Sprint 29 迁移"
[6]  payment.ts 包含 @deprecated 标记
[7]  payment.ts 强类型化 10 个核心接口 × 10
[8]  payment.ts 包含 2 个 handler（wechatPay / wechatPayNotify）
[9]  payment.ts 使用 isBusinessError 类型守卫
[10] payment.ts 使用 catch (error: unknown) 模式
[11] payment.ts Runtime shim 修复 CommonJS 导出
[12] payment.ts wechatPay 通过 withErrorHandling 包装
[13] payment.ts wechatPayNotify 不通过 withErrorHandling 包装
[14] payment.ts 引用 WECHAT_PAY / decryptAes256Gcm / rsaSign / generateAuthorization × 4
[15] stats.js 暂未迁移（Sprint 30 计划）
[16] jest 测试存在
[17-21] (strict) tsc --noEmit + .d.ts 2+ declare function + eslint-disable 头 + shim 存在 + exports.wechatPay + exports.wechatPayNotify
```

### 6.2 ci:check 链更新

```json
"ci:check": "npm run lint:cloudfunctions && ... && npm run audit:s28-order-service-orders-ts:strict && npm run audit:s29-order-service-payment-ts:strict && npm run i18n:collect:zh:check && npm run codemod:page-i18n:check && npm run test:ci"
```

### 6.3 同步更新 s28 audit

由于 Sprint 29 完成了 payment.ts 迁移，更新 s28 audit 反映状态变化：
- "payment.js 暂未迁移（Sprint 29 计划）" → "payment.ts 已迁移（Sprint 29 完成）" + "payment.js 编译产物存在"
- 总检查项：32 → 33

## 7. 测试覆盖

### 7.1 jest 测试（53 个用例）

| 套件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| 1. 文件存在性 | 3 | .ts / .d.ts / .js 存在性 |
| 2. tsconfig 配置 | 6 | strict + noImplicitAny + strictNullChecks + declaration + include payment.ts + include orders.ts 回归 |
| 3. payment.ts 源文件 | 13 | Sprint 29 注释 + @deprecated + 10 个核心接口 + ApiResponse + ServiceLogger |
| 4. handler 完整性 | 3 | 2 个 export async function |
| 5. 业务逻辑 | 12 | err() >= 3 + isBusinessError + catch unknown >= 2 + WECHAT_PAY + rsaSign + httpsRequest + decryptAes256Gcm + createVerify + startTransaction + WECHAT_PAY.certificate + WECHAT_PAY.apiV3Key + status=paid + paymentStatus=paid |
| 6. Runtime shim | 3 | _mod.exports = _handlers + .default = _handlers + _mod = module as |
| 7. payment.d.ts | 4 | 2+ declare function + wechatPay + wechatPayNotify + NotifyHttpResponse |
| 8. payment.js 编译产物 | 6 | eslint-disable 头 + _mod.exports shim + exports.wechatPay + exports.wechatPayNotify + 不包装 wechatPayNotify + require 路径可解析 |
| 9. 编译可重复 | 1 | tsc --noEmit 通过 |
| 10. 运行时兼容 | 1 | require("./payment") 包含 wechatPay + wechatPayNotify |

### 7.2 测试结果

```
PASS test/order-service-payment-ts-migration.test.js
Tests: 53 passed, 53 total
```

并与 Sprint 28 之前的 order 服务测试联合运行：

```
Tests: 80 passed, 80 total  (3 个套件: order-service-orders + order-service-evaluation-risk + order-service-orders-ts-migration)
```

## 8. 兼容性保证

| 维度 | 保证 |
| --- | --- |
| payment.js 导出 | `_mod.exports = _handlers` + `_handlers.default = _handlers`，三种 require 方式都可用 |
| 2 个 handler | wechatPay 通过 `withErrorHandling` 包装（错误统一响应），wechatPayNotify 保持原样（返回原始 HTTP 响应） |
| 鉴权 | wechatPay 需 auth，wechatPayNotify 不需（由 index.js 判定） |
| 错误处理 | err() 工厂 + isBusinessError 类型守卫 + 2 处 catch (e: unknown) |
| 微信支付 API | 维持 v3 jsapi 协议 |
| 微信支付回调 | 维持 AES-256-GCM 解密 + SHA256withRSA 验签 |
| @deprecated | 保留标记，提示调用方使用新版 paymentService |

## 9. 关键学习：保留旧版与新版的兼容性

### 9.1 wechatPayNotify 返回原始 HTTP 响应

Sprint 29 最关键的发现：**wechatPayNotify 必须返回原始 HTTP 响应，而非 ApiResponse**。

```typescript
// ❌ 错误：通过 withErrorHandling 包装
wechatPayNotify: withErrorHandling(wechatPayNotify)
// 后果：失败时返回 ApiResponse 而非 statusCode: 500，微信会持续重试

// ✅ 正确：直接返回
wechatPayNotify  // 保留原始 statusCode + body
```

**这是与 orders.ts（14 个 handler 全部包装）的关键差异**。

### 9.2 事务对象强类型化

CloudBase 事务对象在 .d.ts 中没有完整定义，需要在 payment.ts 中强类型化：

```typescript
interface Transaction {
  rollback(): Promise<void>
  commit(): Promise<void>
  collection(name: string): TransactionCollection
}
```

这避免了 `db.startTransaction()` 返回 `any` 导致的潜在错误。

### 9.3 错误处理降级

```typescript
} catch (error: unknown) {
  if (isBusinessError(error)) {
    return handleError(error as Error, '支付下单失败', ERROR_CODES.BUSINESS)
  }
  logger.error('wechatPay', { msg: (error as Error)?.message })
  return handleError(error as Error, '支付下单失败', ERROR_CODES.BUSINESS)
}
```

**统一从 unknown 转换为 Error**（`handleError` 要求 Error 类型），确保类型安全。

## 10. 指标

| 指标 | Sprint 24 (refund) | Sprint 25 (pay) | Sprint 26 (notify) | Sprint 27 (commission) | Sprint 28 (orders) | **Sprint 29 (payment)** |
| --- | --- | --- | --- | --- | --- | --- |
| 源文件行数（.ts） | ~280 | ~560 | ~440 | ~280 | ~1120 | **~470** |
| handler / 函数数 | 2 | 4 | 1 | 1 | 14 + 7 helper | **2 + 5 helper** |
| 内部接口数 | 8 | 14 | 7 | 5 | 9 | **10** |
| jest 用例数 | 21 | 25 | 41 | 37 | 62 | **53** |
| audit 检查项 | 18 | 19 | 33 | 30 | 32 (→33) | **42** |
| ci:check 链 | ✓ | ✓ | ✓ | ✓ | ✓ | **✓** |
| catch (e: unknown) | - | - | - | - | 6 | **2** |
| @deprecated | - | - | - | - | - | **2** |

## 11. 后续计划

- **Sprint 30**: `orderService/stats.js` → `stats.ts`（统计服务，最后一个 orderService 迁移）
- **Sprint 31**: handleSuccess 残留点扫描 + 全局限流覆盖度审计 + TypeScript 迁移覆盖率指标实现
- **Sprint 32+**: 移除旧版 orderService/payment.ts（在新版 paymentService 完全替代后）

## 12. 变更清单

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `cloudfunctions/orderService/payment.ts` | 新建 | 强类型化旧版支付（470 行，@deprecated） |
| `cloudfunctions/orderService/payment.d.ts` | 新建（自动） | tsc 生成 |
| `cloudfunctions/orderService/payment.js` | 重建（自动） | tsc 编译产物 |
| `tsconfig.orderService.json` | 修改 | include 增加 payment.ts |
| `scripts/build-order-service.js` | 修改 | TARGETS 增加 payment.js |
| `scripts/audit-s28-order-service-orders-ts.js` | 修改 | 反映 Sprint 29 完成 |
| `scripts/audit-s29-order-service-payment-ts.js` | 新建 | 42 项 strict 检查 |
| `test/order-service-payment-ts-migration.test.js` | 新建 | 53 个 jest 用例 |
| `package.json` | 修改 | 注册 audit:s29 + ci:check 链 |
