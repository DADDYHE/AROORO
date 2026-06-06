# CHANGELOG

> 项目变更日志
> 约定：基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)

## [Unreleased]

### Added
- **scripts/build-i18n.js**：i18n 字典预编译为 JSON（10 个产物 + 1 个 .d.ts + manifest.json）
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
