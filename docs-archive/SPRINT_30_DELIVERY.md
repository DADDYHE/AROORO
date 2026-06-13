# Sprint 30 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W1-W2

## 目标

- 将 `cloudfunctions/orderService/stats.js` 迁移到 `stats.ts`（Sprint 30）
- 强类型化 2 个 handler：getStats（通用统计）+ getIncomeStats（收入统计）
- 强类型化聚合查询的输入/输出（GeneralStats / IncomeStatsData / IncomeListItem / AggregateSumResult 等）
- 扩展 `common/types.d.ts` 增加 CloudBaseAggregate 接口
- 完成 orderService TypeScript 迁移（orders.ts / payment.ts / stats.ts 全部完成）
- 补齐 CI 门禁：`audit:s30-order-service-stats-ts:strict` 进入 `ci:check`
- 全量 `ci:check` 验证通过

## 关键任务完成度

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S30-01 | `cloudfunctions/orderService/stats.ts` 源文件创建 | ✅ | 2 handler + 2 helper，~330 行 |
| S30-02 | `tsconfig.orderService.json` include 扩展 stats.ts | ✅ | 与 orders.ts / payment.ts 共享配置 |
| S30-03 | `scripts/build-order-service.js` TARGETS 包含 stats.js | ✅ | 自动注入 `/* eslint-disable */` 标记 |
| S30-04 | `stats.js` 编译产物 | ✅ | 含 `_mod.exports = _handlers` CommonJS shim |
| S30-05 | `stats.d.ts` 类型声明 | ✅ | 2 处 `export declare function` |
| S30-06 | 强类型化 4 个核心接口 | ✅ | GeneralStats / AggregateSumResult / IncomeStatsData / IncomeListItem |
| S30-07 | Runtime shim 修复 CommonJS 导出 | ✅ | `_mod.exports = _handlers` + `_handlers.default = _handlers` |
| S30-08 | 扩展 `common/types.d.ts` | ✅ | 新增 CloudBaseAggregate + AggregateOps 接口 |
| S30-09 | `order-service-stats-ts-migration.test.js` 迁移测试（56 个用例） | ✅ | 12 个 describe 套件 |
| S30-10 | `audit-s30-order-service-stats-ts.js` CI 审计脚本（41 项 strict 检查） | ✅ | 进入 `ci:check` 链 |
| S30-11 | 更新 `audit-s28` / `audit-s29` 反映 Sprint 30 完成 | ✅ | 移除 stats.js 暂未迁移检查 |
| S30-12 | orderService TypeScript 迁移完成（3/3） | ✅ | orders.ts / payment.ts / stats.ts 全部完成 |
| S30-13 | 全部 audit 脚本 + 全部 jest 测试通过 | ✅ | s28 33/33 + s29 42/42 + s30 41/41 + 189/189 |
| S30-14 | Sprint 30 交付文档 | ✅ | 本文档 |

## 1. stats.ts 迁移概览

### 1.1 迁移范围

`stats.js` 是 orderService 的统计服务，包含 2 个 handler：

| Handler | 业务功能 | 鉴权 | 关键流程 |
| --- | --- | --- | --- |
| `getStats` | 通用统计（owner / host 双视角） | 需 | 双视角过滤 + 聚合（bookingCount / totalSpent / totalIncome） |
| `getIncomeStats` | 收入统计（host 视角） | 需 | 状态过滤 + 日期范围 + 3 个并行聚合 + 收入明细列表 |

### 1.2 内部辅助函数

| Helper | 用途 |
| --- | --- |
| `getDateRangeFromPreset` | 计算日期范围（today / week / month / last_month） |
| `pickSum` | 安全地从聚合结果中提取数值（默认 0） |

### 1.3 CommonJS 互操作的关键点

与 Sprint 28 / 29 一致，使用 Runtime shim：

```typescript
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = _handlers
;(_handlers as Record<string, unknown>).default = _handlers
export default _handlers
```

### 1.4 强类型化收益

```typescript
// 之前（JS）—— 字段含义靠注释
async function getStats(event, context, auth) {
  const { userRole } = event
  // ...
  if (userRole === 'owner') {
    const ownerStatsRes = await db.collection('orders')
      .where({ ownerId: openid })
      .aggregate()
      .group({
        _id: null,
        bookingCount: $.sum(1),
        totalSpent: $.sum({ $cond: [{ $ne: ['$totalPrice', null] }, '$totalPrice', 0] }),
      })
      .end()

    if (ownerStatsRes.list && ownerStatsRes.list.length > 0) {
      const statsData = ownerStatsRes.list[0]  // ❌ any 类型
      stats.bookingCount = statsData.bookingCount
      stats.totalSpent = statsData.totalSpent
    }
  }
}

// 现在（TS）—— 编译器强制结构正确
export async function getStats(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const { userRole } = event as { userRole?: 'owner' | 'host' | string }
  // ...
  if (userRole === 'owner') {
    const ownerStatsRes = await db.collection('orders')
      .where({ ownerId: openid })
      .aggregate()
      .group({ /* ... */ })
      .end() as unknown as AggregateSumResult

    if (ownerStatsRes.list && ownerStatsRes.list.length > 0) {
      const statsData = ownerStatsRes.list[0] as Record<string, number>  // ✅ 类型化
      stats.bookingCount = Number(statsData.bookingCount || 0)
      stats.totalSpent = Number(statsData.totalSpent || 0)
    }
  }
}
```

**消除 5+ 处魔法字符串**（'owner' / 'host' 角色 / 'completed' / 'pending' / 'cancelled' 等状态）

## 2. 类型架构设计

### 2.1 接口分层

```
GeneralStats (通用统计)
AggregateSumResult / AggregateMonthlyResult / AggregatePendingResult (聚合结果)
  └─ IncomeStatsData (收入统计)
       └─ IncomeListItem (收入明细)
DateRangePreset (日期范围预设)
STATUS_TEXT_MAP (状态文本映射)
```

### 2.2 接口详情

| 接口 | 关键字段 | 用途 |
| --- | --- | --- |
| `GeneralStats` | `bookingCount` / `totalSpent` / `totalIncome` | 通用统计（默认 0） |
| `AggregateSumResult` | `list?: Array<Record<string, number>>` | 通用聚合结果 |
| `AggregateMonthlyResult` | `list?: Array<Record<string, number>>` | 月度聚合结果 |
| `AggregatePendingResult` | `list?: Array<Record<string, number>>` | 待结算聚合结果 |
| `IncomeStatsData` | `totalIncome` / `monthlyIncome` / `pendingIncome` / `incomeList` | 收入统计完整数据 |
| `IncomeListItem` | `id` / `title` / `date` / `orderId` / `status` / `statusText` / `amount` | 收入明细 |
| `DateRangePreset` | `'today' \| 'week' \| 'month' \| 'last_month' \| string` | 日期范围预设 |

### 2.3 内部类型

| 类型 | 关键字段 | 用途 |
| --- | --- | --- |
| `STATUS_TEXT_MAP` | `Record<string, string>` | 状态文本映射（订单状态通知） |
| `AggregateOps` | `sum(v: number \| Record<string, unknown>) => unknown` | CloudBase 聚合操作符 |
| `AggregateCommand` | `command: { aggregate?: AggregateOps, ... }` | CloudBase 聚合命令 |

## 3. 业务流程序列

### 3.1 getStats（典型序列）

```
1. 鉴权 (auth.openid)                     → AUTH_REQUIRED
2. 参数校验 (userRole)                    → INVALID_PARAMS（缺少角色参数）
3. userRole === 'owner'?
   - 是：aggregate().group({ bookingCount, totalSpent })
   - 否：userRole === 'host'?
     - 是：aggregate().group({ bookingCount, totalIncome })
     - 否：INVALID_PARAMS（无效的角色类型）
4. 提取 statsData → bookingCount / totalSpent / totalIncome
5. handleSuccess(stats)
6. 错误 → isBusinessError + handleError
```

### 3.2 getIncomeStats（典型序列）

```
1. 鉴权 (auth.openid)                     → AUTH_REQUIRED
2. 解析 status / dateRange
3. getDateRangeFromPreset(dateRange)
4. 构建 query（hostId = openid + status + createdAt 范围）
5. Promise.all 并行：
   - totalRes: 累计完成订单总收入
   - monthlyRes: 本月完成订单收入
   - pendingRes: 待结算订单收入
6. pickSum 提取数值
7. 查询收入明细（limit 默认 500，上限 1000）
8. 构造 incomeList（id / title / date / orderId / status / statusText / amount）
9. handleSuccess({ totalIncome, monthlyIncome, pendingIncome, incomeList })
10. 错误 → isBusinessError + handleError
```

## 4. 编译产物

### 4.1 stats.js 关键导出

```javascript
exports.getStats = withErrorHandling(getStats)
exports.getIncomeStats = withErrorHandling(getIncomeStats)
exports.default = _handlers
// Runtime shim: _mod.exports = _handlers（保持 CommonJS 兼容）
```

支持三种 require 方式：
- `const stats = require('./stats')` → `stats.getStats(...)` ✓
- `const { getStats } = require('./stats')` ✓
- `const stats = require('./stats').default` ✓

### 4.2 stats.d.ts 关键签名

```typescript
export declare function getStats(
  event: EventLike,
  _context: ContextLike,
  auth: AuthLike | null
): HandlerResult
export declare function getIncomeStats(
  event: EventLike,
  _context: ContextLike,
  auth: AuthLike | null
): HandlerResult
export default _handlers
```

## 5. common/types.d.ts 扩展

Sprint 30 引入聚合查询的强类型化：

```typescript
export interface CloudBaseQuery {
  // ... 已有方法
  // 聚合查询：where().aggregate()（Sprint 30 引入）
  aggregate: () => CloudBaseAggregate
}

/** 聚合操作符 - 简化版（Sprint 30） */
export interface AggregateOps {
  sum: (v: number | Record<string, unknown>) => unknown
}

export interface CloudBaseAggregate {
  group: (spec: Record<string, unknown>) => CloudBaseAggregate
  match: (spec: Record<string, unknown>) => CloudBaseAggregate
  project: (spec: Record<string, unknown>) => CloudBaseAggregate
  sort: (spec: Record<string, unknown>) => CloudBaseAggregate
  limit: (n: number) => CloudBaseAggregate
  skip: (n: number) => CloudBaseAggregate
  end: () => Promise<{ list: any[] }>
}
```

**收益**：
- `db.collection('orders').where(...).aggregate()` 不再返回 `any`
- `aggregate().group({ ... }).end()` 链路类型化
- 未来 paymentService / adminService 使用聚合时无需重新定义

## 6. CI 门禁

### 6.1 audit 脚本 41 项检查

```
[1]  stats.ts / .d.ts / .js 文件存在性 × 3
[2]  tsconfig.orderService.json include stats.ts
[3]  build-order-service.js 包含 stats.js
[4]  package.json 注册 audit:s30 + strict + ci:check × 4
[5]  stats.ts 注释 "Sprint 30 迁移"
[6]  stats.ts 强类型化 4 个核心接口 × 4
[7]  stats.ts 包含 2 个 handler（getStats / getIncomeStats）
[8]  stats.ts 使用 isBusinessError 类型守卫
[9]  stats.ts 使用 catch (error: unknown) 模式
[10] stats.ts Runtime shim 修复 CommonJS 导出
[11] stats.ts 包含 withErrorHandling 包装
[12] stats.ts 引用 aggregate / STATUS_TEXT_MAP / getDateRangeFromPreset / pickSum × 4
[13] orders.ts / payment.ts / stats.ts 全部存在（orderService TS 迁移完成）
[14] common/types.d.ts 包含 CloudBaseAggregate + AggregateOps 接口
[15] jest 测试存在
[16-20] (strict) tsc --noEmit + .d.ts 2+ declare function + eslint-disable 头 + shim 存在 + exports 全部
```

### 6.2 ci:check 链更新

```json
"ci:check": "npm run lint:cloudfunctions && ... && npm run audit:s29-order-service-payment-ts:strict && npm run audit:s30-order-service-stats-ts:strict && npm run i18n:collect:zh:check && npm run codemod:page-i18n:check && npm run test:ci"
```

### 6.3 同步更新 s28 / s29 audit

移除"stats.js 暂未迁移"检查，改为"stats.ts 已迁移（Sprint 30 完成）"。

## 7. 测试覆盖

### 7.1 jest 测试（56 个用例）

| 套件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| 1. 文件存在性 | 3 | .ts / .d.ts / .js 存在性 |
| 2. tsconfig 配置 | 7 | strict + noImplicitAny + strictNullChecks + declaration + include stats.ts + orders.ts 回归 + payment.ts 回归 |
| 3. stats.ts 源文件 | 8 | Sprint 30 注释 + 4 接口 + STATUS_TEXT_MAP + ApiResponse + ServiceLogger |
| 4. handler 完整性 | 3 | 2 个 export async function |
| 5. 业务逻辑 | 12 | err() >= 3 + isBusinessError + catch unknown >= 2 + owner/host 视角 + aggregate + bookingCount + totalSpent + totalIncome + status 过滤 + dateRange + Promise.all + incomeList |
| 6. Runtime shim | 3 | _mod.exports = _handlers + .default = _handlers + _mod = module as |
| 7. stats.d.ts | 3 | 2+ declare function + getStats + getIncomeStats |
| 8. stats.js 编译产物 | 5 | eslint-disable 头 + _mod.exports shim + exports.getStats + exports.getIncomeStats + require 路径可解析 |
| 9. 编译可重复 | 1 | tsc --noEmit 通过 |
| 10. 运行时兼容 | 1 | require("./stats") 包含 getStats + getIncomeStats |
| 11. common/types.d.ts 扩展 | 5 | CloudBaseAggregate + AggregateOps + aggregate() + group() + end() |
| 12. 迁移完成度 | 4 | orders.ts / payment.ts / stats.ts 全部存在 |

### 7.2 测试结果

```
PASS test/order-service-stats-ts-migration.test.js
Tests: 56 passed, 56 total
```

并与 Sprint 28-29 测试联合运行：

```
Test Suites: 5 passed, 5 total
Tests:       189 passed, 189 total
  - test/order-service-orders.test.js
  - test/order-service-evaluation-risk.test.js
  - test/order-service-orders-ts-migration.test.js (62)
  - test/order-service-payment-ts-migration.test.js (53)
  - test/order-service-stats-ts-migration.test.js (56)
```

## 8. 兼容性保证

| 维度 | 保证 |
| --- | --- |
| stats.js 导出 | `_mod.exports = _handlers` + `_handlers.default = _handlers`，三种 require 方式都可用 |
| 2 个 handler | `withErrorHandling(fn)` 包装，错误统一响应 |
| 鉴权 | 公开 handler 不需 auth（getStats / getIncomeStats 都需 auth） |
| 错误处理 | err() 工厂 + isBusinessError 类型守卫 + 2 处 catch (e: unknown) |
| 聚合查询 | db.collection.aggregate().group().end() 类型化 |
| 日期范围 | today / week / month / last_month 与 orders.ts 共享语义 |
| 状态文本 | STATUS_TEXT_MAP 与 orders.ts 共享部分字段 |

## 9. 关键学习：聚合查询的强类型化

### 9.1 聚合链路的类型挑战

Sprint 30 之前，`db.collection('orders').where(...).aggregate()` 在 `types.d.ts` 中不存在，导致 stats.js 是裸 JS。Sprint 30 添加了：

```typescript
export interface CloudBaseQuery {
  // ...
  aggregate: () => CloudBaseAggregate
}

export interface CloudBaseAggregate {
  group: (spec: Record<string, unknown>) => CloudBaseAggregate
  // ...
  end: () => Promise<{ list: any[] }>
}
```

**注意 `list: any[]`**：CloudBase 聚合结果的字段名是动态的（如 `bookingCount` / `totalSpent` / `totalIncome`），无法静态确定。所以 `list` 是 `any[]`，调用方需要 `as Record<string, number>` 进一步断言。

### 9.2 pickSum 辅助函数

```typescript
function pickSum(result: AggregateSumResult, key: string): number {
  if (!result || !result.list || result.list.length === 0) {return 0}
  const first = result.list[0] as Record<string, number>
  return Number(first[key] || 0)
}
```

**收益**：避免 3 处重复的 `Number(... || 0)` 模式，统一聚合结果提取逻辑。

### 9.3 错误处理降级

```typescript
} catch (error: unknown) {
  if (isBusinessError(error)) {
    return handleError(error as Error, '获取统计数据失败', ERROR_CODES.DATA)
  }
  logger.error('getStats', { msg: (error as Error)?.message })
  return handleError(error as Error, '获取统计数据失败', ERROR_CODES.DATA)
}
```

**与 Sprint 29 payment.ts 一致的模式**：isBusinessError 类型守卫 + catch (e: unknown) + handleError(error as Error, ...) 统一处理。

## 10. orderService TypeScript 迁移完成

| 文件 | Sprint | 状态 | handler / 函数数 | jest 用例 | audit 检查 |
| --- | --- | --- | --- | --- | --- |
| `orders.ts` | Sprint 28 | ✅ | 14 + 7 helper | 62 | 33 |
| `payment.ts` | Sprint 29 | ✅ | 2 + 5 helper | 53 | 42 |
| `stats.ts` | Sprint 30 | ✅ | 2 + 2 helper | 56 | 41 |
| **合计** | **Sprint 28-30** | **✅ 3/3** | **18 + 14 helper** | **171** | **116** |

**orderService TypeScript 迁移 100% 完成**。

## 11. 指标

| 指标 | Sprint 24 (refund) | Sprint 25 (pay) | Sprint 26 (notify) | Sprint 27 (commission) | Sprint 28 (orders) | Sprint 29 (payment) | **Sprint 30 (stats)** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 源文件行数（.ts） | ~280 | ~560 | ~440 | ~280 | ~1120 | ~470 | **~330** |
| handler / 函数数 | 2 | 4 | 1 | 1 | 14 + 7 helper | 2 + 5 helper | **2 + 2 helper** |
| 内部接口数 | 8 | 14 | 7 | 5 | 9 | 10 | **4** |
| jest 用例数 | 21 | 25 | 41 | 37 | 62 | 53 | **56** |
| audit 检查项 | 18 | 19 | 33 | 30 | 33 | 42 | **41** |
| ci:check 链 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✓** |
| catch (e: unknown) | - | - | - | - | 6 | 2 | **2** |
| @deprecated | - | - | - | - | - | 2 | **0** |

## 12. 后续计划

- **Sprint 31**: handleSuccess 残留点扫描 + 全局限流覆盖度审计 + TypeScript 迁移覆盖率指标实现
- **Sprint 32+**: 移除旧版 orderService/payment.ts（在新版 paymentService 完全替代后）
- **Sprint 33+**: adminService / activityService / groupBuyService TypeScript 迁移

## 13. 变更清单

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `cloudfunctions/orderService/stats.ts` | 新建 | 强类型化统计服务（330 行） |
| `cloudfunctions/orderService/stats.d.ts` | 新建（自动） | tsc 生成 |
| `cloudfunctions/orderService/stats.js` | 重建（自动） | tsc 编译产物 |
| `cloudfunctions/common/types.d.ts` | 修改 | 新增 CloudBaseAggregate + AggregateOps 接口 |
| `tsconfig.orderService.json` | 修改 | include 增加 stats.ts |
| `scripts/build-order-service.js` | 修改 | TARGETS 增加 stats.js |
| `scripts/audit-s28-order-service-orders-ts.js` | 修改 | 移除"stats.js 暂未迁移"检查 |
| `scripts/audit-s29-order-service-payment-ts.js` | 修改 | 移除"stats.js 暂未迁移"检查 |
| `scripts/audit-s30-order-service-stats-ts.js` | 新建 | 41 项 strict 检查 |
| `test/order-service-stats-ts-migration.test.js` | 新建 | 56 个 jest 用例 |
| `package.json` | 修改 | 注册 audit:s30 + ci:check 链 |
