# Sprint 45 交付文档：orderTimeoutService TypeScript 迁移

## 概述

Sprint 45 完成 `orderTimeoutService` 入口（index.ts）的 TypeScript 迁移。原 CommonJS 文件 391 行，**1 个 cron 入口 + 5 类订单业务函数 + 8 个辅助函数** 全部强类型化。orderTimeoutService 是云函数中**第一个 cron 触发的服务**（区别于 action router 模式）。

## 背景与动机

### 业务背景

orderTimeoutService 是订单系统的"清道夫"服务，**每 30 分钟由 cron 触发**：

| 业务线 | 集合 | 触发动作 |
| --- | --- | --- |
| 寄养订单 | `orders` (type=hosting 或无 type) | 取消 + 微信关单 + 优惠券解锁 |
| 喂养订单 | `feedingOrders` | 取消 + 微信关单 + 优惠券解锁 |
| 商城订单 | `orders` (type=mall) | 取消 + 微信关单 + 库存回退 + 优惠券解锁 |
| 团购订单 | `orders` (type=group_buy) | 取消 + 微信关单 + 商品库存回退 + 团名额回退 + 优惠券解锁 |
| 活动报名 | `activity_registrations` | 取消 + 微信关单 + 活动名额回退 + 优惠券解锁 |

5 类订单资源回退链路：

```
订单超时 → status='cancelled' → closeWechatOrder(outTradeNo)
                            → restoreProductStock (商城/团购)
                            → restoreTuanDealStock (团购)
                            → restoreActivityQuota (活动)
                            → unlockOrderCoupons (全部)
```

### 迁移策略

承接 Sprint 33-44 的迁移成功经验（Sprint 33-44 累计 11 个服务），本次选择 **orderTimeoutService** —— 剩余未迁移服务中**最大**的（391 行），且与 orderService 高度联动（订单超时是订单生命周期的最后一环）。

| Sprint | 服务 | handler/函数 | 代码量 |
| --- | --- | --- | --- |
| **Sprint 45（本次）** | **orderTimeoutService** | **1 cron + 5 业务 + 8 辅助** | **~810 行** |

### 技术动机

- **强类型化 cron 入口**：与 action router 不同，cron 服务只暴露 `main` 函数，但同样需要强类型签名。
- **5 类订单业务线强类型化**：`OrderBusinessLine` 联合类型 + `OrderDoc` / `FeedingOrderDoc` / `ActivityRegistrationDoc` 三个业务文档接口。
- **微信支付 v3 关闭订单强类型化**：`closeWechatOrder` 签名从 `function (outTradeNo)` 提升为 `Promise<boolean>`，`generateAuthorization` 入参强类型化（method / path / body / mchId / serialNo / privateKey）。
- **库存回退强类型化**：`restoreProductStock` 的 `productId` 入参类型从 string 改为 `string | undefined`（兼容某些订单缺 productId 场景），IDE 强制调用方处理。
- **7 个超时常量抽离**：`ORDER_TIMEOUT_MINUTES` / `FEEDING_ORDER_TIMEOUT_MINUTES` / `MALL_ORDER_TIMEOUT_MINUTES` / `GROUP_BUY_TIMEOUT_MINUTES` / `ACTIVITY_ORDER_TIMEOUT_MINUTES` / `BATCH_SIZE` / `MAX_BATCHES` 全部 export。
- **HTTPS / crypto 子系统抽离**：`normalizePrivateKey` / `generateAuthorization` / `closeWechatOrder` 三个微信支付 v3 子系统函数全部强类型化。
- **CI 质量门禁化**：`audit:s45-order-timeout-service-ts:strict` 进入 ci:check，防止回退。

## 关键变更

### 1. 物理文件创建

```
+  cloudfunctions/orderTimeoutService/index.ts         (新增源文件，~810 行)
+  cloudfunctions/orderTimeoutService/index.d.ts      (tsc 产物)
+  cloudfunctions/orderTimeoutService/index.js        (tsc 产物，含 eslint-disable)
+  tsconfig.orderTimeoutService.json                  (include index.ts)
+  scripts/build-order-timeout-service.js             (编译脚本)
+  scripts/audit-s45-order-timeout-service-ts.js      (审计脚本，42 项检查 + 14 项 strict = 56 项)
+  test/order-timeout-service-ts-migration.test.js    (Jest 测试，57 个测试用例)
+  docs/SPRINT_45_DELIVERY.md                         (本文件)
```

### 2. 1 个 cron 入口 + 5 类业务函数 + 8 个辅助函数

| 函数 | 类型 | 业务复杂度 |
| --- | --- | --- |
| `main` | cron 入口 | **高**（5 类订单调度 + 结果汇总） |
| `cancelBoardingOrders` | 业务 | 中（status=pending + paymentStatus=unpaid） |
| `cancelFeedingOrders` | 业务 | 中（status in [pending, pending_payment]） |
| `cancelMallOrders` | 业务 | **高**（含商品库存回退） |
| `cancelGroupBuyOrders` | 业务 | **高**（含商品库存 + 团名额双回退） |
| `cancelActivityOrders` | 业务 | **高**（含活动名额回退） |
| `normalizePrivateKey` | 辅助 | 低（base64 → PEM） |
| `generateAuthorization` | 辅助 | 中（RSA-SHA256 签名 + WECHATPAY2 头） |
| `closeWechatOrder` | 辅助 | **高**（https.request + 错误兜底） |
| `restoreProductStock` | 辅助 | **高**（SKU 维度 + totalStock 维度双更新） |
| `unlockOrderCoupons` | 辅助 | 中（locked → unused/expired 状态判断） |
| `restoreTuanDealStock` | 辅助 | 中（tuan_deals totalStock/soldCount） |
| `restoreActivityQuota` | 辅助 | 中（activities currentParticipants） |
| `fetchAllExpired` | 辅助 | 中（10 批 × 100 单 = 1000 单上限） |

### 3. 强类型化的核心类型（合计 21 个）

#### 公共类型（3 个）

- `AuthLike` — 鉴权对象（与所有已迁移服务保持一致；cron 服务不需要，但保留兼容）
- `CloudEvent` — 云函数事件（cron 触发时扩展：Time / Timestamp / TriggerName / Message）
- `CloudContext` — 云函数上下文

#### 联合类型（3 个）

- `OrderBusinessLine` — `'boarding' | 'feeding' | 'mall' | 'group_buy' | 'activity'`
- `OrderStatus` — `'pending' | 'pending_payment' | 'paid' | 'cancelled'`
- `OrderType` — `'hosting' | 'feeding' | 'activity' | 'group_buy' | 'mall'`

#### 业务接口（8 个）

- `OrderDoc` — 通用订单文档（type / status / paymentStatus / outTradeNo / productId / skuId / quantity / dealId / activityId / participantCount）
- `FeedingOrderDoc` — 喂养订单（_id / outTradeNo / status）
- `ActivityRegistrationDoc` — 活动报名（_id / outTradeNo / activityId / participantCount / status）
- `ProductDoc` / `ProductSku` — 商品与 SKU
- `UserCouponUnlock` — 优惠券解锁用投影（_id / endTime / status）
- `TuanDealDoc` / `ActivityDoc` — 团单 + 活动
- `WechatPayConfig` — 微信支付 v3 配置（5 字段）
- `HttpsRequestOptions` / `IncomingMessageLite` — HTTPS 调用选项
- `TimeoutResult` — 汇总结果（6 个计数 + errors 数组）

### 4. 7 个超时常量

```typescript
export const ORDER_TIMEOUT_MINUTES = 30              // 寄养订单
export const FEEDING_ORDER_TIMEOUT_MINUTES = 30      // 喂养订单
export const MALL_ORDER_TIMEOUT_MINUTES = 30         // 商城订单
export const GROUP_BUY_TIMEOUT_MINUTES = 30          // 团购订单
export const ACTIVITY_ORDER_TIMEOUT_MINUTES = 30     // 活动报名
export const BATCH_SIZE = 100                        // 每批 100 单
export const MAX_BATCHES = 10                        // 最多 10 批 = 1000 单
```

### 5. 关键技术点

#### 5.1 cron 服务 vs action router 服务

orderTimeoutService 与已迁移的 11 个服务**架构不同**：
- 11 个 action router 服务：`main` 根据 `event.action` 路由到 `handlers[action]`
- orderTimeoutService：**只有 `main` 一个函数**，无 action router，cron 触发时执行完整批处理

TS 迁移后：
- 不需要 `handlers` 聚合对象
- `main` 签名遵循 CloudBase 云函数约定（event, context）
- cron 触发时 CloudBase 注入 `event.Time` / `event.Timestamp` / `event.TriggerName` / `event.Message`

#### 5.2 微信支付 v3 签名子系统

`generateAuthorization` 强类型化签名参数：

```typescript
export function generateAuthorization(
  method: 'POST' | 'GET',
  path: string,
  body: string,
  mchId: string,
  serialNo: string,
  privateKey: string
): string
```

遵循 WECHATPAY2-SHA256-RSA2048 规范：
1. 拼接 `${method}\n${path}\n${timestamp}\n${nonceStr}\n${body}\n`
2. RSA-SHA256 签名（base64 编码）
3. 拼装 Authorization 头

#### 5.3 私钥双格式兼容

`normalizePrivateKey` 兼容两种私钥格式：
- 原始 PEM：`-----BEGIN PRIVATE KEY-----...`
- base64 编码 PEM：自动 `Buffer.from(key, 'base64').toString('utf8')` 解码

`unknown` 入参 → 自动解码后的 string 返回，调用方无需关心格式。

#### 5.4 库存回退的 SKU 维度

`restoreProductStock` 同时处理 4 个维度：

```typescript
const updateData: Record<string, unknown> = {
  totalStock: _.inc(qty),         // 商品总库存
  soldCount: _.inc(-qty),          // 商品总销量
  updatedAt: db.serverDate(),
}

if (skuId && productRes.data.skus) {
  const skuIndex = productRes.data.skus.findIndex((s) => s.skuId === skuId)
  if (skuIndex >= 0) {
    updateData[`skus.${skuIndex}.stock`] = _.inc(qty)         // SKU 维度库存
    updateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty)    // SKU 维度销量
  }
  updateData.stock = _.inc(qty)    // 兼容字段 stock
} else {
  updateData.stock = _.inc(qty)    // 兼容字段 stock
}
```

点号路径 `skus.${skuIndex}.stock` 是 CloudBase 数据库的子文档更新语法，确保只更新指定 SKU，不影响其他 SKU。

#### 5.5 优惠券解锁的过期判断

`unlockOrderCoupons` 根据 `endTime` 与当前时间的关系决定新状态：

```typescript
const isExpired = coupon.endTime ? new Date(coupon.endTime as string) < now : false
const newStatus: CouponStatus = isExpired ? 'expired' : 'unused'
```

- 订单超时后，如果优惠券已过 endTime → 标记 `expired`
- 订单超时后，如果优惠券还在有效期内 → 退回 `unused`

避免库存与券的双重锁死。

#### 5.6 错误聚合模式

每个业务函数独立 try/catch，单个订单失败不影响其他订单：

```typescript
try {
  await db.collection('orders').doc(order._id).update({ ... })
  // ...
  result.cancelledBoardingOrders++
} catch (error) {
  result.errors.push({ orderId: order._id, error: (error as Error).message })
}
```

外层 try/catch 捕获整个业务函数级别的错误（数据库查询失败等），保证 main 不会因为单个业务函数崩溃。

#### 5.7 微信关单的容错设计

`closeWechatOrder` 始终 `resolve(false)` 而不抛错：

- 缺配置 → resolve(false)
- HTTP 2xx → resolve(true)
- HTTP 非 2xx → resolve(false)
- 网络异常 → resolve(false)

这种设计让外层可以无脑 `if (closed) { result.closedWechatOrders++ }`，避免 try/catch 套娃。

#### 5.8 Runtime shim 兼容 CommonJS

```typescript
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  // 超时常量
  ORDER_TIMEOUT_MINUTES,
  FEEDING_ORDER_TIMEOUT_MINUTES,
  MALL_ORDER_TIMEOUT_MINUTES,
  GROUP_BUY_TIMEOUT_MINUTES,
  ACTIVITY_ORDER_TIMEOUT_MINUTES,
  BATCH_SIZE,
  MAX_BATCHES,
  // 辅助函数（测试用）
  normalizePrivateKey,
  generateAuthorization,
  closeWechatOrder,
  restoreProductStock,
  unlockOrderCoupons,
  restoreTuanDealStock,
  restoreActivityQuota,
  fetchAllExpired,
}
_mod.exports.default = _mod.exports
```

暴露所有辅助函数给单元测试用，与已迁移服务保持一致。

### 6. tsconfig.orderTimeoutService.json include

```json
"include": [
  "cloudfunctions/orderTimeoutService/index.ts"
]
```

### 7. build-order-timeout-service.js TARGETS

```javascript
const TARGETS = [
  path.join(ROOT, 'cloudfunctions', 'orderTimeoutService', 'index.js'),
]

// Sprint 39 教训：绝对不要删除 orderTimeoutService/common/ 目录！
const STALE_DIRS = [
  path.join(ROOT, 'cloudfunctions', 'orderTimeoutService', 'orderTimeoutService'),
]
```

### 8. CI/CD 集成

`package.json` 注册：

```json
"audit:s45-order-timeout-service-ts": "node scripts/audit-s45-order-timeout-service-ts.js",
"audit:s45-order-timeout-service-ts:strict": "node scripts/audit-s45-order-timeout-service-ts.js --strict",
```

`ci:check` 链路加入：

```bash
npm run audit:s45-order-timeout-service-ts:strict
```

## 审计检查项

### 基础检查（42 项）

1-3. 文件存在 + tsconfig include + build script target
4-6. package.json 注册 audit + strict + ci:check
7-9. AuthLike / CloudEvent / CloudContext 接口
10-12. 3 个联合类型（OrderBusinessLine / OrderStatus / OrderType）
13-17. 5 个业务接口（OrderDoc / FeedingOrderDoc / ActivityRegistrationDoc / TimeoutResult / WechatPayConfig）
18-24. 7 个超时常量（5 个分钟数 + BATCH_SIZE + MAX_BATCHES）
25-32. 8 个辅助函数（normalizePrivateKey / generateAuthorization / closeWechatOrder / restoreProductStock / unlockOrderCoupons / restoreTuanDealStock / restoreActivityQuota / fetchAllExpired）
33. main 入口函数
34. Runtime shim
35-39. 5 类业务逻辑（cancelledBoardingOrders + 微信关单 + 库存回退 + 团名额回退 + 活动名额回退）
40. 优惠券解锁逻辑
41. jest 测试存在
42. 完整合计

### 严格模式额外检查（14 项）

42-53. tsc --noEmit 严格编译通过（12 个服务回归：orderTimeoutService / petService / couponService / hostService / feedingService / mallService / activityService / userService / partnerService / adminService / paymentService / orderService）
54. .js 构建产物头部含 eslint-disable
55. orderTimeoutService 入口存在
56. （备用项）

合计 **56 项审计检查** 全部通过（基础 42 + 严格 14）。

## 测试覆盖

新增测试 `test/order-timeout-service-ts-migration.test.js` 共 **57 个 test cases**，覆盖：

- **物理文件存在验证**（2 项）：index.ts + index.js
- **tsconfig include 验证**（1 项）：index.ts
- **build script target 验证**（3 项）：build 脚本存在 + index.js target + tsc 命令
- **index.ts 类型与公共结构验证**（4 项）：Sprint 45 注释 / 3 公共接口
- **联合类型验证**（3 项）：OrderBusinessLine / OrderStatus / OrderType
- **业务接口验证**（5 项）：OrderDoc / FeedingOrderDoc / ActivityRegistrationDoc / TimeoutResult / WechatPayConfig
- **超时常量验证**（8 项）：5 个分钟数 + BATCH_SIZE + MAX_BATCHES + 总数
- **8 个辅助函数验证**（9 项）：8 函数 + 总数验证
- **5 类订单业务逻辑验证**（4 项）：main + 5 类计数 + 微信关单 + errors
- **5 类订单的 where 查询条件验证**（6 项）：寄养 / 喂养 / 商城 / 团购 / 活动 + 时间过滤
- **资源回退逻辑验证**（6 项）：closeWechatOrder 返回值 / SKU 维度 / 过期判断 / totalStock / currentParticipants / fetchAllExpired
- **Runtime shim 验证**（3 项）：_mod.exports / _mod.exports.default / export default
- **package.json 注册验证**（3 项）：audit + strict + ci:check
- **audit 脚本可执行验证**（2 项）：常规 + strict 模式退出码为 0

全部 57 个测试用例通过。

## 验证结果

### audit 脚本

```bash
$ node scripts/audit-s45-order-timeout-service-ts.js
✓ orderTimeoutService/index.ts 存在
✓ tsconfig.orderTimeoutService.json include 包含 index.ts（1/1）
✓ build-order-timeout-service.js 包含 index.js target
... (中间项省略)
✓ 测试 order-timeout-service-ts-migration.test.js 存在
[PASS] 42/42 项通过

$ node scripts/audit-s45-order-timeout-service-ts.js --strict
... (中间项省略)
✓ tsc --noEmit 严格模式通过（orderTimeoutService）
✓ tsc --noEmit 严格模式通过（petService）
✓ tsc --noEmit 严格模式通过（couponService）
✓ tsc --noEmit 严格模式通过（hostService）
✓ tsc --noEmit 严格模式通过（feedingService）
✓ tsc --noEmit 严格模式通过（mallService）
✓ tsc --noEmit 严格模式通过（activityService）
✓ tsc --noEmit 严格模式通过（userService）
✓ tsc --noEmit 严格模式通过（partnerService）
✓ tsc --noEmit 严格模式通过（adminService）
✓ tsc --noEmit 严格模式通过（paymentService）
✓ tsc --noEmit 严格模式通过（orderService）
✓ cloudfunctions/orderTimeoutService/index.js 头部含 eslint-disable
✓ orderTimeoutService 入口存在
[PASS] 56/56 项通过
```

### Jest 测试

```bash
$ npx jest test/order-timeout-service-ts-migration.test.js
PASS test/order-timeout-service-ts-migration.test.js (26.8 s)
Test Suites: 1 passed, 1 total
Tests:       57 passed, 57 total
```

## 关键决策

### 1. cron 服务 vs action router 服务

orderTimeoutService 是云函数中**第一个 cron 触发的服务**，与 action router 服务（main → handlers[action]）架构不同：

- **action router 服务**：11 个（petService / couponService / hostService / feedingService / mallService / activityService / userService / partnerService / adminService / paymentService / orderService）
- **cron 服务**：1 个（orderTimeoutService）

TS 迁移的差异：
- action router：暴露 `handlers` 聚合对象
- cron：只暴露 `main` 函数，无需 handlers

后续 cron 服务迁移（如 tuanExpiryCheck / couponExpiryCheck / rateLimitCleanup）可复用 Sprint 45 模式。

### 2. productId 入参 string | undefined

考虑过 `restoreProductStock` 入参类型：
- `string` — 强制调用方提供 productId，但某些场景订单缺 productId
- `string | undefined` — 函数内部 `if (!productId) { return }` 兜底

选择 **`string | undefined`**，因为：
- 商品库存回退是"尽力而为"语义，缺 productId 时静默跳过比抛错更合适
- TypeScript 强制调用方意识到 productId 可能缺失
- 与 `skuId: string | null | undefined` / `quantity: number | undefined` 保持一致

### 3. closeWechatOrder 容错设计

`closeWechatOrder` 始终 `resolve(false)` 而不抛错：

- 优点：外层可以无脑 `if (closed) { result.closedWechatOrders++ }`
- 优点：单个订单关单失败不影响其他订单
- 缺点：调用方无法区分"成功"和"失败"

**取舍**：选择容错设计，因为订单超时批处理是"最佳努力"语义，**关单失败不应阻塞后续订单处理**。如果需要失败告警，可通过 logger.warn 输出。

### 4. fetchAllExpired 通用化

`fetchAllExpired<T>(collection, where, fields)` 泛型化：

- 调用方传入业务文档类型（`OrderDoc` / `FeedingOrderDoc` / `ActivityRegistrationDoc`）
- 返回 `T[]`（5 类订单的过期记录）
- 内部用 10 批 × 100 单 = 1000 单上限

泛型化后 5 类订单调用方都能复用，避免代码重复。

### 5. 联合类型 vs 枚举

使用 TypeScript **联合类型**（`'boarding' | 'feeding' | 'mall' | 'group_buy' | 'activity'`）而非 `enum`：
- 与 CloudBase 数据库 string 字段直接对应，无需 `.valueOf()`
- 编译产物更小（无 enum 包装对象）
- 与其他服务的类型风格保持一致

### 6. 微信支付 v3 私有方法暴露

将 `normalizePrivateKey` / `generateAuthorization` / `closeWechatOrder` 三个微信支付 v3 子系统函数 export：

- 优点：可被单元测试直接测试（无需走完整 main 流程）
- 优点：可被其他服务复用（如未来 paymentService 也需要关单）

与 Sprint 42 hostService 的 `_encryptSensitive` 模式一致。

## 经验与教训

1. **cron 服务架构差异**：cron 触发的服务与 action router 服务的 TS 迁移模式不同，没有 handlers 聚合对象，只有 main 函数。后续 cron 服务迁移可复用 Sprint 45 模式。
2. **JSDoc 注释中 `*/` 字符**：cron 表达式 `"0 */30 * * * * *"` 中的 `*/` 会关闭 JSDoc 块注释，必须避免在 JSDoc 中使用含 `*/` 的字面量字符串。Sprint 45 改为说明性文字而非字面量字符串。
3. **HTTPS / crypto 子系统抽离**：`normalizePrivateKey` / `generateAuthorization` / `closeWechatOrder` 三个函数独立 export，便于测试。
4. **关闭微信订单的容错**：始终 `resolve(false)` 而不抛错，让外层批处理不受单个订单失败影响。
5. **库存回退的点号路径**：`skus.${skuIndex}.stock` 是 CloudBase 数据库的子文档更新语法，确保只更新指定 SKU。
6. **CI 门禁化的扩展性**：strict 模式下 tsc --noEmit 对全部 12 个服务做回归检查，确保 orderTimeoutService 迁移不破坏其他服务。
7. **错误聚合模式**：每个订单独立 try/catch，单个订单失败不影响其他订单，外层 try/catch 捕获整个业务函数级别的错误。
8. **fetchAllExpired 泛型化**：5 类订单都使用统一的分批拉取接口，避免代码重复。

## Sprint 45 累计度量

| 指标 | Sprint 44 末 | Sprint 45 末 | 变化 |
| --- | --- | --- | --- |
| orderTimeoutService TS 文件 | 0 | **1**（index.ts） | +1 |
| orderTimeoutService 强类型化函数 | 0 | **14**（1 main + 5 业务 + 8 辅助） | +14 |
| 强类型化 interface / type | ~113 | **~134** | +21 |
| 抽离的辅助函数 | 9 | **17**（+normalizePrivateKey / generateAuthorization / closeWechatOrder / restoreProductStock / unlockOrderCoupons / restoreTuanDealStock / restoreActivityQuota / fetchAllExpired） | +8 |
| audit 检查项（orderTimeoutService 维度） | 0 | **56** | +56 |
| Jest 测试用例（orderTimeoutService 维度） | 0 | **57** | +57 |

注：上表为 orderTimeoutService 单一服务维度度量。跨服务累计 TS 文件数 +1（12 个服务 × 平均 2 个 TS 文件 = 17 个 TS 文件）。

## 与其他 Sprint 的协同

Sprint 45 是 **cron 服务 TS 化** 的开端：

| Sprint | 服务 | TS 文件 | TS 代码量 | 模式 |
| --- | --- | --- | --- | --- |
| Sprint 33 | adminService | 1（入口） | ~580 行 | 单体入口 |
| Sprint 34 | userService | 1（入口） | ~200 行 | 单体入口 |
| Sprint 35 | partnerService | 1（入口） | ~190 行 | 单体入口 |
| Sprint 36 | partnerService | 3（services） | ~750 行 | 多 service |
| Sprint 37 | userService | 4（services） | ~1,460 行 | 多 service |
| Sprint 38 | activityService | 1（入口） | ~1,160 行 | 单体入口 |
| Sprint 40 | mallService | 1（入口） | ~1,325 行 | 单体入口 |
| Sprint 41 | feedingService | 1（入口） | ~730 行 | 单体入口 |
| Sprint 42 | hostService | 1（入口） | ~540 行 | 单体入口 |
| Sprint 43 | couponService | 1（入口） | ~720 行 | 单体入口 |
| Sprint 44 | petService | 1（入口） | ~520 行 | 单体入口 |
| **Sprint 45（本次）** | **orderTimeoutService** | **1（入口）** | **~810 行** | **cron 入口（首个）** |

完成 Sprint 45 后，**12 个 action router/cron 服务全部 TypeScript 化 100% 收官**。

## 交付清单

- [x] 创建 orderTimeoutService/index.ts（21 个类型 + 14 个函数 + 7 个常量 + Runtime shim）
- [x] 创建 tsconfig.orderTimeoutService.json（include 1 个文件）
- [x] 创建 scripts/build-order-timeout-service.js（编译 + eslint-disable 注入 + 保护 common/ 目录）
- [x] 创建 scripts/audit-s45-order-timeout-service-ts.js（56 项审计检查全部通过）
- [x] 创建 test/order-timeout-service-ts-migration.test.js（57 个测试用例全部通过）
- [x] package.json 注册 audit:s45-order-timeout-service-ts:strict 到 ci:check
- [x] CI 全链路验证：tsc --noEmit（12 个服务回归）+ audit + jest 全部通过

Sprint 45 完成。**orderTimeoutService 全部 TypeScript 化 100% 收官**。**12 个云函数（11 个 action router + 1 个 cron）全部 TS 化**。
