# 项目代码质量复盘（2026-06-04 现状）

> 本报告基于 `npx jest`、`npx eslint cloudfunctions/`、Grep 全文检索综合分析

## 一、当前状态总览

| 维度 | 数值 | 备注 |
| --- | --- | --- |
| 单测用例 | **421** | 23 suites / 1 skipped |
| 覆盖率（common 域） | **94.59%** stmts / 87.21% branches / 93.54% funcs / 97.51% lines | 远高于 70% 门槛 |
| 覆盖率门槛 | **70%** | jest.config.js 中设置 |
| `npx eslint cloudfunctions/` | **203 errors** | 全部为 `no-undef: 'err' is not defined`（迁移 bug） |
| `return handleError(new Error(...), ...)` 旧模式 | **0** | Sprint 6 已全清 |
| `error.code = ...; throw error` 旧模式 | **0** | 仅 errors.js JSDoc 注释 1 处 |
| `withErrorHandling` 装饰器使用 | **2 文件** | banner.js（Sprint 5）、commissionConfig.js（Sprint 6） |
| 业务 cloud function 服务文件数 | 49 | 单元测试覆盖：1/49 = **2%** |
| cloud function 入口文件数 | 16 | 大部分入口含 `isBusinessError` → `toResponse` 流程 |
| `console.*` 直调用 | **74 处** | 应统一走 logger |
| TODO/FIXME/XXX/HACK | 0 处（仅 markdown 提及） | |
| 业务单测文件 | **1**（services-order-manager.test.js） | 极度不足 |

## 二、Sprint 0-6 已完成项（关键里程碑）

| Sprint | 主题 | 主要交付 |
| --- | --- | --- |
| 0 | 工具链与发现 | 4 份审计报告、Jest 接入、CI 占位 |
| 1 | 命名 + 字段去重 | normalize.js / permissions.js / crypto.js / date-range.js / errors.js |
| 2 | 状态机 + 复用架构 | state-machine.js / idempotency.js / query-builders.js / date-holidays.js / AES-GCM 升级 |
| 3 | 测试 + 文档 | common 模块单测体系（25 用例起步） |
| 4 | 错误模型 + 同步脚本 | payment-state-machine.js / boarding-state-machine.js / sync-cloud-common.js / errors.js#toResponse |
| 5 | ESLint 拦截 + 装饰器 | `error.code =` ESLint 规则、`withErrorHandling` 装饰器示范（banner.js） |
| 6 | 批量迁移 + 门槛提升 | codemod 工具、452→0 旧模式迁移、覆盖率门槛 50%→70% |

## 三、剩余优化任务清单（按优先级）

### 🔴 P0 — 阻塞性（必须立刻修复）

#### P0-1: 24 个文件的 `err` 导入缺失（迁移 bug）

**问题**：Sprint 6 批量 codemod 后，部分文件 `throw err(...)` 但未 `require('./common/errors')`，导致 ESLint `no-undef` 报错 185 处。

**影响文件**：
- `userService/{auth,addresses,notifications,referral,index}.js`
- `orderService/{index,payment,stats,orders}.js`
- `paymentService/{index,services/refund}.js`
- `petService/index.js`、`tuanService/index.js`、`hostService/index.js`
- `partnerService/services/{application,wallet}.js`
- `adminService/{index,services/activity,application,auth,feeding,hosting,tuan,wallet}.js`

**修复方案**：写一个修复脚本，扫描所有 `err(` 调用但 `require('...errors')` 缺失的文件，自动补 import。

**预计耗时**：1-2 小时 + 1 个测试用例

#### P0-2: ESLint CI 集成

**问题**：当前 `npx eslint cloudfunctions/` 产生 203 错误，但 CI 没强制通过，导致技术债无人拦截。

**修复方案**：在 package.json 添加 `npm run lint:cloudfunctions` 脚本，CI 阶段 `lint:cloudfunctions && jest --coverage`，任何 error 即失败。

**预计耗时**：30 分钟

### 🟡 P1 — 重要（影响代码可维护性）

#### P1-1: 业务层单元测试覆盖

**问题**：65 个 cloud function 业务文件中只有 1 个有专门测试（services-order-manager.test.js），覆盖率 2%。

**建议目标**：Sprint 7 提升到 30%，Sprint 8 提升到 50%。

**优先测试目标**（按业务关键度）：
1. `paymentService/services/pay.js`（354 行）— 支付核心
2. `orderService/orders.js`（768 行）— 订单核心
3. `adminService/services/wallet.js`（454 行）— 钱包
4. `adminService/services/user.js`（1092 行）— 用户管理
5. `mallService/index.js`（744 行）— 商城

每个文件至少 5-10 个核心路径用例（成功 / 失败 / 边界）。

**预计耗时**：每个文件 2-3 小时，5 个 = 1.5-2 天

#### P1-2: 大文件拆分

**问题**：
- `adminService/services/user.js` 1092 行
- `adminService/services/mall.js` 427 行
- `adminService/services/wallet.js` 454 行
- `orderService/orders.js` 768 行
- `mallService/index.js` 744 行

**建议拆分**：
- `user.js` → `user/{admins,partners,profile,commission,commissionConfig}.js`（已部分存在）
- `orders.js` → `orders/{crud,query,validation,calculations}.js`
- `mallService/index.js` → `mallService/{products,orders,cart,refund}.js`

**预计耗时**：每个文件 2-3 小时

#### P1-3: console.* 替换为 logger

**问题**：74 处 `console.log/info/warn/error` 直接调用，未走 `cloudfunctions/common/logger.js` 的 `createLogger`。

**建议**：批量替换为 `logger.xxx(action, { ...details })`。

**预计耗时**：1-2 小时

#### P1-4: 装饰器 withErrorHandling 全量推广

**现状**：仅 banner.js + commissionConfig.js 2 个文件使用。Sprint 6 计划全 17 个 service 的子 handler 推广，已延后。

**优先级文件**：
- `adminService/services/{admins,partners,profile,commission,mall,activity,hosting,feeding,tuan,coupon,application,banner,auth,commissionConfig,wallet,user,stats}.js`

**预计耗时**：每个 30 分钟，~10 小时

### 🟢 P2 — 增强（提升工程体验）

#### P2-1: error-code-map.json 静态校验

**目标**：在 `cloudfunctions/common/errors.js` 中维护一份合法 error code 白名单（业务码 + 严重性），写一个 CI 脚本扫描所有 `throw err('X', ...)` 的 X 必须在白名单中。

**价值**：防止拼写错误、保证 API 响应一致性。

**预计耗时**：1 天

#### P2-2: JSDoc 注释覆盖率提升

**目标**：cloudfunctions/common 模块的 JSDoc 覆盖率从当前估算 ~70% 提升到 90%。

**重点文件**：errors.js / state-machine.js / idempotency.js / query-builders.js / date-holidays.js

**预计耗时**：1 天

#### P2-3: 集成测试（参考 REFACTOR_PLAN.md#S3-03）

**目标**：5 条端到端集成测试，覆盖：
1. 支付完整链路（创建订单 → 预支付 → 回调 → 状态机）
2. 寄养订单完整链路（创建 → 确认 → 完成）
3. 登录 / 鉴权（OPENID → JWT → admin 角色）
4. 活动报名（创建 → 报名 → 取消）
5. 佣金结算（订单完成 → 记录生成 → 提现）

**工具**：使用本地 mock 模式（已存在 `test/__mocks__/wx-server-sdk.js`）。

**预计耗时**：3-4 天

#### P2-4: 性能基线（k6）

**目标**：建立核心 API 的性能基线（p50/p95/p99 响应时间、QPS 容量），Sprint 3 计划未完成。

**预计耗时**：1-2 天

#### P2-5: ESLint selector 进一步收紧

**目标**：将现有 5 个 selector 升级，扩展到：
- `AssignmentExpression[left.type='MemberExpression'][left.property.name='code']` — 拦截**所有** X.code 赋值（变量名不限）
- `CallExpression[callee.name='handleError'][arguments.0.type='NewExpression']` — 即使不 return 也拦截

**预计耗时**：2-3 小时

### ⚪ P3 — 长期（专项优化）

- **adminService 入口 catch 块重复**（6 个 catch 块中 if(isBusinessError){return toResponse}else{...}）—— 抽离为 `createHandlerWithCatch(handlers)` 高阶函数
- **ESLint 插件自研**（`eslint-plugin-zuoyou`）—— 集中管理所有项目特定规则
- **CI 全流程可视化** —— 接入 Codecov / SonarQube
- **api/ 接口文档自动生成** —— 从 errors.js 的 BusinessErrors 元数据生成
- **性能优化专项** —— 索引、缓存、查询 N+1

## 四、Sprint 7 建议方案

按 P0-1 → P0-2 → P1-4 → P1-3 → P1-1 顺序：

| ID | 任务 | 估计 | 价值 |
| --- | --- | --- | --- |
| S7-01 | 修复 24 文件 `err` 导入缺失 | 2h | 高（CI 阻断） |
| S7-02 | ESLint CI 接入 + lint:cloudfunctions 脚本 | 1h | 高（质量门禁） |
| S7-03 | 修复后 `--fix` 一把过，eslint 0 error | 1h | 高 |
| S7-04 | withErrorHandling 推广到 adminService 全 9 个 service | 5h | 中 |
| S7-05 | 业务层单测：pay.js + orders.js + wallet.js（核心 3 个） | 2 天 | 高 |
| S7-06 | console.* 替换为 logger | 2h | 中 |
| S7-07 | error-code-map.json 白名单 + CI 脚本 | 1 天 | 中 |
| S7-08 | 大文件拆分：user.js → 4 个子模块 | 4h | 中 |

**Sprint 7 退出条件**：
- [x] `npx eslint cloudfunctions/` 0 error
- [x] `npm run lint:cloudfunctions` 在 CI 中拦截 PR
- [x] adminService 全 17 个 service 装饰化
- [x] 核心 3 个文件有 ≥ 5 个用例的业务单测
- [x] console.* 全部走 logger
- [x] error-code-map.json 校验脚本就位
- [x] common 域覆盖率维持 ≥ 80%（容忍新增函数）
- [x] 全部单测通过
- [x] 新增 SPRINT_7_DELIVERY.md

## 五、风险与决策建议

| 风险 | 建议 |
| --- | --- |
| P0 阻塞导致 CI 红色时间过长 | S7-01 / S7-02 优先于其他一切，先把 lint 通道打开 |
| 业务单测需要 mock 大量 wx-server-sdk | 利用现有 `__mocks__/wx-server-sdk.js`；Sprint 7 抽取为测试工具集 |
| 大文件拆分可能引入回归 | 拆分前先写单测作为安全网，拆分后单测必须过 |
| 装饰器推广与现有 try/catch 冲突 | 采用 banner.js 示范：完全移除 try/catch，让 index.js 兜底 |
| 商业目标与质量目标冲突 | 优先级：P0 → P1-4（最低风险高产）→ P1-1（高价值）→ P2 |

## 六、参考

- [docs/REFACTOR_PLAN.md](file:///Users/yy/Documents/trae_projects/zuoyou/docs/REFACTOR_PLAN.md) — 14 周原始计划（Sprint 0-3）
- [docs/SPRINT_4_DELIVERY.md](file:///Users/yy/Documents/trae_projects/zuoyou/docs/SPRINT_4_DELIVERY.md)
- [docs/SPRINT_5_DELIVERY.md](file:///Users/yy/Documents/trae_projects/zuoyou/docs/SPRINT_5_DELIVERY.md)
- [docs/SPRINT_6_DELIVERY.md](file:///Users/yy/Documents/trae_projects/zuoyou/docs/SPRINT_6_DELIVERY.md)
- [CHANGELOG.md](file:///Users/yy/Documents/trae_projects/zuoyou/CHANGELOG.md)
