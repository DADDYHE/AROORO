# Sprint 31 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W1-W2

## 目标

- **handleSuccess 残留点扫描与其他服务迁移**：扫描并迁移所有"裸返回响应"模式到统一的 handleSuccess/handleError
- **全局限流覆盖度审计**：建立审计脚本验证 withRateLimit 在所有高频业务类型的接入
- **TypeScript 迁移覆盖率指标**：实现按服务/模块维度的迁移率统计，输出 JSON 报告

## 关键任务完成度

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S31-01 | `audit-s31-handle-success-residual.js` 残留扫描脚本 | ✅ | 10 项检查 + strict 模式 |
| S31-02 | utilityService 自定义 ok/fail 包装器迁移 | ✅ | 改用 handleSuccess/handleError |
| S31-03 | i18nOverride 自定义 ok/fail 包装器迁移 | ✅ | 改用 handleSuccess/handleError |
| S31-04 | rateLimitCleanup "return { code: 0 }" 迁移 | ✅ | 改用 handleSuccess/handleError |
| S31-05 | couponExpiryCheck "return { code: 0 }" 迁移 | ✅ | 改用 handleSuccess/handleError |
| S31-06 | orderTimeoutService "return { code: 0 }" 迁移 | ✅ | 改用 handleSuccess/handleError |
| S31-07 | tuanExpiryCheck "return { code: 0 }" 迁移 | ✅ | 改用 handleSuccess/handleError |
| S31-08 | `audit-s31-global-rate-limit-coverage.js` 全局限流覆盖审计 | ✅ | 28 项检查 + strict 模式 |
| S31-09 | `audit-s31-ts-coverage.js` TS 迁移覆盖率指标 | ✅ | 5+ 项检查 + strict + JSON 报告 |
| S31-10 | `coverage/ts-coverage.json` 自动生成 | ✅ | 按服务/模块维度统计 |
| S31-11 | `test/handle-success-residual-migration.test.js` 78 用例 | ✅ | 验证 6 个服务的迁移 |
| S31-12 | `test/sprint31-coverage-audits.test.js` 38 用例 | ✅ | 验证 3 个 audit 脚本 + JSON 报告 |
| S31-13 | package.json 注册 audit:s31:* + ci:check 链 | ✅ | 4 个新 audit 脚本入链 |
| S31-14 | Sprint 31 交付文档 | ✅ | 本文档 |

## 1. handleSuccess 残留点扫描与迁移

### 1.1 迁移范围

扫描所有 `cloudfunctions/**/index.js`，识别"裸返回响应"模式：
- `return { code: 0, message: '...', data: ... }` 直接返回
- `function ok(data) { return { code: 0, ... } }` 自定义 ok 包装器
- `function fail(error) { return { code: error.code, message, data: null } }` 自定义 fail 包装器

### 1.2 已迁移服务（6 个）

| 服务 | 迁移内容 | 收益 |
| --- | --- | --- |
| `utilityService/index.js` | 移除 `ok(data)` / `fail(error)` 自定义包装器 | 统一响应格式 |
| `i18nOverride/index.js` | 同上 | 统一响应格式 |
| `rateLimitCleanup/index.js` | `return { code: 0, message: 'cleanup done', ... }` → `handleSuccess(...)` | 统一响应格式 |
| `couponExpiryCheck/index.js` | `return { code: 0, message: '过期检查完成', ... }` → `handleSuccess(...)` | 统一响应格式 |
| `orderTimeoutService/index.js` | `return { code: 0, message: '处理完成...', data: results }` → `handleSuccess(results, ...)` | 统一响应格式 |
| `tuanExpiryCheck/index.js` | `return { code: 0, message: '团购过期检查完成', ... }` → `handleSuccess(...)` | 统一响应格式 |

### 1.3 迁移收益

| 指标 | 迁移前 | 迁移后 | 变化 |
| --- | --- | --- | --- |
| 自定义 `ok(data)` 包装器数 | 2 | 0 | -2 |
| 自定义 `fail(error)` 包装器数 | 2 | 0 | -2 |
| "return { code: 0, ... }" 裸返回数 | 7+ | 0 | -7 |
| `handleSuccess` 使用次数 | 92 | 114 | +22 |
| `handleError` 使用次数 | 59 | 81 | +22 |

### 1.4 审计结果

```
=== handleSuccess 残留扫描汇总 ===
云函数入口数：19
handleSuccess 使用次数：114
handleError 使用次数：81
已迁移服务：utilityService/index.js, i18nOverride/index.js, rateLimitCleanup/index.js
残留模式数：0
自定义 ok/fail 包装器残留数：0
=== 总计 10 项检查 ===
✅ 全部通过
```

## 2. 全局限流覆盖度审计

### 2.1 审计目标

验证 `withRateLimit` 在所有高频业务类型的接入情况，确保风控检测不绕过限流。

### 2.2 业务类型覆盖

| 业务类型 | 接入服务 | 备注 |
| --- | --- | --- |
| `order` | orderService/orders.ts | createOrder 入口 |
| `evaluation` | orderService/orders.ts | submitEvaluation 入口 |
| `payment` | paymentService/services/pay.ts | createPayment 入口 |
| `refund` | paymentService/services/refund.ts | createRefund 入口 |
| `mall_order` | mallService/index.js | 商城订单 |
| `activity_apply` | activityService/index.js | 活动申请 |

### 2.3 全局 store 注入覆盖（5/5）

| 服务 | 是否注入 `initGlobalRateLimitFromDb` | 备注 |
| --- | --- | --- |
| orderService | ✅ | collectionName: 'rate_limits' |
| paymentService | ✅ | collectionName: 'rate_limits' |
| activityService | ✅ | collectionName: 'rate_limits' |
| mallService | ✅ | collectionName: 'rate_limits' |
| rateLimitCleanup | ✅ | 用于定时清理 |

### 2.4 审计结果

```
=== 全局限流覆盖审计汇总 ===
服务入口数：19
注入全局 store 服务数：5/5
业务类型覆盖：
  - order: 1 个服务（orderService）
  - evaluation: 1 个服务（orderService）
  - payment: 1 个服务（paymentService）
  - refund: 1 个服务（paymentService）
  - mall_order: 1 个服务（mallService）
  - activity_apply: 1 个服务（activityService）

=== 总计 28 项检查 ===
✅ 全部通过
```

## 3. TypeScript 迁移覆盖率指标

### 3.1 统计口径

按"模块"计：
- 每个 `.ts` 源文件 = 1 个已迁移模块（即使有同名 `.js` 编译产物）
- 每个**独立**的 `.js` 源文件（无对应 `.ts`）= 1 个未迁移模块
- 排除：`.d.ts` / `.d.js` / `package.json` / `config.json` / `miniprogram_npm` / `*/common` 副本

### 3.2 当前覆盖率

```
=== 按目录迁移率（按模块计） ===
  common               12/19 =  63.16%  [████████████░░░░░░░░]
  orderService          3/4  =     75%  [███████████████░░░░░]
  paymentService        4/6  =  66.67%  [█████████████░░░░░░░]
  --- 其他服务暂未迁移 ---
  activityService      0/1  =      0%
  adminService         0/19 =      0%
  partnerService       0/4  =      0%
  userService          0/5  =      0%
  ... 

总迁移率：27.54%（19/69）
```

### 3.3 核心服务迁移率

| 服务 | 已迁移 | 总数 | 迁移率 | 状态 |
| --- | --- | --- | --- | --- |
| common | 12 | 19 | 63.16% | ✅ |
| orderService | 3 | 4 | 75.00% | ✅ |
| paymentService | 4 | 6 | 66.67% | ✅ |

### 3.4 已迁移 .ts 模块清单

**common（12 个）**：
- auth-middleware.ts / cache.ts / errors.ts / logger.ts / normalize.ts
- permissions.ts / rate-limit-store.ts / risk-control.ts / risk-rate-limit.ts
- state-machine.ts / utils.ts / validator.ts

**orderService（3 个）**：
- orders.ts / payment.ts / stats.ts

**paymentService/services（4 个）**：
- commission.ts / notify.ts / pay.ts / refund.ts

### 3.5 JSON 报告

`coverage/ts-coverage.json`：

```json
{
  "generatedAt": "2026-06-06T...",
  "summary": {
    "totalModules": 69,
    "migratedModules": 19,
    "unmigratedModules": 50,
    "migrationRate": 27.54
  },
  "perService": {
    "common": { "migrated": 12, "unmigrated": 7, "total": 19, "rate": 63.16 },
    "orderService": { "migrated": 3, "unmigrated": 1, "total": 4, "rate": 75 },
    ...
  },
  "coreServices": {
    "orderService": 75,
    "paymentService": 66.67,
    "common": 63.16
  }
}
```

## 4. CI/CD 门禁更新

### 4.1 audit 脚本（3 个新增）

```
audit:s31-handle-success-residual
audit:s31-handle-success-residual:strict
audit:s31-global-rate-limit-coverage
audit:s31-global-rate-limit-coverage:strict
audit:s31-ts-coverage
audit:s31-ts-coverage:strict
```

### 4.2 ci:check 链更新

```json
"ci:check": "npm run lint:cloudfunctions && ... && npm run audit:s30-order-service-stats-ts:strict && npm run audit:s31-handle-success-residual:strict && npm run audit:s31-global-rate-limit-coverage:strict && npm run audit:s31-ts-coverage:strict && npm run i18n:collect:zh:check && npm run codemod:page-i18n:check && npm run test:ci"
```

### 4.3 累计 audit 脚本数

| Sprint | 新增 audit | 累计 audit |
| --- | --- | --- |
| Sprint 28 | audit:s28-order-service-orders-ts | 7 |
| Sprint 29 | audit:s29-order-service-payment-ts | 8 |
| Sprint 30 | audit:s30-order-service-stats-ts | 9 |
| **Sprint 31** | **3 个新 audit** | **12** |

## 5. 测试覆盖

### 5.1 jest 测试套件（2 个新增，共 116 个用例）

| 测试套件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| `test/handle-success-residual-migration.test.js` | 78 | 6 个已迁移服务 + 全云函数入口扫描 + 接口兼容性 |
| `test/sprint31-coverage-audits.test.js` | 38 | 3 个 audit 脚本 + JSON 报告 + 业务类型 + 已迁移模块 |

### 5.2 测试结果

```
PASS test/handle-success-residual-migration.test.js
Tests: 78 passed, 78 total

PASS test/sprint31-coverage-audits.test.js
Tests: 38 passed, 38 total
```

## 6. 关键学习

### 6.1 统一响应格式的 ROI

将 `return { code: 0, ... }` 替换为 `handleSuccess(data, message)` 的好处：
- **类型一致**：所有 handler 返回值类型相同（`ApiResponse<T>`）
- **可观测**：统一的 success/error 分支便于日志/metric 收集
- **可扩展**：未来增加 traceId / locale / timestamp 等字段时无需修改各 handler
- **避免重复**：移除自定义 `ok/fail` 包装器，减少代码冗余

### 6.2 限流覆盖度审计的必要性

通过 `audit-s31-global-rate-limit-coverage.js`：
- 验证每个业务类型（order/evaluation/payment/refund）至少 1 个服务接入 `withRateLimit`
- 验证 5 个使用限流的服务都注入了 `initGlobalRateLimitFromDb`
- 防止"代码改了一处，忘了同步另一处"的问题

### 6.3 TS 迁移覆盖率指标的价值

通过 `audit-s31-ts-coverage.js` + `coverage/ts-coverage.json`：
- **可视化**：按服务维度展示迁移率（条形图）
- **可量化**：JSON 报告便于 CI 消费（如 `> 50%`）
- **可追踪**：每次提交后都能看到迁移进度
- **可治理**：列出未迁移模块清单，便于排期

## 7. 后续计划

- **Sprint 32**：移除已废弃的 `orderService/payment.ts`（新版 `paymentService` 完全替代后）
- **Sprint 33+**：
  - `adminService/services/*.js` → `.ts`（19 个）
  - `userService/*.js` → `.ts`（5 个）
  - `partnerService/services/*.js` → `.ts`（4 个）
  - 目标：核心业务服务（orderService / paymentService / adminService）迁移率 100%

## 8. 指标

| 指标 | Sprint 30 末 | Sprint 31 末 | 变化 |
| --- | --- | --- | --- |
| audit 脚本数 | 9 | **12** | +3 |
| 自定义 `ok/fail` 包装器 | 2 | **0** | -2 |
| "return { code: 0 }" 裸返回 | 7+ | **0** | -7 |
| `handleSuccess` 使用次数 | 92 | **114** | +22 |
| `handleError` 使用次数 | 59 | **81** | +22 |
| TS 迁移率（总） | - | **27.54%** | 新增 |
| TS 迁移率（common） | - | **63.16%** | 新增 |
| TS 迁移率（orderService） | - | **75%** | 新增 |
| TS 迁移率（paymentService） | - | **66.67%** | 新增 |
| jest 测试用例 | 189+62+53+56 | **189+62+53+56+78+38 = 476** | +116 |

## 9. 变更清单

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `scripts/audit-s31-handle-success-residual.js` | 新建 | handleSuccess 残留扫描（10 项） |
| `scripts/audit-s31-global-rate-limit-coverage.js` | 新建 | 全局限流覆盖审计（28 项） |
| `scripts/audit-s31-ts-coverage.js` | 新建 | TS 迁移覆盖率（5+ 项） |
| `coverage/ts-coverage.json` | 新建（自动） | TS 覆盖率 JSON 报告 |
| `test/handle-success-residual-migration.test.js` | 新建 | 78 个 jest 用例 |
| `test/sprint31-coverage-audits.test.js` | 新建 | 38 个 jest 用例 |
| `package.json` | 修改 | 3 个 audit:s31:* + ci:check 链 |
| `cloudfunctions/utilityService/index.js` | 修改 | 移除 ok/fail 包装器 |
| `cloudfunctions/i18nOverride/index.js` | 修改 | 移除 ok/fail 包装器 |
| `cloudfunctions/rateLimitCleanup/index.js` | 修改 | 改用 handleSuccess/handleError |
| `cloudfunctions/couponExpiryCheck/index.js` | 修改 | 改用 handleSuccess/handleError |
| `cloudfunctions/orderTimeoutService/index.js` | 修改 | 改用 handleSuccess/handleError |
| `cloudfunctions/tuanExpiryCheck/index.js` | 修改 | 改用 handleSuccess/handleError |
