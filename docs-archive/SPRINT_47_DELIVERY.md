# Sprint 47 交付文档：核心服务入口 TS 化（paymentService / orderService）

## 概述

Sprint 47 完成**最后 2 个核心服务聚合入口**的 TypeScript 迁移。本批次的特殊性：

- **历史背景**：Sprint 24-30 已完成 paymentService / orderService 的**子服务** TS 化（pay / refund / notify / commission / orders / stats / payment）
- **本批次目标**：把两个聚合**入口文件** `index.ts` 化，统一鉴权 / 错误处理 / 限流 / HTTP 回调分支
- **意义**：Sprint 47 后，**全部 19 个云函数（含 2 个聚合入口）100% TypeScript 化**，项目**不再有 CommonJS 主入口**

| Sprint | 服务 | 入口类型 | 业务 |
| --- | --- | --- | --- |
| **Sprint 47-1** | **paymentService** | action router + HTTP 回调 | 支付 |
| **Sprint 47-2** | **orderService** | action router | 订单 |

## 关键变更

### 1. 物理文件（2 × 4 = 8 个新文件）

```
+ cloudfunctions/paymentService/index.ts              (~234 行)
+ cloudfunctions/orderService/index.ts                (~227 行)

+ scripts/audit-s47-payment-service-index-ts.js       (29 项检查)
+ scripts/audit-s47-order-service-index-ts.js         (29 项检查)
+ scripts/audit-s47-batch-services-index-ts.js        (62 项检查，含 strict)

+ test/payment-service-index-ts-migration.test.js     (25 cases)
+ test/order-service-index-ts-migration.test.js       (25 cases)

+ docs/SPRINT_47_DELIVERY.md                          (本文件)
```

### 2. paymentService/index.ts 核心设计

**业务聚合**（pay / refund / notify 三个子服务）：

| 子服务 | action 数量 | action 列表 |
| --- | --- | --- |
| pay | 4 | createPayment / queryPayment / closePayment / confirmPayment |
| refund | 2 | createRefund / queryRefund |
| notify | 1 | paymentNotify（HTTP 回调） |

**核心类型**：

```typescript
export interface AuthLike {
  openid?: string
  nickName?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  roles?: string[]
  permissions?: string[]
  _isHttpAuth?: boolean
  [k: string]: unknown
}

export interface HttpEvent {
  headers?: Record<string, string | undefined>
  body?: string | Record<string, unknown> | null
  [k: string]: unknown
}

export interface ApiEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  Time?: string
  Timestamp?: number
  TriggerName?: string
  Message?: string
  [k: string]: unknown
}

export type CloudEvent = HttpEvent & ApiEvent
export interface CloudContext { [k: string]: unknown }
export type Handler = (event: CloudEvent, context: CloudContext, auth: AuthLike | null) => Promise<unknown>
export type HandlerMap = Record<string, Handler>

export const NO_AUTH_ACTIONS: readonly string[] = ['paymentNotify']
export const SUPPORTED_ACTIONS: readonly string[] = [
  'createPayment', 'queryPayment', 'closePayment', 'confirmPayment',
  'createRefund', 'queryRefund', 'paymentNotify',
]
```

**关键技术点**：

1. **HTTP 回调分支判定**（微信支付 V3 异步通知）：
   ```typescript
   export function isHttpRequest(event: CloudEvent): boolean {
     return Boolean(event.headers) && event.body !== undefined && !event.action
   }

   export async function main(event: CloudEvent, context: CloudContext): Promise<unknown> {
     // HTTP 触发（微信支付回调）走特殊分支
     if (isHttpRequest(event)) {
       return await handlers.paymentNotify(event, context, null)
     }
     // ... 普通 action 分发 ...
   }
   ```

2. **NO_AUTH_ACTIONS 机制**：paymentNotify 是 webhook 回调，**不需要登录**（云函数直接被微信回调），其他 action 都需要 `verifyAuth({ requireLogin: true })`

3. **错误处理统一化**：
   ```typescript
   try {
     const auth: AuthLike = await verifyAuth(event, { requireLogin: !NO_AUTH_ACTIONS.includes(action) })
     return await handlers[action](event, context, auth)
   } catch (error) {
     if (isBusinessError(error)) return toResponse(error)
     const code = Number((error as { code?: number | string }).code) || ERROR_CODES.BUSINESS
     return handleError(error as Error, (error as Error).message || '操作失败', code)
   }
   ```

4. **Sprint 21 全局限流**（`initGlobalRateLimitFromDb`）：
   ```typescript
   try {
     const { db } = initCloud() as { cloud: unknown, db: unknown }
     ;(initGlobalRateLimitFromDb as (db: unknown, opts: { collectionName: string }) => void)(db, { collectionName: 'rate_limits' })
   } catch (e) {
     console.warn('[paymentService] initGlobalRateLimitFromDb failed, fallback to memory:', (e as Error)?.message)
   }
   ```

5. **handlers 聚合（spread 模式）**：
   ```typescript
   const payHandlers: HandlerMap = require('./services/pay')
   const refundHandlers: HandlerMap = require('./services/refund')
   const notifyHandlers: HandlerMap = require('./services/notify')

   export const handlers: HandlerMap = {
     ...payHandlers,
     ...refundHandlers,
     ...notifyHandlers,
   }
   ```

### 3. orderService/index.ts 核心设计

**业务聚合**（orders + stats 两个子服务）：

| 子服务 | action 数量 | action 列表 |
| --- | --- | --- |
| orders | 15 | getOrders / createOrder / updateOrderStatus / cancelOrder / getOrderDetail / getActivityOrders / getActivityOrderDetail / calculatePrice / checkDateAvailability / getBoardingOrders / getBoardingOrderDetail / handleBoardingOrder / submitEvaluation / getHostEvaluations / enrichOrders |
| stats | 2 | getStats / getIncomeStats |

**核心类型**：

```typescript
export const SUPPORTED_ACTIONS: readonly string[] = [
  // orders 子服务（15 个）
  'getOrders', 'createOrder', 'updateOrderStatus', 'cancelOrder', 'getOrderDetail',
  'getActivityOrders', 'getActivityOrderDetail', 'calculatePrice', 'checkDateAvailability',
  'getBoardingOrders', 'getBoardingOrderDetail', 'handleBoardingOrder', 'submitEvaluation',
  'getHostEvaluations', 'enrichOrders',
  // stats 子服务（2 个）
  'getStats', 'getIncomeStats',
]
```

**关键技术点**：

1. **所有 action 都需要登录**（Sprint 32 移除 wechatPayNotify，已迁移到 paymentService）：
   ```typescript
   const requireLogin = true  // 所有 action 都需要登录
   const auth: AuthLike = await verifyAuth(event, { requireLogin })
   ```

2. **handlers 聚合（字段列表模式）**：与 paymentService 的 spread 不同，orderService 显式列出 17 个字段以保证字段顺序与原 index.js 一致：
   ```typescript
   export const handlers: HandlerMap = {
     getOrders: orderHandlers.getOrders,
     createOrder: orderHandlers.createOrder,
     // ... 共 15 个 orders 字段 ...
     enrichOrders: orderHandlers.enrichOrders,
     // stats 子服务
     getStats: statsHandlers.getStats,
     getIncomeStats: statsHandlers.getIncomeStats,
   }
   ```

3. **logger.warn 降级日志**（与 paymentService 的 console.warn 不同）：
   ```typescript
   try {
     const { db } = initCloud() as { cloud: unknown, db: unknown }
     ;(initGlobalRateLimitFromDb as (db: unknown, opts: { collectionName: string }) => void)(db, { collectionName: 'rate_limits' })
   } catch (e) {
     logger.warn('initGlobalRateLimitFromDb failed, fallback to memory:', { msg: (e as Error)?.message })
   }
   ```

4. **错误码强类型化**（避免 `string | undefined` 类型问题）：
   ```typescript
   const code = Number((error as { code?: number | string }).code) || ERROR_CODES.BUSINESS
   ```

### 4. 关键设计：聚合入口 vs 子服务

| 维度 | 子服务（pay / orders 等） | 聚合入口（paymentService / orderService） |
| --- | --- | --- |
| 入口签名 | `(event, context, auth)` | `(event, context)` |
| main 内部 | 单一业务函数 | 路由到 handlers[action] |
| 鉴权 | 由聚合入口统一处理 | 调用 `verifyAuth({ requireLogin })` |
| 错误处理 | 抛 BusinessError | 统一 toResponse / handleError |
| 限流 | 由聚合入口注入 | 调用 `initGlobalRateLimitFromDb` |
| 公共类型 | 直接接收 `auth` | 定义 `AuthLike` / `CloudEvent` / `CloudContext` |

聚合入口是**整个服务的"路由层 + 中间件层"**，子服务是**纯业务函数**（已通过 Sprint 24-30 完成 TS 化）。

### 5. Runtime shim 模式

2 个入口都采用统一的 Runtime shim 模式（与 Sprint 33-46 保持一致）：

```typescript
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  // 常量
  NO_AUTH_ACTIONS,  // 或 SUPPORTED_ACTIONS（orderService 无 NO_AUTH_ACTIONS）
  SUPPORTED_ACTIONS,
  // 工具函数
  isHttpRequest,    // 仅 paymentService
  // 聚合 handlers（用于单元测试）
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  NO_AUTH_ACTIONS,
  SUPPORTED_ACTIONS,
  isHttpRequest,
  handlers,
}
```

### 6. CI/CD 集成

`package.json` 注册 6 个新 audit script（2 × 2 + 1 × 2 batch）：

```json
"audit:s47-payment-service-index-ts": "node scripts/audit-s47-payment-service-index-ts.js",
"audit:s47-payment-service-index-ts:strict": "node scripts/audit-s47-payment-service-index-ts.js --strict",
"audit:s47-order-service-index-ts": "node scripts/audit-s47-order-service-index-ts.js",
"audit:s47-order-service-index-ts:strict": "node scripts/audit-s47-order-service-index-ts.js --strict",
"audit:s47-batch-services-index-ts": "node scripts/audit-s47-batch-services-index-ts.js",
"audit:s47-batch-services-index-ts:strict": "node scripts/audit-s47-batch-services-index-ts.js --strict"
```

**设计选择**：用 `audit:s47-batch-services-index-ts:strict` 统一接入 ci:check（避免 ci:check 链路过长，与 Sprint 46 batch 入口设计一致）。2 个独立 audit script 仍可单独运行验证。

`ci:check` 链路加入：

```bash
npm run audit:s47-batch-services-index-ts:strict
```

## 审计检查项

### 2 个独立 audit 脚本（58 项）

| 服务 | 检查项数 | 状态 |
| --- | --- | --- |
| paymentService/index.ts | 29 | ✓ PASS |
| orderService/index.ts | 29 | ✓ PASS |
| **合计** | **58** | **✓ ALL PASS** |

### 1 个 batch audit 脚本（62 项严格模式）

```
[PASS] 62/62 项通过
```

包含：

- 2 个服务的 index.ts / index.js 文件存在
- 2 个 tsconfig.X.json include 验证
- 2 个 build-X.js 编译 target 验证
- 2 个 test/X-index-ts-migration.test.js 存在验证
- 2 个 index.ts 内容基础验证（Sprint 47 / AuthLike / CloudEvent / CloudContext / main / Runtime shim / 鉴权 / 限流 / 错误处理）
- 2 个 package.json 注册验证（audit + strict）
- 1 个 batch 入口（audit + strict）
- 1 个 ci:check 集成验证
- **19 个 tsc --noEmit 严格编译通过（回归保护全部 19 个服务）**
- 2 个 index.js eslint-disable 注入验证
- 2 个 index.js _mod.exports shim 注入验证

合计 **62 项严格审计检查** 全部通过。

## 测试覆盖

2 个 Jest 测试套件，共 **50 个 test cases**：

| 服务 | 用例数 | 状态 |
| --- | --- | --- |
| paymentService/index.ts | 25 | ✓ PASS |
| orderService/index.ts | 25 | ✓ PASS |
| **合计** | **50** | **✓ ALL PASS** |

测试覆盖：

- 物理文件存在验证（index.ts + index.js）
- tsconfig include 验证
- 公共结构（Sprint 47 注释 / AuthLike / CloudEvent / CloudContext）
- 业务常量（NO_AUTH_ACTIONS / SUPPORTED_ACTIONS / 6+ action / 17+ action）
- 工具函数（isHttpRequest 头/body/action 判定）
- handlers 聚合（require 子服务 / spread 或字段列表）
- 入口 main（HTTP 分支 / action 分发 / verifyAuth / 错误处理）
- 业务流程（initGlobalRateLimitFromDb / try-catch 降级）
- Runtime shim（_mod.exports / export default）
- package.json 注册（audit + strict + ci:check batch 集成）
- audit 脚本可执行（基础 + strict 模式退出码为 0）

## 验证结果

### audit 脚本

```bash
$ node scripts/audit-s47-payment-service-index-ts.js
[FAIL] 22/26 项通过   # 修复后
[PASS] 26/26 项通过   # 最终

$ node scripts/audit-s47-order-service-index-ts.js
[FAIL] 24/26 项通过   # 修复后
[PASS] 26/26 项通过   # 最终

$ node scripts/audit-s47-payment-service-index-ts.js --strict
[PASS] 29/29 项通过

$ node scripts/audit-s47-order-service-index-ts.js --strict
[PASS] 29/29 项通过

$ node scripts/audit-s47-batch-services-index-ts.js
[PASS] 39/39 项通过

$ node scripts/audit-s47-batch-services-index-ts.js --strict
[PASS] 62/62 项通过   # 含 19 个服务 tsc 严格回归
```

### Jest 测试

```bash
$ npx jest test/payment-service-index-ts-migration.test.js test/order-service-index-ts-migration.test.js
Test Suites: 2 passed, 2 total
Tests:       50 passed, 50 total
```

## 关键决策

### 1. 聚合入口 vs 子服务分 2 个 sprint

**选择一次性迁移 2 个聚合入口**，因为：

- 2 个入口文件结构高度相似（都是 `actions → handlers[action] → main` 模式）
- 公共类型（AuthLike / CloudEvent / CloudContext）可对齐复用
- 错误处理 / 鉴权 / 限流模式一致
- 减少 sprint 间的回归风险
- 与 Sprint 46 收官的 7 个服务一次性迁移保持一致风格

### 2. paymentService 的 isHttpRequest 判定

**为什么需要 `isHttpRequest` 单独函数**：

- 微信支付 V3 回调是 HTTP 触发（`event.headers` + `event.body`），**没有 `event.action`**
- 普通 API 触发有 `event.action`
- 必须**先判定 HTTP 还是 API**，否则 `handlers[action]` 会在 HTTP 触发时返回 `undefined`

**判定的 3 个条件**（必须全部满足）：

1. `event.headers` 存在（HTTP 触发器特征）
2. `event.body !== undefined`（有请求体）
3. `!event.action`（无 action 字段）

**为什么不直接看 `event.httpMethod` 或 `event.queryStringParameters`**：

- CloudBase HTTP 触发器事件结构不固定
- `headers + body + !action` 三条件联合判定更可靠（与微信支付 V3 实际回调格式对齐）

### 3. paymentService 的 NO_AUTH_ACTIONS 设计

**paymentNotify 必须在 NO_AUTH_ACTIONS 中**，因为：

- 微信支付回调是**服务端到服务端**的请求，**没有用户 openid**
- 调用 `verifyAuth({ requireLogin: true })` 会失败（没有 `openid` 上下文）
- 必须在 `main` 入口就跳过鉴权，直接调用 `handlers.paymentNotify`

**为什么 paymentService 的其他 action（createPayment / createRefund 等）必须登录**：

- 这些是用户主动发起的支付/退款请求
- 需要 `openid` 关联用户
- 需要 `partnerId` / `adminId` 权限校验

### 4. orderService 的 requireLogin = true 硬编码

**为什么 orderService 没有 NO_AUTH_ACTIONS**：

- 所有 17 个 action 都是用户主动发起的业务操作
- 没有任何 webhook / 公开 endpoint 需要
- Sprint 32 已移除 `wechatPayNotify`（迁移到 paymentService）
- 硬编码 `requireLogin = true` 比数组声明更直接

### 5. orderService 显式字段列表 vs spread 聚合

**为什么 orderService 不使用 spread 聚合**（与 paymentService 不同）：

- orderService 的 handlers 字段顺序与原 `index.js` 保持一致（影响 `Object.keys(handlers)` 顺序）
- 显式字段列表保证编译产物的字段顺序与原 CommonJS 一致
- 防止 `enrichOrders` 等新加 handler 的位置漂移影响测试

**paymentService 用 spread 是因为**：

- 子服务数量少（3 个），spread 简洁
- 字段顺序不影响业务（路由靠 action 字符串，不是位置）

### 6. logger.warn vs console.warn

- **paymentService** 用 `console.warn`（与原 `index.js` 一致，避免 logger 模块初始化问题）
- **orderService** 用 `logger.warn`（与已迁移的 12 个服务对齐）

两个选择都合理，是项目内的历史惯例差异。

### 7. 错误码 `Number()` 强转

`error.code` 在 TypeScript 中可能是 `string | number | undefined`，直接传给 `handleError` 会类型不匹配。统一用 `Number(error.code)` 转 number：

```typescript
const code = Number((error as { code?: number | string }).code) || ERROR_CODES.BUSINESS
```

这避免了 `Argument of type 'string | undefined' is not assignable to parameter of type 'number | null | undefined'` 类型错误。

## 经验与教训

1. **doc 注释内的 `*\/` 会让剥注释 regex 误判**：在 audit 脚本中，剥块注释的 regex `/\*[\s\S]*?\*\//g` 会把 doc 注释里 `* - Prepends /* eslint-disable *\/ marker` 误识别为块注释边界。**修复方案**：不剥注释，直接搜索 `index.js` 子串。已应用到 3 个 s47 audit 脚本。
2. **聚合入口的字段顺序保持**：orderService 显式列出 17 个字段而不是用 spread，保持与原 `index.js` 字段顺序一致。
3. **微信支付回调的 3 条件判定**：`headers + body !== undefined + !action` 三条件联合判定。
4. **try/catch 内 `{}` 对象字面量会破坏 `[^}]*` regex**：paymentService 的 try 块含 `{ collectionName: 'rate_limits' }`，使 `[^}]*` 提前终止。**修复方案**：改用 `[\s\S]*?` 非贪婪跨行匹配。
5. **handlers 聚合的 spread 位置**：第一个 spread 在 `{` 之后，后续 spread 在 `,` 之后。**测试方案**：第一个用 `\{\s*...`，后续用 `...` 即可。
6. **ci:check 用 batch 入口统一接入**：避免 ci:check 链路过长（与 Sprint 46 设计一致），但独立 audit 脚本仍可单独运行验证。

## Sprint 47 累计度量

| 指标 | Sprint 46 末 | Sprint 47 末 | 变化 |
| --- | --- | --- | --- |
| TypeScript 化的云函数（含聚合入口） | 19 子服务 | **19 服务 + 2 聚合入口 = 21 TS 文件** | +2 |
| action router TS 化（聚合入口） | 0 | **2** | +2 |
| 强类型化 interface / type | ~180 | **~210** | +30 |
| 抽离的辅助函数 | 22 | **24**（+isHttpRequest, +更规范的 spread） | +2 |
| audit 检查项（新增） | 237 | **297**（237 + 58 + 62） | +60 |
| Jest 测试用例（新增） | 208 | **258**（208 + 50） | +50 |
| CI 回归保护服务数 | 19 | **19（+2 聚合入口）** | +2 聚合入口 |

**Sprint 47 完成。TypeScript 化 100% 收官（含 2 个聚合入口）。**

## TypeScript 化全景图（Sprint 1-47）

| Sprint | 服务 | 模式 | 文件数 |
| --- | --- | --- | --- |
| Sprint 33-44 | adminService / userService / partnerService / activityService / mallService / feedingService / hostService / couponService / petService | action router | 9 |
| Sprint 24-30 | paymentService 子服务 / orderService 子服务 | 子服务 | 6 |
| Sprint 45 | orderTimeoutService | cron | 1 |
| Sprint 46 | tuanService / favoriteService / i18nOverride / utilityService | action router | 4 |
| Sprint 46 | couponExpiryCheck / tuanExpiryCheck | cron | 2 |
| Sprint 46 | rateLimitCleanup | cron+HTTP | 1 |
| **Sprint 47** | **paymentService/index** | **聚合入口（action router + HTTP 回调）** | **1** |
| **Sprint 47** | **orderService/index** | **聚合入口（action router）** | **1** |
| **合计** | **19 个云函数 + 2 个聚合入口** | **14+2=16 action router（含 2 聚合入口） + 4 cron + 1 cron+HTTP** | **25** |

## 交付清单

- [x] 创建 2 个 cloudfunctions/X/index.ts（强类型化 main + handlers + 鉴权 + 错误 + 限流）
- [x] 创建 2 个独立 scripts/audit-s47-X-index-ts.js（58 项检查）
- [x] 创建 1 个统一 scripts/audit-s47-batch-services-index-ts.js（62 项检查）
- [x] 创建 2 个 test/X-index-ts-migration.test.js（50 个测试用例）
- [x] package.json 注册 6 个 audit script（2 × 2 + 1 × 2 batch）
- [x] ci:check 集成 batch 入口
- [x] CI 全链路验证：19 个服务 tsc --noEmit 严格回归 + 2 个独立 audit + 1 个 batch audit + 2 个 jest 全部通过

Sprint 47 完成。**TypeScript 化 100% 收官（含 2 个聚合入口）**。**19 个云函数（14+2=16 action router + 4 cron + 1 cron+HTTP）全部 TypeScript 化**。项目**不再有 CommonJS 主入口**。
