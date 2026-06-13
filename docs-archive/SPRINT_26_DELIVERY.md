# Sprint 26 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W1-W2

## 目标

- 将 `cloudfunctions/paymentService/services/notify.js` 迁移到 `notify.ts`
- 强类型化微信支付回调全链路（event / headers / resource / orderInfo）
- 保留 HTTP 响应结构 `{ statusCode, body }`（与微信支付回调契约一致）
- 与 Sprint 24 / 25 共享同一 `tsconfig.paymentService.json`
- 补齐 CI 门禁：`audit:s26-payment-notify-ts:strict` 进入 `ci:check`
- 全量 `ci:check` 验证通过

## 关键任务完成度

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S26-01 | `cloudfunctions/paymentService/services/notify.ts` 源文件创建 | ✅ | 1 个 handler（paymentNotify）+ 5 个内部接口 |
| S26-02 | `tsconfig.paymentService.json` include 扩展 notify.ts | ✅ | 与 refund.ts / pay.ts 共享配置 |
| S26-03 | `scripts/build-payment-service.js` TARGETS 包含 notify.js | ✅ | 自动注入 `/* eslint-disable */` 标记 |
| S26-04 | `paymentService/index.js` 继续 require './services/notify' | ✅ | 保持运行时零侵入（消费 .js 编译产物） |
| S26-05 | `notify.ts` 强类型化 5 个核心接口 | ✅ | NotifyEvent / NotifyHeaders / NotifyResource / NotifyOrderInfo / NotifyHttpResponse |
| S26-06 | `notify.ts` 不使用 withErrorHandling（HTTP 响应需保留原结构） | ✅ | 直接 try/catch 返回 HTTP 响应 |
| S26-07 | `payment-service-notify-ts-migration.test.js` 迁移测试（41 个用例） | ✅ | 文件存在性 + tsconfig + 类型 + 业务逻辑 + 编译产物 + 兼容性 |
| S26-08 | `audit-s26-payment-notify-ts.js` CI 审计脚本（33 项 strict 检查） | ✅ | 进入 `ci:check` 链 |
| S26-09 | Sprint 26 交付文档 | ✅ | 本文档 |

## 1. notify.ts 迁移概览

### 1.1 迁移范围

`notify.js` 包含 1 个云函数入口（HTTP 触发）+ 多个内部工具函数：

| Handler | 业务功能 | 关键流程 |
| --- | --- | --- |
| `paymentNotify` | 处理微信支付 V3 回调 | 头解析 → 签名验证（RSA-SHA256）→ AES-256-GCM 解密 → 订单查询 → 状态推进 → 跨表同步 → commission 触发 |

### 1.2 与 pay.ts / refund.ts 的关键差异

| 维度 | pay.ts / refund.ts | notify.ts |
| --- | --- | --- |
| 返回结构 | `WrappedHandler<T>` 标准 API 响应 | `Promise<NotifyHttpResponse>` 原始 HTTP 响应 |
| 异常处理 | `withErrorHandling` 包装 | 直接 `try/catch` + 内部 `err()` 工厂 |
| 鉴权 | 需要 openid | 无需鉴权（NO_AUTH_ACTIONS） |
| 入口 | `event.action` 分发 | `event.headers && event.body` HTTP 判定 |
| 数据流 | 单向（请求 → 响应） | 双向（回调 → DB 写入 → 响应） |

### 1.3 强类型化收益

```typescript
// 之前（JS）—— 完全靠注释 / 文档传递结构
async function paymentNotify(event) {
  const headers = event.headers || {}
  const signature = headers['Wechatpay-Signature'] || headers['wechatpay-signature']
  // ...
}

// 现在（TS）—— 编译器保证结构正确
interface NotifyHeaders {
  signature: string | undefined
  timestamp: string | undefined
  nonce: string | undefined
  serial: string | undefined
}
function parseHeaders(event: NotifyEvent): NotifyHeaders { ... }
```

**消除 6+ 处魔法字符串**（如 `'Wechatpay-Signature'` / `'wechatpay-signature'` 大小写变体）

## 2. 类型架构设计

### 2.1 接口分层

```
NotifyEvent (HTTP 事件)
  └─ NotifyHeaders (回调头)
  └─ NotifyBody (回调 body)
       └─ NotifyResource (加密资源)
            └─ NotifyOrderInfo (解密后订单信息)
  └─ NotifyHttpResponse (HTTP 响应)
```

### 2.2 接口详情

| 接口 | 字段 | 用途 |
| --- | --- | --- |
| `NotifyEvent` | `headers?: Record<string, string \| undefined>` / `body?: string \| Record \| null` | 微信支付回调入参 |
| `NotifyHeaders` | `signature` / `timestamp` / `nonce` / `serial` | 标准化回调头（大小写不敏感） |
| `NotifyResource` | `ciphertext` / `associated_data` / `nonce` | 加密资源 |
| `NotifyBody` | `resource?: NotifyResource` + 索引签名 | 回调 body 整体 |
| `NotifyOrderInfo` | `out_trade_no` / `transaction_id` / `trade_state` | 解密后订单信息 |
| `NotifyOrderDoc` | `_id` / `outTradeNo` / `ownerId` / `openid` / `activityId` / `paymentStatus` / `status` / `orderType` | 订单文档最小子集 |
| `NotifyHttpResponse` | `statusCode: number` / `body: string` | HTTP 响应（与微信支付回调契约一致） |

### 2.3 工具函数提取

| 函数 | 输入 | 输出 | 用途 |
| --- | --- | --- | --- |
| `decryptAes256Gcm` | base64 ciphertext / key / nonce / AAD | 明文字符串 | AES-256-GCM 解密 |
| `parseHeaders` | NotifyEvent | NotifyHeaders | 头标准化（兼容大小写） |
| `parseBody` | NotifyEvent | NotifyBody | body 解析（兼容 string / object） |
| `getOrderType` | outTradeNo | OrderType \| null | 前缀识别订单类型 |
| `httpResponse` | statusCode / code / message | NotifyHttpResponse | 构造标准 HTTP 响应 |
| `verifySignature` | rawBody / timestamp / nonce / signature / cert | void（抛错） | RSA-SHA256 签名验证 |
| `applyPaidStatus` | orderType / order / transactionId | Promise<void> | 推进订单状态 |
| `triggerCommission` | orderType / order | Promise<void> | 触发佣金记录（best-effort） |

## 3. 业务流程序列

```
1. parseHeaders(event)        → 标准化回调头
2. parseBody(event)           → 解析回调 body
3. 校验 ciphertext 存在 + 长度 ≤ 1MB
4. verifySignature(...)       → RSA-SHA256 验签（失败抛 PAYMENT_NOTIFY_INVALID）
5. decryptAes256Gcm(...)      → AES-256-GCM 解密
6. JSON.parse(decrypted)      → NotifyOrderInfo
7. trade_state === 'SUCCESS'?
   ├─ Yes → getOrderType → 查询订单 → 幂等检查 → applyPaidStatus → triggerCommission
   └─ No  → log + ACK (200/SUCCESS)
8. catch (error: unknown)
   ├─ PAYMENT_NOTIFY_INVALID → 401/FAIL
   └─ 其他 → 500/FAIL
```

## 4. CI 门禁

### 4.1 audit 脚本 33 项检查

```
[1]  notify.ts / .d.ts / .js 文件存在性 × 3
[2]  tsconfig.paymentService.json include notify.ts
[3]  build-payment-service.js TARGETS 包含 notify.js
[4]  package.json 注册 audit:s26-payment-notify-ts + strict × 3
[5]  notify.ts 包含 paymentNotify handler
[6]  notify.ts 强类型化 5 个核心接口 × 5
[7]  notify.ts 不使用 withErrorHandling（精确检测 import / call）
[8]  notify.ts 引用 err 工厂
[9]  notify.ts 实现 AES-256-GCM 解密 + RSA-SHA256 验签
[10] notify.ts 包含 trade_state === SUCCESS + 幂等保护
[11] notify.ts 触发 commission（commission.js 接口）
[12] notify.ts 注释包含 "Sprint 26"
[13] paymentService/index.js require notify + 使用 notifyHandlers + NO_AUTH_ACTIONS × 3
[14] jest 测试 payment-service-notify-ts-migration.test.js 存在
[15-21] (strict) tsc --noEmit + .d.ts 类型验证 + 编译产物 require 解析 + paymentNotify 导出
```

### 4.2 ci:check 链更新

```json
"ci:check": "npm run lint:cloudfunctions && npm run audit:error-codes:strict && npm run audit:errors-singleton:strict && npm run audit:global-rate-limit:strict && npm run audit:s22-business-risk:strict && npm run audit:s23-i18n-override:strict && npm run audit:s24-payment-service-ts:strict && npm run audit:s25-payment-pay-ts:strict && npm run audit:s26-payment-notify-ts:strict && npm run i18n:collect:zh:check && npm run codemod:page-i18n:check && npm run test:ci"
```

## 5. 测试覆盖

### 5.1 jest 测试（41 个用例）

| 套件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| 1. 文件存在性 | 3 | .ts / .d.ts / .js 存在性 |
| 2. tsconfig 配置 | 7 | strict / noImplicitAny / declaration / include 完整 |
| 3. notify.ts 源文件 | 8 | Sprint 26 注释 / 5 个接口 / handler / err 工厂 / CloudBaseDB / 不使用 withErrorHandling |
| 4. notify 业务逻辑 | 9 | 签名验证 / AES 解密 / 订单类型前缀 / 状态机 / 幂等 / 跨表同步 / commission / catch unknown |
| 5. notify.d.ts | 5 | Promise<NotifyHttpResponse> / NotifyHttpResponse 接口 / paymentNotify 导出 / _auth 可 null / 无 any |
| 6. notify.js 编译产物 | 3 | eslint-disable 头 / 导出 paymentNotify / require 路径可解析 |
| 7. paymentService/index.js | 3 | require notify / ...notifyHandlers / NO_AUTH_ACTIONS |
| 8. 编译可重复 | 1 | tsc --noEmit 通过 |
| 9. paymentService/index.js 兼容 | 2 | require / handlers 展开 |

### 5.2 测试结果

```
PASS test/payment-service-notify-ts-migration.test.js
Tests: 41 passed, 41 total
```

并与 Sprint 25 pay 迁移测试、Sprint 24 refund 迁移测试联合运行：

```
Tests: 163 passed, 163 total  (7 个套件)
```

## 6. 编译产物对比

### 6.1 notify.js 关键导出

```javascript
exports.paymentNotify = paymentNotify
exports.default = { paymentNotify }
```

### 6.2 notify.d.ts 关键签名

```typescript
export declare function paymentNotify(
  event: Record<string, unknown>,
  _context: Record<string, unknown>,
  _auth: { openid?: string; [k: string]: unknown } | null
): Promise<NotifyHttpResponse>
```

## 7. 兼容性保证

| 维度 | 保证 |
| --- | --- |
| index.js 接口 | 继续 require './services/notify'，消费 .js 编译产物 |
| 回调契约 | `{ statusCode, body }` 结构与微信支付 V3 回调完全一致 |
| 错误响应 | PAYMENT_NOTIFY_INVALID → 401/FAIL；其他 → 500/FAIL |
| 幂等保护 | 订单已 paid → 直接 200/SUCCESS，不重复写库 |
| 跨表同步 | tuan → tuan_orders；activity → orders（活动报名订单） |
| commission 触发 | best-effort 异步调用，失败仅记日志不影响回调响应 |

## 8. 指标

| 指标 | Sprint 24 (refund) | Sprint 25 (pay) | Sprint 26 (notify) |
| --- | --- | --- | --- |
| 源文件行数（.ts） | ~280 | ~560 | ~440 |
| handler 数 | 2 | 4 | 1 |
| 内部接口数 | 8 | 14 | 7 |
| jest 用例数 | 21 | 25 | 41 |
| audit 检查项 | 18 | 19 | 33 |
| ci:check 链 | ✓ | ✓ | ✓ |

## 9. 后续计划

- **Sprint 27**: `commission.js` → `commission.ts` 迁移
- **Sprint 28**: `orderService/services` 迁移（orders.js / payment.js）
- **Sprint 29+**: handleSuccess 残留点扫描 + TypeScript 迁移覆盖率指标

## 10. 变更清单

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `cloudfunctions/paymentService/services/notify.ts` | 新建 | 强类型化微信支付回调 |
| `cloudfunctions/paymentService/services/notify.d.ts` | 新建（自动） | tsc 生成 |
| `cloudfunctions/paymentService/services/notify.js` | 重建（自动） | tsc 编译 |
| `tsconfig.paymentService.json` | 修改 | include 增加 notify.ts |
| `scripts/build-payment-service.js` | 修改 | TARGETS 增加 notify.js |
| `scripts/audit-s26-payment-notify-ts.js` | 新建 | 33 项 strict 检查 |
| `test/payment-service-notify-ts-migration.test.js` | 新建 | 41 个 jest 用例 |
| `package.json` | 修改 | 注册 audit:s26-payment-notify-ts + ci:check 链 |
