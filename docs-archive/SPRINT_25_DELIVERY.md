# Sprint 25 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W1-W2

## 目标

- 将 `cloudfunctions/paymentService/services/pay.js` 迁移到 `pay.ts`
- 统一 4 个 handler 使用 `WrappedHandler<T>` 强类型 + `withErrorHandling` 模式
- 与 Sprint 24 迁移的 `refund.ts` 共享同一 `tsconfig.paymentService.json`
- 补齐 CI 门禁：`audit:s25-payment-pay-ts:strict` 进入 `ci:check`
- 全量 `ci:check` 验证通过

## 关键任务完成度

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S25-01 | `cloudfunctions/paymentService/services/pay.ts` 源文件创建 | ✅ | 4 个 handler 全部迁移 |
| S25-02 | `tsconfig.paymentService.json` include 扩展 pay.ts | ✅ | 与 refund.ts 共享配置 |
| S25-03 | `scripts/build-payment-service.js` TARGETS 包含 pay.js | ✅ | 自动注入 `/* eslint-disable */` 标记 |
| S25-04 | `paymentService/index.js` 继续 require './services/pay'（消费 .js 编译产物） | ✅ | 保持运行时零侵入 |
| S25-05 | `types.d.ts` 扩展 `CloudBaseQuery.update`（类型补齐） | ✅ | 真实 CloudBase SDK 模式 |
| S25-06 | `payment-order-rate-limit.test.js` 适配 WrappedHandler 返回结构 | ✅ | 成功路径直接断言原始数据 |
| S25-07 | `payment-service-pay.test.js` 适配 WrappedHandler 返回结构 | ✅ | 6 处成功断言修正 |
| S25-08 | `integration/main-flow.test.js` 适配 WrappedHandler 返回结构 | ✅ | 1 处成功断言修正 |
| S25-09 | `payment-service-pay-ts-migration.test.js` 迁移测试（25 个用例） | ✅ | 文件存在性 + tsconfig + 类型 + 编译产物 + 兼容性 |
| S25-10 | `audit-s25-payment-pay-ts.js` CI 审计脚本（33 项 strict 检查） | ✅ | 进入 `ci:check` 链 |
| S25-11 | Sprint 25 交付文档 | ✅ | 本文档 |

## 1. pay.ts 迁移概览

### 1.1 迁移范围

`pay.js` 包含 4 个云函数入口：

| Handler | 业务功能 | 关键流程 |
| --- | --- | --- |
| `createPayment` | 发起微信预付单 | 参数校验 → 订单校验 → 旧单回收 → 微信 API → 落库 paymentStatus=paying → 返回小程序签名 |
| `queryPayment` | 查询微信支付单 | 调微信 `/v3/pay/transactions/{out-trade-no,id}` |
| `closePayment` | 主动关闭未支付单 | 调微信 `/v3/pay/transactions/{out-trade-no}/close` |
| `confirmPayment` | 确认支付（拉起后） | 调微信查 trade_state → 校验状态机 → 落库 paymentStatus=paid → 触发 commission |

### 1.2 与 refund.ts 的一致模式

```typescript
import { err, isBusinessError, withErrorHandling, type WrappedHandler } from '../../common/errors'
import { withRateLimit } from '../../common/risk-rate-limit'
// ... 其他 common/* 导入

// 4 个 handler 统一用 withErrorHandling<...>(...) 包装
export const createPayment: WrappedHandler<CreatePaymentResult> = withErrorHandling<CreatePaymentResult>(async (...) => {
  // 业务参数校验
  if (!type || !orderId || !amount || amount <= 0) {
    throw err('INVALID_PARAMS', '参数不完整')
  }
  // ... 业务逻辑
  return { orderId, outTradeNo, paymentParams: { timeStamp, nonceStr, package, signType, paySign } }
})
```

**成功路径**：handler 直接返回原始数据（`{outTradeNo, paymentParams, ...}`），`code === undefined`
**错误路径**：通过 `err(...)` 抛 `BusinessError`，被 `withErrorHandling` 包装为 `ApiResponse<null>`（`{code, message, data: null, error: {type, details}}`）

### 1.3 关键设计决策

#### 1.3.1 closePaymentInternal 抽出

原 `pay.js` 中 `createPayment` 会调用 `closePayment(...)` 回收旧单。但 `closePayment` 在新模式中是 `WrappedHandler<null>`（带 withErrorHandling 包装），不能直接 await 调用内部业务逻辑。

**Sprint 25 方案**：抽出 `closePaymentInternal(event, context, auth, db, config)` 纯函数（不经过 withErrorHandling），供 `createPayment` 回收旧单时直接调用。`closePayment` 公开 handler 仍走 `withErrorHandling<null>` 包装路径。

#### 1.3.2 OrderType 强类型化

原 JS 仅有字符串 type 字段。Sprint 25 引入 `type OrderType = 'order' | 'mall' | 'tuan' | 'activity' | 'feeding'`，所有依赖订单类型的元数据（`ORDER_TYPE_PREFIX`、`ORDER_TYPE_COLLECTION` 等）都标为 `Record<OrderType, string>`，避免无效 type 编译通过。

#### 1.3.3 关闭旧单的 db 参数显式传入

`closePaymentInternal` 接受 `db: CloudBaseDB` 参数（避免使用模块级 `db` 闭包），提高可测试性 + 与 `createPayment` 的 `db` 来源一致。

#### 1.3.4 RATE_LIMITED 透传精简

```typescript
try {
  payResult = (await withRateLimit(..., () => httpsRequest(...))) as WechatPayJsapiResult
} catch (e) {
  if (isBusinessError(e) && e.code === 'RATE_LIMITED') {
    logger.warn('createPayment.rate_limited', { orderId, userId: openid, msg: e.message })
  }
  throw e  // 透传 RATE_LIMITED 与其他 BusinessError
}
```

由于 `withErrorHandling` 内部对 `BusinessError` 已经正确序列化（错误码透传），外部 `catch` 只需日志埋点。

### 1.4 类型补齐：CloudBaseQuery.update

原 `types.d.ts` 中 `CloudBaseQuery` 接口缺少 `update` 方法，导致 `where().limit().update({...})` 编译报错。

Sprint 25 补齐：
```typescript
export interface CloudBaseQuery {
  // ... 既有方法
  update: (params: { data: Record<string, unknown> }) => Promise<{ updated: number }>
}
```

这是 CloudBase Node SDK 的真实用法（批量更新命中查询条件的所有文档），pay.ts 中用于同步 `tuan_orders` / `orders` 表（activity 报名同步）。

## 2. 测试配套更新

### 2.1 payment-order-rate-limit.test.js

4 个用例中 2 处成功断言更新：
- `r.code === 0` → `r.code === undefined` + `r.outTradeNo` 顶层断言

### 2.2 payment-service-pay.test.js

20 个用例中 6 处成功断言更新：
- `createPayment` 成功：`result.data.outTradeNo` / `result.data.paymentParams` → 顶层访问
- `confirmPayment` 成功：`result.data.paid` / `result.data.alreadyConfirmed` → 顶层访问
- `closePayment` 成功：`result.code === 0` → `result === null`（因为 `closePayment` 返回 `null`）
- `queryPayment` 成功：`result.data.trade_state` → 顶层访问

### 2.3 integration/main-flow.test.js

1 处成功断言更新：阶段 4 支付下单后 `payRes.data.outTradeNo` → 顶层访问。

### 2.4 新增 payment-service-pay-ts-migration.test.js

25 个用例覆盖：
- **文件存在性**（4）：pay.ts / pay.d.ts / pay.js / tsconfig.paymentService.json
- **tsconfig 配置**（6）：strict / noImplicitAny / strictNullChecks / declaration / include pay.ts / 仍 include refund.ts
- **pay.ts 内容**（8）：Sprint 25 注释 / withErrorHandling / WrappedHandler / 导入 err / 导入 isBusinessError / 导入 withRateLimit / 导入 CloudBaseDB / 4 个 handler / 不再调用 handleSuccess
- **pay.d.ts 类型**（2）：≥4 处 WrappedHandler / 无 top-level any
- **pay.js 编译产物**（3）：eslint-disable 头部 / 4 个 handler / require 路径可解析
- **index.js 兼容**（1）：paymentService/index.js 仍 require './services/pay'
- **编译可重复**（1）：tsc --noEmit 无错误

## 3. CI 门禁

### 3.1 audit-s25-payment-pay-ts.js

33 项 strict 检查（与 refund.ts 同模板）：
- 文件存在性、tsconfig 配置、build 脚本配置、package.json 脚本注册
- pay.ts 内容（4 个 handler / 强类型 / 关键导入 / Sprint 25 注释 / 不再调用 handleSuccess）
- pay.d.ts 类型（≥4 处 WrappedHandler<T> / 无 any）
- pay.js 编译产物（eslint-disable 标记 / 4 个 handler / require 路径可解析）
- paymentService/index.js 兼容
- tsc --noEmit 严格通过

### 3.2 ci:check 链

新增 1 个门禁：`audit:s25-payment-pay-ts:strict`，串联在 `ci:check` 第 8 步（在 `audit:s24-payment-service-ts:strict` 之后）。

完整 `ci:check` 链路（11 步）：
1. `lint:cloudfunctions`
2. `audit:error-codes:strict`
3. `audit:errors-singleton:strict`
4. `audit:global-rate-limit:strict`
5. `audit:s22-business-risk:strict`
6. `audit:s23-i18n-override:strict`
7. `audit:s24-payment-service-ts:strict`
8. **`audit:s25-payment-pay-ts:strict`（新增）**
9. `i18n:collect:zh:check`
10. `codemod:page-i18n:check`
11. `test:ci`

## 4. 全量测试结果

```
Test Suites: 1 skipped, 88 passed, 88 of 89 total
Tests:       1 skipped, 1759 passed, 1760 total
```

- 88 个套件（+1 相对 Sprint 24）
- 1759 个用例（+25，相对 Sprint 24 的 1734）
- Sprint 25 新增套件：`test/payment-service-pay-ts-migration.test.js`（25 个用例）

## 5. 改动文件清单

### 新增

- `cloudfunctions/paymentService/services/pay.ts`（540 行，TypeScript 源）
- `test/payment-service-pay-ts-migration.test.js`（25 个迁移测试）
- `scripts/audit-s25-payment-pay-ts.js`（CI 门禁，33 项 strict）

### 修改

- `cloudfunctions/paymentService/services/pay.js`（tsc 自动生成，原 JS 已废弃）
- `cloudfunctions/paymentService/services/pay.d.ts`（tsc 自动生成）
- `cloudfunctions/common/types.d.ts`（`CloudBaseQuery.update` 类型补齐）
- `scripts/build-payment-service.js`（TARGETS 增加 pay.js）
- `tsconfig.paymentService.json`（include 增加 pay.ts）
- `package.json`（新增 `audit:s25-payment-pay-ts` / `audit:s25-payment-pay-ts:strict`；`ci:check` 链新增 1 步）
- `test/payment-order-rate-limit.test.js`（2 处成功断言更新）
- `test/payment-service-pay.test.js`（6 处成功断言更新）
- `test/integration/main-flow.test.js`（1 处成功断言更新）

## 6. 度量看板

| 指标 | Sprint 24 末 | Sprint 25 末 | Δ |
| --- | --- | --- | --- |
| 测试用例 | 1734 | **1759** | +25 |
| 测试套件 | 87 | **88** | +1 |
| TypeScript 支付服务迁移 | 1（refund） | **2（refund + pay）** | +1 |
| 4 个 handler 全部强类型化 | ❌ | **✅**（createPayment / queryPayment / closePayment / confirmPayment） | +1 |
| handleSuccess 调用点 | 9 | **0**（Sprint 25 全部迁移到 withErrorHandling） | -9 |
| audit CI 门禁 | 6 | **7** | +1 |
| CI 门禁 job | 10 | **11** | +1 |
| `tsconfig.paymentService.json` include | 1 个文件 | **2 个文件** | +1 |

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 成功路径返回结构变化导致旧调用方 `result.data.x` 取值失败 | 错误路径仍为 ApiResponse<null>（兼容）；成功路径由 index.js 统一 toResponse 包装；单元测试覆盖 4 个 handler 全部成功路径 |
| tsc 编译产物代码可读性差 | 已加 /* eslint-disable */ 头部；CI 门禁 audit:s25-payment-pay-ts:strict 检查产物完整性 |
| CloudBaseQuery.update 类型缺失 | 已补齐 types.d.ts；同时 refund.ts 未来使用批量更新也将受益 |
| handleSuccess 调用方迁移遗漏 | 4 个 handler 全部迁移完成；audit:s25-payment-pay-ts:strict 检查 pay.ts 中无 handleSuccess 调用 |

## 8. 已知问题（需后续 Sprint 处理）

### 8.1 paymentService/services 仍有两个 .js 未迁移

- `notify.js`（181 行）：微信支付回调处理
- `commission.js`：佣金记录生成

这两个文件是 `pay.ts#confirmPayment` 内部用到的辅助模块（`require('./commission')`），可以纳入 Sprint 26 继续迁移。

### 8.2 orderService 仍未迁移

`cloudfunctions/orderService/orders.js`（959 行）和 `payment.js`（276 行）仍是 .js。Sprint 19 已将 service common/errors.js 收口为 re-export shim，TypeScript 化基础已就位；待 Sprint 26+ 按文件大小优先级迁移。

### 8.3 handleSuccess 残留点

Sprint 25 完成 paymentService 的迁移，但其他 service（orderService / mallService / activityService / feedingService 等）入口仍使用 handleSuccess。Sprint 26+ 系统化扫描并迁移。

## 9. 下一步（Sprint 26 计划）

1. **`paymentService/services/notify.js` → `notify.ts` 迁移**
   - 微信支付回调签名验证 + 订单状态机推进
2. **`paymentService/services/commission.js` → `commission.ts` 迁移**
   - 佣金记录生成（confirmPayment 调用）
3. **orderService/services 开始迁移**
   - `orders.js`（959 行）分阶段迁移，优先 handleSuccess → withErrorHandling 模式
4. **handleSuccess 残留点扫描**
   - 全 service 入口迁移到统一模式
5. **`TypeScript 迁移覆盖率`度量**
   - 维护 cloudfunctions/*/services/*.ts vs *.js 比例作为 CI 指标

**Sprint 25 完整收官。**
