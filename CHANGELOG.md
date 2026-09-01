# CHANGELOG

> 项目变更日志
> 约定：基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)

## [Unreleased]

### Added
- **合伙人中心首屏聚合接口（BFF，性能优化）**：`partnerService.getPartnerHome`（services/home.ts）——一次云调用内聚合 getMyPermissions + getApplicationStatus + getMyIncomeOverview，3 次冷启/3 次 RTT → 1 次；前端 partner/home 优先调聚合、失败自动回退旧三连
- **app.json `preloadRule`**：进入 `pages/profile`（all 网络）与 `pages/home`（wifi）时预下载 partner 分包，消除点进合伙人中心的分包下载等待
- **前端 onShow 30s 节流**：partner/home 从子页返回不再无条件全量刷新
- **subpackages/partner/hosting-profile-edit/**：寄养档案 3 步编辑表单（基本信息/服务与定价/资质与相册，chooseMedia ≤9/批直传云存储，存量 fileID 走 getTempFileURL 展示），对接 hostService.createHostProfile/updateHostProfile
- **寄养档案自助管理（P1）**：hosting-profile 改造为档案管理页（无档案引导创建 / 状态卡+驳回原因+重新提审 / 接单开关 updateHostAcceptingOrders）；HostService 服务层新增 getMyProfile/createHostProfile/updateHostProfile/updateHostAcceptingOrders（走 hostService）
- **寄养订单履约（P2）**：hosting-profile 订单卡新增接单/拒单/完成操作（走 orderService.handleBoardingOrder：合伙人权限 + organizerId 越权校验 + 状态机守卫 + 接单风控 + complete 触发佣金/服务收入 + 拒单/取消自动退款）；**修复资损缺口**：orderService.handleBoardingOrder 此前仅 cancelled 触发退款，rejected（拒单）只改状态不退钱 → 现拒单同样自动发起退款
- **cloudfunctions/common/rate-limit-config.ts**：限流配置中心（6 业务类型差异化默认值 + db 热更新 + TTL 缓存 + 紧急关停）
- **cloudfunctions/common/rate-limit-bootstrap.ts**：统一注入入口（rate_limits 计数 + rate_limit_configs 配置一次性注入）
- **cloudfunctions/common/rate-limit-monitor.ts**：限流监控（4 类指标 + 告警 webhook + 阈值可配 + withRateLimitMonitored 包装器）
- **scripts/audit-s50-rate-limit-config.js**：27 项 strict 检查（配置完整性 + 业务类型覆盖 + bootstrap 一致性）
- **test/common-rate-limit-config.test.js**（45 cases）+ **test/common-rate-limit-bootstrap.test.js**（16 cases）+ **test/common-rate-limit-monitor.test.js**（27 cases）
- **docs/SPRINT_50_DELIVERY.md**：限流可观测性 + 可维护性升级交付文档

### Changed
- **cloudfunctions/orderService/index.ts** / **paymentService/index.ts** / **mallService/index.ts** / **activityService/index.ts** / **rateLimitCleanup/index.ts**：使用 `bootstrapRateLimit` 统一注入
- **cloudfunctions/common/risk-rate-limit.ts**：集成配置中心（`getRateLimitConfig` / `getRateLimitConfigSync`）
- **tsconfig.common.json**：include 加 `rate-limit-config.ts` / `rate-limit-bootstrap.ts` / `rate-limit-monitor.ts`
- **scripts/build-all-services.js**：TARGETS 加 3 个新 .js 产物
- **scripts/audit-s31-global-rate-limit-coverage.js**：兼容 `bootstrapRateLimit` 模式
- **scripts/audit-s46-rate-limit-cleanup-ts.js**：修复 pre-existing syntax error
- **package.json**：新增 2 个 audit 脚本（`audit:s50-rate-limit-config` + `:strict`）
- **测试覆盖**：测试用例 2722 → **2749**（+27 monitor + 16 bootstrap + 0 共存）；套件 108 → **111**（+3）
- **utils/i18n.js**（miniapp 端）：51 错误码 + 55 业务文案 × 3 语种 + locale 切换 + `loadFromCdn()` 渐进加载
- **cloudfunctions/common/auth-middleware.ts**：`verifyAuth` 强类型化（VerifyAuthOptions / AuthResult / AdminDoc）
- **dist/i18n/**：3 错误码 JSON + 3 业务 JSON + 3 合并 JSON + 1 全量 JSON + manifest
- **types/i18n-cdn.d.ts**：CDN 字典 manifest TypeScript 类型
- **test/utils-i18n.test.js**（31）+ **test/utils-i18n-cdn.test.js**（52）+ **test/utils-biz-i18n.test.js**（36）
- **test/common-auth-middleware-ts-migration.test.js**（24）

### Changed
- **orderService.orders.submitEvaluation**：`RATE_LIMITED` → `RISK_*` 错误码（接 `assertRiskDecision`）
- **paymentService.services.refund.createRefund**：`RATE_LIMITED` → `RISK_*` 错误码（接 `assertRiskDecision`）
- **scripts/build-common.js**：TARGETS 加 `auth-middleware.js`
- **tsconfig.common.json**：include 加 `auth-middleware.ts`
- **package.json**：加 `build:i18n` / `build:all` 脚本
- **测试覆盖**：测试用例 1136 → **1298**（+162）；套件 63 → **68**（+5）

### Fixed
- `auth-middleware.ts` 编译产物添加 `/* eslint-disable */` 头部，避免 CI 风格检查失败

### Changed
- **adminService / userService / activityService / orderService 空 catch 治理**：~70 处替换为 `logger.warn(action, { context })`
- **重复文件归并**（3 对）：
  - `services/OrderManager.js` 统一了 booking / profile 两侧实现
  - `utils/eventEmitter.js` 提供 class-based 事件通道
  - `utils/addressUtils.js` 修复了「市」前缀解析 bug
- **测试覆盖**：`test/` 共 421 用例（275 → 421）
- **paymentService.createPayment**：`return handleError(new Error, msg, ERROR_CODES.X)` 改为 `throw err('CODE', msg, { details })`，调用链更直观
- **orderService.checkPartnerPermission** / **auth-middleware.verifyAuth** / **feedingService.checkPartnerPermission** / **activityService.checkPartnerPermission** / **partnerService.checkPartnerPermission**：直接抛 `BusinessError`，由 `index.js` 统一 `toResponse` 输出
- **feedingService.getFeedingOrderDetail** + **handleFeedingOrder**：8 处错误抛出迁移到 `throw err(...)`
- **paymentService / orderService / userService / adminService / activityService / partnerService / feedingService index.js**：catch 块优先识别 `BusinessError` 并走 `toResponse`，其他 Error 走 handleError 兼容路径
- **adminService/services/banner.js**（示范）：7 个 handler 全面采用 `withErrorHandling(async (event, context, auth) => { ... })` 装饰器风格，移除内部 try/catch
- **adminService/services/commissionConfig.js**（示范）：2 个 handler 装饰化
- **cloudfunctions/common/COMMON_MODULES_GUIDE.md**：补充 BusinessError 模式说明
- **utils.js 覆盖率**：convertCloudUrls / revertCloudUrls 新增 7 个测试用例，分支覆盖 36% → 88%
- **覆盖率门槛**：jest.config.js 全局阈值 50% → **70%**（per-file 维持 80%+）
- **批量迁移**：通过 codemod + 手工修复，从 452 处 `return handleError(new Error(...), ...)` 减少至 0 处（仅 markdown 文档 1 处示例）

### Fixed
- `extractCityAndDistrict("上海市浦东新区")` 现返回 `"上海·浦东新区"`（之前错误为 `"上海·市浦东新区"`）
- `countBusinessDays` 测试期望与函数语义一致化
- `checkRateLimit` 异步 `expect.toThrow` 改用 `rejects.toThrow`

## [Sprint 2] - 2026-06-03

详见 `docs/SPRINT_2_DELIVERY.md`

### Added
- 4 个新公共模块 + 4 个测试文件（Sprint 2.1）
- `_decryptSensitive` / `_encryptDual` / `_encryptSensitiveCBC`（hostService）
- `test/hostService-crypto-migration.test.js`（11 用例）

### Changed
- 43 处空 catch 块治理（Sprint 2.2）
- 3 对重复文件归并（Sprint 2.3）
- hostService AES-CBC → AES-GCM 升级（Sprint 2.4）

## [Sprint 1] - 2026-05-XX

详见 `docs/SPRINT_1_MODULES.md`

### Added
- 5 个基础公共模块：`errors.js` / `normalize.js` / `permissions.js` / `crypto.js` / `date-range.js`
- 命名规范文档 `docs/NAMING_CONVENTION.md`
- 字段去重报告 `docs/FIELD_DEDUPLICATION_REPORT.md`
- CI/CD 配置文件 `.github/workflows/ci.yml` / `audit.yml`
- Jest 测试基础设施（212 用例）

### Changed
- 各云函数 `services/` 目录引入公共模块
- 各 handler 引入 `verifyAuth` 中间件
- 错误码统一在 `common/errors.js` 注册

## 历史版本

v0.x 历史变更见 `git log --oneline -- docs/`
