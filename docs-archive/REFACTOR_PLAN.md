# 14+ 周代码优化与现代化实施计划（v2.0 整体重写）

> 版本：v2.0（2026-06-07 整体重写）
> 配套：`docs/INDEX.md` · `docs/SPRINT_*_DELIVERY.md`（Sprint 1-48）
> 更新方式：每 Sprint 末复盘后增量更新；每 8 个 Sprint 整体重写一次

## 计划概览

| 阶段 | Sprint 范围 | 主线 | 状态 |
| --- | --- | --- | --- |
| 第 1 阶段 | Sprint 0-3 | 工具链 + 命名 + 字段去重 + 状态机 | ✅ 完成 |
| 第 2 阶段 | Sprint 4-13 | 测试 + 文档 + 错误码 + 风控 | ✅ 完成 |
| 第 3 阶段 | Sprint 14-18 | i18n + 风控限流 + BusinessError 治理 | ✅ 完成 |
| 第 4 阶段 | Sprint 19-39 | 跨模块 errors 单源 + 全面 TS 化（除聚合入口） | ✅ 完成 |
| 第 5 阶段 | Sprint 40-47 | 11 个 service 单体 + 8 个聚合入口 → 100% TS | ✅ 完成 |
| 第 6 阶段 | Sprint 48 | 文件/代码清理 + build script 合并 + 最终验证 | ✅ 完成 |
| 第 7 阶段 | Sprint 49 | 业务状态机 TS 化 + 构建脚本收尾 | ✅ 完成 |
| 第 8 阶段 | Sprint 50-60（规划）| 业务覆盖度 / 性能 / 工具链 | ⏳ 待启动 |

---

## 累计度量看板（Sprint 49 末 · 2026-06-08）

| 指标 | 起点（Sprint 0） | Sprint 17 末 | Sprint 39 末 | Sprint 47 末 | Sprint 48 末 | **Sprint 49 末** | Sprint 50 目标 | Sprint 60 目标 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 测试套件 | 0 | 75 | ~95 | 102 | 106 | **108** | 110 | 130 |
| 测试用例 | 0 | 1515 | 2169 | 258（迁移维度）| 2695 | **2722** | 3000 | 4500 |
| TypeScript .ts 源文件 | 0 | 16 | 35 | 98 | 98 | **100** | 100 | 100 |
| TypeScript 化率（云函数） | 0% | 50% | 60% | 100% | 100% | **100%** | 100% | 100% |
| 业务状态机（.ts） | 0 | 0 | 0 | 0 | 0 | **2** | 2 | 2 |
| 错误码注册表 | 0 | 51 | 50 | 50 | 50 | **50** | 55 | 70 |
| 业务限流点 | 0 | 2 | 4 | 4 | 4 | **4** | 6 | 10 |
| audit 脚本 | 0 | ~20 | ~38 | 42 | 42 | **42** | 50 | 60 |
| build 脚本 | 0 | 22 | 20 | 20 | 20（1 + 19 shim）| **2**（all-services + i18n） | 2 | 2 |
| CommonJS 主入口 | 19 | 19 | 9 | 0 | 0 | **0** | 0 | 0 |
| pre-existing 测试失败 | 8 | 0 | 0 | 0 | 0 | **0** | 0 | 0 |
| `audit:error-codes:strict` | ❌ | ✅ | ✅ | ✅ | ✅ | **✅** | ✅ | ✅ |
| 单元测试覆盖率（common 域） | 0% | 70% | 85% | 90% | 92% | **92%** | 95% | 98% |
| i18n 字典（zh/en/ja） | 0 | 51 | 51 | 51 | 51 | **51** | 60 | 80 |
| 集成测试子链路 | 0 | 17 | 17 | 17 | 17 | **17** | 20 | 25 |
| CI 门禁 job | 0 | 7 | 7 | 7 | 8 | **8** | 10 | 12 |

---

## 第 1-3 阶段（Sprint 0-18）— 工具链 / 测试 / 风控限流

### Sprint 0（W1-W2）— 工具链与发现

- 4 份审计报告就位（`docs/NAMING_CONVENTION.md` / `FIELD_DEDUPLICATION_REPORT.md` / `EMPTY_CATCH_AUDIT.md` / `CODE_DUPLICATION_REPORT.md` / `ARCHITECTURE.md`）
- Jest 接入：20 个 test cases
- CI：lint + test
- common 库 v1：`errors.js` / `normalize.js` / `permissions.js` / `crypto.js` / `date-range.js`

详见 [SPRINT_1_MODULES.md](SPRINT_1_MODULES.md) / 后续 SPRINT_*_DELIVERY.md。

### Sprint 1-3 — 命名一致性 + 字段去重 + 状态机

- ESLint `camelcase` + `no-empty-catch` 接入
- 字段规范化函数（`normalize.js`）
- 状态机抽离（`state-machine.js`，Sprint 2）
- 错误码字典
- adminService 25 处空 catch 治理
- 支付幂等化（`idempotencyKey` 索引）

### Sprint 4-13 — 测试体系 + 文档 + 错误码 + 风控

- k6 性能基线初稿（Sprint 9）
- 错误码字典 + 严格审计（`audit:error-codes:strict`）Sprint 10
- `errors.js` / `logger.ts` / `cache.ts` / `state-machine.ts` / `idempotency.ts` 迁移（Sprint 11-13）
- 集成测试子链路：寄养日期冲突 / 退款状态机 / 团长邀请（Sprint 13-14）
- 累计 17 个集成测试子链路，1013 个测试用例

### Sprint 14-17 — i18n + 风控限流 + 业务接入

- date-holidays / validator TS 化（Sprint 14）
- 退款状态机子链路（21 用例）+ 团长邀请子链路（16 用例）
- k6 接入 CI（k6-smoke + k6-main）
- 错误码扩 RISK_PENDING / RISK_PASS
- 评价 / 退款风控子链路（49 用例）
- `risk-control.ts` / `utils.ts` / `errors-i18n.ts`（Sprint 15）
- `auth-middleware.ts`（Sprint 16）
- 业务 i18n / page-i18n / ENDPOINTS 集中化（Sprint 16-17）
- `risk-rate-limit.ts` + 评价/退款业务接入（Sprint 17）
- 累计测试用例：1515（Sprint 17 末）

### Sprint 18 — 风控扩展 + BusinessError instanceof 修复

- `createPayment` / `createOrder` 接入 `withRateLimit`（支付 / 下单限流）
- 修复 `withErrorHandling` 跨模块 `BusinessError instanceof` 失效
- 累计测试用例：1545（+30）
- 详见 [SPRINT_18_DELIVERY.md](SPRINT_18_DELIVERY.md)

---

## 第 4 阶段（Sprint 19-39）— 跨模块 errors 单源 + 全面 TS 化

### Sprint 19 — BusinessError 跨模块一致性系统化

- 14 个 `*/common/errors.js` 副本收口为 re-export shim
- CI 门禁：单源审计 + sync 行为兼容
- 配套回归测试：14 service × 多场景
- 测试用例：1545 → **1583**（+38）

> **Sprint 20-24 期间**：业务线 / 后台维护 / 性能 / i18n 校稿等横向工作持续推进，无独立交付文档（详见 [Sprint 19](SPRINT_19_DELIVERY.md) 与 [Sprint 25](SPRINT_25_DELIVERY.md) 之间的过渡）。

### Sprint 25-31 — paymentService / orderService 子服务 TS 化（首批 7 个）

| Sprint | 服务 | 文件 | handler 数 |
| --- | --- | --- | --- |
| 25 | paymentService | pay.ts | 4 |
| 26 | paymentService | notify.ts | 微信支付回调 |
| 27 | paymentService | commission.ts | 佣金 |
| 28 | orderService | orders.ts | 14 |
| 29 | orderService | payment.ts | 2 |
| 30 | orderService | stats.ts | 2 |
| 31 | 全局 | handleSuccess 治理 + 限流覆盖审计 | 工具 |

### Sprint 32 — 移除废弃 `orderService/payment.ts`

- 32 个测试用例验证已迁移的 `wechatPay` / `wechatPayNotify` handler
- 同步从 `tsconfig.orderService.json` 移除 include

### Sprint 33-39 — 11 个 service 单体 TS 化 + Pre-existing 修复

| Sprint | 服务 | handler 数 | 代码量 |
| --- | --- | --- | --- |
| 33 | adminService | 多 | 65 测试 |
| 34 | userService | 多 | 65 测试 |
| 35 | partnerService | 多 | 47 测试 |
| 36 | partnerService services | 4 | 62 测试 |
| 37 | userService services | 5 | 73 测试 |
| 38 | activityService | 多 | 41 测试 |
| 39 | **Pre-existing 修复** | 8 fail → 0 | +37 测试 |

Sprint 39 是关键转折点：将历史累积的 8 个失败测试全部修通，测试通过率从 2132/2141 提升到 2169/2170（+37）。

---

## 第 5 阶段（Sprint 40-47）— 11 个 service 单体 + 8 个聚合入口 → 100% TS

### Sprint 40-45 — 6 个 service 单体 TS 化

| Sprint | 服务 | handler 数 | Jest 用例 |
| --- | --- | --- | --- |
| 40 | mallService | 多 | 42 |
| 41 | feedingService | 多 | 37 |
| 42 | hostService | 多 | 45 |
| 43 | couponService | 8 | 43 |
| 44 | petService | 6 | 40 |
| 45 | orderTimeoutService | cron + 5 业务函数 | 57 |

### Sprint 46 — 批量 TS 化收官（7 个云函数）

| 服务 | 类型 | 业务 | Jest 用例 |
| --- | --- | --- | --- |
| tuanService | action router | 团购 | 累计 151 |
| favoriteService | action router | 收藏 | |
| i18nOverride | action router | i18n 覆盖 | |
| utilityService | action router | 通用工具 | |
| couponExpiryCheck | cron | 券过期 | |
| tuanExpiryCheck | cron | 团过期 | |
| rateLimitCleanup | cron + HTTP | 限流清理 | |

详见 [SPRINT_46_DELIVERY.md](SPRINT_46_DELIVERY.md)。

### Sprint 47 — 核心聚合入口 TS 化

- `paymentService/index.ts`（234 行）+ `orderService/index.ts`（227 行）
- 累计迁移测试 258 个
- **本批后：全部 19 个云函数（11 个 action router + 4 个 cron + 4 个独立 service）100% TypeScript 化**
- **项目不再有 CommonJS 主入口**
- 详见 [SPRINT_47_DELIVERY.md](SPRINT_47_DELIVERY.md)

---

## 第 6 阶段（Sprint 48 · 2026-06-07）— 文件 / 代码清理 + build script 合并

### 目标

> "项目文件和代码非常杂乱，我们现在需要清理文件和代码"

清理分为 3 步：①审计子包 ②合并 build 脚本 ③删除冗余设计脚本与孤儿资产 ④关键 audit 与测试验证。

### Sprint 48 任务清单

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S48-01 | 审计 `miniprogram/subpackages/other` 残留 | ✅ | 已确认不存在 |
| S48-02 | 合并 16 个 `build-{service}.js` → `build-all-services.js` | ✅ | 19 个 service 全部支持 |
| S48-03 | 删除 15 个孤儿云函数目录 | ✅ | `calculatePrice` / `getHostList` 等 |
| S48-04 | 删除 4 个 Python 设计脚本 + 1 个孤儿 image | ✅ | `design/*.py` 全部移除 |
| S48-05 | 修复 `audit-global-rate-limit.js` / `audit-s31-global-rate-limit-coverage.js` 引用 | ✅ | 改为 `build-all-services.js` |
| S48-06 | 修复 13 个 `*-ts-migration.test.js` 引用旧 build 脚本 | ✅ | 全部对齐 `build-all-services.js` |
| S48-07 | 修复 8 个 `common-*-ts-migration.test.js` 引用旧 `build-common.js` | ✅ | 全部对齐 `build-all-services.js` |
| S48-08 | `tsconfig.orderService.json` 移除残留 `payment.ts` include | ✅ | Sprint 32 清理遗漏 |
| S48-09 | 新建 `paymentService/common/payment-state-machine.js` | ✅ | 5 状态支付机 |
| S48-10 | 新建 `orderService/common/boarding-state-machine.js` | ✅ | 7 状态寄养机 |
| S48-11 | 修复 `build-all-services.js#staleDirs` 误删合法 `<service>/common` | ✅ | 仅保留 tsc 重复产物 |
| S48-12 | `tsc` 注释示例中的 `err('INVALID_STATE_TRANSITION')` 改写 | ✅ | 避免 audit 误报 |
| S48-13 | `package.json#build:all` 测试正则更新 | ✅ | `/build-all-services\.js/` |
| S48-14 | 最终验证：8 个关键 audit + `test:ci` + `build:all-services` | ✅ | 全绿 |

### 关键产出

#### 1. `scripts/build-all-services.js`（300 行）

```javascript
const SERVICES = [
  { name: 'hostService', tsconfig: 'tsconfig.hostService.json', targets: [...] },
  { name: 'activityService', tsconfig: 'tsconfig.activityService.json', targets: [...] },
  // ... 20 个服务配置
]
```

每个 shim 缩减为：
```js
const target = 'index.js'
process.argv[2] = 'hostService'
require('./build-all-services.js')
```

#### 2. 新建服务级状态机

- [`paymentService/common/payment-state-machine.js`](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/common/payment-state-machine.js) — 5 状态（unpaid/paying/paid/refunded/closed）+ `ORDER_STATUS_ON_PAID` + `resolveOrderStatus/isKnownOrderType`
- [`orderService/common/boarding-state-machine.js`](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/common/boarding-state-machine.js) — 7 状态（pending/paid/confirmed/in_progress/completed/rejected/cancelled）+ `BOARDING_OPERATION_TARGET` + `canPerformOperation`

#### 3. `build-all-services.js#staleDirs` 修正

原 staleDirs 误将 20 个 `<service>/common` 目录列为 tsc 产物，导致合法的服务级状态机被误删。修正后只清理 `<service>/<serviceName>` 等真正的 tsc 重复产物。

### 度量（Sprint 48 末）

| 指标 | Sprint 47 末 | Sprint 48 末 | Δ |
| --- | --- | --- | --- |
| 测试套件 | 102 | **106** | +4 |
| 测试用例 | 2635 | **2695** | +60 |
| test 失败 | 0 | **0** | — |
| `audit:global-rate-limit:strict` | ✅ | **✅** | — |
| `audit:s31-global-rate-limit-coverage:strict` | ✅ | **✅** | — |
| `audit:s31-ts-coverage:strict` | ✅ | **✅** | — |
| `audit:error-codes:strict` | ✅ | **✅** | — |
| `audit:errors-singleton:strict` | ✅ | **✅** | — |
| `audit:env-secrets:strict` | ✅ | **✅** | — |
| `audit:common-refs` | ✅ | **✅** | — |
| `sync:common:check` | ✅ | **✅** | — |
| `build:all-services` | 20/20 | **20/20** | — |

### Sprint 48 已知问题（不阻塞）

- shim 脚本（`build-host-service.js` 等 19 个）当前仍存在。Sprint 49 直接调用 `build-all-services.js` 后可删除 shim 并更新 6 个 npm 脚本。
- `payment-state-machine.ts` / `boarding-state-machine.ts` 暂未上 TS（保留为 .js 注释头模式）；Sprint 49 迁移。

---

## 第 7 阶段（Sprint 49 · 2026-06-08）— 业务状态机 TS 化 + 构建脚本收尾

> **目标**：完成最后 2 个业务专用状态机的 TypeScript 迁移 + Sprint 48 构建脚本收尾。

### Sprint 49 任务清单（已完成）

| ID | 任务 | 目标 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| S49-04 | `payment-state-machine.js` → `.ts` 迁移 | 5 状态支付状态机 TS 化 | `payment-state-machine.ts` + .d.ts + 15 迁移测试通过 | ✅ |
| S49-05 | `boarding-state-machine.js` → `.ts` 迁移 | 7 状态寄养订单状态机 TS 化 | `boarding-state-machine.ts` + .d.ts + 15 迁移测试通过 | ✅ |
| S49-06 | 更新 tsconfig 包含新 TS 文件 | paymentService / orderService tsconfig.include | tsc 严格模式 0 错误 | ✅ |
| S49-07 | 迁移状态机 .d.ts + 测试 | 30 个迁移测试 + 47 个行为测试 | 全部 77 个状态机测试通过 | ✅ |
| S49-08 | 最终验证：audit + test:ci + build | 15 项 audit + 2722 个 test:ci + 19 个 build | 100% 通过 | ✅ |
| S49-09 | 编写 `SPRINT_49_DELIVERY.md` | 完整交付文档 | docs/SPRINT_49_DELIVERY.md 落档 | ✅ |

### 度量（Sprint 49 末）

| 指标 | Sprint 48 末 | Sprint 49 末 | Δ |
| --- | --- | --- | --- |
| 业务状态机（.ts 源） | 0 | **2** | +2 |
| 业务状态机（.js 待迁） | 2 | **0** | -2 |
| 状态机迁移测试 | 0 | **30** | +30 |
| 状态机行为测试 | 47 | **47** | 持平 |
| TypeScript .ts 源文件 | 98 | **100** | +2 |
| 测试套件 | 106 | **108** | +2 |
| 测试用例 | 2695 | **2722** | +27 |
| 核心 audit 通过项 | 8 | **15** | +7 |
| build 脚本残留 shim | 19 | **0** | -19 |

### Sprint 49 关键产出

- `cloudfunctions/paymentService/common/payment-state-machine.ts`（5 状态 + 强类型泛型）
- `cloudfunctions/orderService/common/boarding-state-machine.ts`（7 状态 + 4 操作 + 守卫函数）
- `tsconfig.paymentService.json` / `tsconfig.orderService.json` 新增 include
- `scripts/build-all-services.js` TARGETS 新增 state-machine 编译产物
- `test/payment-state-machine-ts-migration.test.js`（15 cases）
- `test/boarding-state-machine-ts-migration.test.js`（15 cases）
- `docs/SPRINT_49_DELIVERY.md`（完整交付文档）
- `CHANGELOG.md` 更新 Unreleased 段

---

## 第 8 阶段（Sprint 50-60 · 规划）— 业务覆盖度 / 性能 / 工具链

### Sprint 50 — 全局限流接入（db 计数替代内存）

**预计：2026-06-10 ~ 2026-06-11**

| ID | 任务 | 目标 | 验收 |
| --- | --- | --- | --- |
| S50-01 | `withRateLimit` 接入 db 计数器 | 解决跨云函数实例限流不一致 | 集成测试：5 节点并发触发仍被拦截 |
| S50-02 | 配置层：限流阈值可热更新 | 无需发版即可调整 | 运营后台或 env 切换 |
| S50-03 | 全局限流覆盖率审计 | 验证所有高频业务类型接入 | `audit:rate-limit-coverage:strict` ≥ 95% |
| S50-04 | 限流监控 + 告警 | 触发即上报 | CLS / Grafana 接入 |

### Sprint 51-52 — 业务覆盖度（剩余 6 个 action 接入风控）

**预计：2026-06-12 ~ 2026-06-15**

| ID | 任务 | 目标 |
| --- | --- | --- |
| S51-01 | `submitMallOrder` 接入 `RISK_*` | 防恶意下单 |
| S51-02 | `applyForActivity` 接入 `RISK_*` | 防活动刷单 |
| S51-03 | `confirmBoardingOrder` 接入 `RISK_*` | 防止商家账号被盗批量接单 |
| S52-01 | 大额下单风控（> 5000 元触发人工审核） | 资金安全 |
| S52-02 | 退款金额风控（单笔 > 2000 元 → 风控打标） | 退款反作弊 |
| S52-03 | 风控策略中心化 | 业务方配置可见可改 |

### Sprint 53-54 — 业务文案 i18n 全量铺开

**预计：2026-06-16 ~ 2026-06-19**

| ID | 任务 | 目标 |
| --- | --- | --- |
| S53-01 | `codemod-page-i18n.js` 全仓库执行 | pages/ 全部 wx.showToast 替换为 $t |
| S53-02 | subpackages/ 页面级 i18n 替换 | 深层页面也走 i18n |
| S53-04 | i18n 运营后台（v1） | 运营可热覆盖文案 |
| S54-01 | ja-JP 文案本地化团队校稿 | 修复机翻错误 |
| S54-02 | i18n CDN 化 + URL 硬编码收口 | `config.js#CDN.I18N_BASE_URL` 落地 |

### Sprint 55-56 — 性能基线 + 性能优化

**预计：2026-06-20 ~ 2026-06-23**

| ID | 任务 | 目标 |
| --- | --- | --- |
| S55-01 | k6 完整场景覆盖（10 个核心业务） | 100% 业务有基线 |
| S55-02 | 冷启动优化 | 首次调用 P95 < 800ms |
| S55-03 | DB 查询性能 Profile | 100 个慢查询优化 |
| S56-01 | Redis 缓存接入 | 热数据 P95 < 50ms |
| S56-02 | CDN 静态资源覆盖率 100% | 减少云函数出口流量 |

### Sprint 57-58 — 监控 + 告警 + 可观测性

**预计：2026-06-24 ~ 2026-06-27**

| ID | 任务 | 目标 |
| --- | --- | --- |
| S57-01 | 业务 metrics 接入 CLS | 关键指标可视化 |
| S57-02 | 错误码分布 dashboard | 实时监控业务异常 |
| S58-01 | 告警规则 | 异常自动通知 |
| S58-02 | Trace 系统接入 | 跨服务调用链追踪 |

### Sprint 59-60 — 文档 / SDK / 移动端体验

**预计：2026-06-28 ~ 2026-07-01**

| ID | 任务 | 目标 |
| --- | --- | --- |
| S59-01 | OpenAPI 文档自动生成 | 后端 SDK 可一键生成 |
| S59-02 | 错误码使用手册 | 客户端 i18n 字典 100% 准确 |
| S60-01 | 性能基线 v2 发布 | 累计性能数据公开 |
| S60-02 | 项目 100% TS 化周年回顾 | blog / 总结 |

### Sprint 50-60 累计目标

| 指标 | Sprint 49 末 | Sprint 50-60 末 | 变化 |
| --- | --- | --- | --- |
| 测试套件 | 110 | **130** | +20 |
| 测试用例 | 2800 | **4500** | +1700 |
| 单元测试覆盖率 | 95% | **98%** | +3% |
| 业务限流点 | 4 | **10** | +6 |
| 风控覆盖业务线 | 4 | **10** | +6 |
| 性能基线场景 | 1 | **10** | +9 |
| i18n 业务文案 | 55 | **200+** | +145 |
| 集成测试子链路 | 17 | **25** | +8 |
| CI 门禁 job | 9 | **12** | +3 |

---

## 风险与缓解（全局）

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| TS 化后类型膨胀 → CI 编译慢 | 开发者体验 | 增量 tsc + 缓存 |
| 状态机 TS 化引入 breaking change | 业务不可用 | shim 兼容 + 灰度 |
| 全局限流 db 计数 → 性能 | 接口 RT +20ms | 内存 L1 + 异步 flush L2 |
| 风控接入过严 → 误伤正常用户 | 客诉 | 保守默认值 + 监控 + 人工审核 |
| i18n 替换回归风险 | 国际化用户体验 | codemod + 人工 review + 灰度 |
| 性能优化过度 → 维护成本 | 后续接手困难 | YAGNI，先满足 P95 |

---

## 度量来源

- **测试套件 / 用例数**：`npm run test:ci` 输出（最新 108 / 2722）
- **TS 化率**：Sprint 47 末为 100%；Sprint 48-49 维持 100%
- **业务状态机 .ts 数**：Sprint 49 末 = 2（payment-state-machine.ts + boarding-state-machine.ts）
- **错误码注册表**：`grep -cE "^\s+[A-Z_]+:\s*\{" cloudfunctions/common/errors.js` = 50
- **audit 脚本**：`ls scripts/audit-*.js` = 42
- **build 脚本**：`ls scripts/build-*.js` = 2（all-services + i18n）
- **集成测试子链路**：`grep -l "integration/" test/` = 17
- **CI 门禁 job**：`.github/workflows/` 8 个

---

## 关键链接

- [Sprint 1-17 交付文档](./SPRINT_*_DELIVERY.md)（除 SPRINT_20-24 未独立成文）
- [Sprint 18](SPRINT_18_DELIVERY.md) — 风控扩展 + BusinessError 修复
- [Sprint 19](SPRINT_19_DELIVERY.md) — 跨模块 errors 单源
- [Sprint 25-31](SPRINT_2[5-9]_DELIVERY.md) + [Sprint 30](SPRINT_30_DELIVERY.md) + [Sprint 31](SPRINT_31_DELIVERY.md) — 子服务 TS 化
- [Sprint 32](SPRINT_32_DELIVERY.md) — 移除废弃 `orderService/payment.ts`
- [Sprint 33-38](SPRINT_3[3-8]_DELIVERY.md) — 11 个 service 单体 TS 化
- [Sprint 39](SPRINT_39_DELIVERY.md) — Pre-existing 修复
- [Sprint 40-45](SPRINT_4[0-5]_DELIVERY.md) — 6 个 service 单体 TS 化
- [Sprint 46](SPRINT_46_DELIVERY.md) — 批量 TS 化收官
- [Sprint 47](SPRINT_47_DELIVERY.md) — 核心聚合入口 TS 化（paymentService / orderService）
- [Sprint 48](SPRINT_48_DELIVERY.md) — 文件清理 + build script 合并
- [Sprint 49](SPRINT_49_DELIVERY.md) — 业务状态机 TS 化 + 构建脚本收尾

> **Sprint 20-24**：横向工作期，业务线 / 后台维护 / 性能 / i18n 校稿等持续推进，未单独成文。

---

**v2.1 计划：Sprint 49 完成，准备进入 Sprint 50 业务深化阶段。**
