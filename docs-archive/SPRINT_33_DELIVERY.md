# Sprint 33 交付文档：adminService TypeScript 迁移

## 概述

Sprint 33 完成 adminService 云函数入口（index.ts）与常量（constants.ts）的 TypeScript 迁移。adminService 是云函数体系中最复杂的入口（处理 16+ 类业务模块、120+ 个 action），本次只迁移入口层与共享常量，18 个 services 子模块继续以 CommonJS 提供，被 index.ts 通过 `require('./services/xxx')` 动态加载。

## 背景与动机

### 业务背景

adminService 承担了管理后台 / 合作伙伴小程序 / HTTP-Web 端三端调用的统一入口，包含：

- **16 个 handler services**（被 index.ts 聚合）
  - activity / adminManagement / application / auth / banner / commissionConfig / coupon / feeding / hosting / i18nOverride / mall / stats / tuan / upload / user / wallet
- **2 个 utility services**（被其他 service 引用）
  - stateMachine / commission
- **120+ 个 action**：覆盖订单 / 退款 / 钱包 / 提现 / 活动 / 团购 / 商品 / Banner / 优惠券 / 寄养 / 喂养 / 用户 / 管理员 / 应用审批 / 仪表盘 / 财务 / i18n / 上传等所有业务线

### 迁移策略

考虑到 adminService 体量巨大（18 个 services + 120+ action + 复杂 HTTP/JWT 双协议路径），Sprint 33 采用 **"入口先行 + services 后续"** 的渐进式迁移策略：

| 阶段 | 范围 | Sprint |
| --- | --- | --- |
| **Sprint 33（本次）** | index.ts + constants.ts | 入口层 + 共享常量 |
| Sprint 33.1（后续） | 18 个 services/*.ts 逐个迁移 | 业务层 |
| Sprint 33.2（后续） | 各 service 内部公共逻辑抽取到 common/*.ts | 公共层 |

本次只完成第一阶段，建立 TypeScript 构建基础设施和审计闭环。

### 技术动机

- **入口层强类型化**：index.js 中有 200+ 行权限配置 + HTTP/JWT 解析逻辑，迁移为 TS 后 IDE 可补全所有权限等级、action 名称、auth 字段。
- **类型守护 CloudBase 调用**：`_enrichAdminDb: CloudBaseDB | null` 强类型消除 NPE 风险。
- **构建基础设施统一**：与 paymentService / orderService 共享相同的 `tsconfig.{service}.json` 模式 + `scripts/build-{service}.js` 编译脚本。
- **CI 质量门禁化**：`audit:s33-admin-service-ts:strict` 进入 ci:check，防止回退。

## 关键变更

### 1. 物理文件创建

```
+  cloudfunctions/adminService/index.ts        (新增源文件，~580 行)
+  cloudfunctions/adminService/constants.ts    (新增源文件，~36 行)
+  tsconfig.adminService.json                  (新增 TS 配置)
+  scripts/build-admin-service.js              (新增编译脚本)
+  scripts/audit-s33-admin-service-ts.js       (新增审计脚本)
+  test/admin-service-ts-migration.test.js     (新增 Jest 测试)
+  docs/SPRINT_33_DELIVERY.md                  (本文件)

+  tsconfig.common.json                        (补全缺失文件)
+  tsconfig.orderService.json                  (补全缺失文件)
+  tsconfig.paymentService.json                (补全缺失文件)
```

### 2. 强类型化的核心类型

`index.ts` 集中导出了 11 个核心类型，覆盖 adminService 入口的所有数据流：

| 类型 | 用途 |
| --- | --- |
| `PermissionLevel` | 权限等级字面量联合（null / partner / admin / super_admin） |
| `ActionHandler` / `CloudFunctionHandler` | 通用 handler 签名（E, C, A） |
| `AuthLike` | 鉴权结果对象（openid / adminId / roles / permissions 等） |
| `CloudEvent` | 入参事件对象（action / data / body / headers / accessToken 等） |
| `CloudContext` | CloudBase 上下文（含 HTTP_CONTEXT） |
| `HttpInfo` | HTTP 解析结果（action / data / _httpContext） |
| `HttpInfoOrError` / `HttpParseError` | 解析成功 / 失败联合类型 |
| `JwtDecodedToken` | JWT 解码结果（openid / adminId / isPartner / isSuperAdmin / exp） |
| `EnrichmentResult` | admins collection 补全结果（admin / roles / permissions / isPartner） |
| `CorsHeaders` | CORS 响应头类型 |
| `HttpResponse` | HTTP 响应（statusCode / headers / body） |

### 3. Runtime shim 兼容 CommonJS

TypeScript 默认导出 ES Module 语法，但 CloudBase 云函数 runtime 加载的是 CommonJS。index.ts 在末尾显式注入：

```typescript
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = { main }
_mod.exports.main = main
_mod.exports.default = _mod.exports
```

确保：
- `require('./index').main(event, context)` 可用（CloudBase runtime 入口）
- `require('./index').main` 可用（ESM 兼容）
- `import { main } from './index'` 可用（IDE 类型补全）

### 4. tsconfig.adminService.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "resolveJsonModule": true
  },
  "include": [
    "cloudfunctions/adminService/index.ts",
    "cloudfunctions/adminService/constants.ts"
  ]
}
```

### 5. build-admin-service.js

与 build-common.js / build-payment-service.js / build-order-service.js 风格一致：

1. 清理 tsc 可能产出的多余 `common/` / `adminService/` 副本
2. 运行 `npx --yes -p typescript@5.4.5 tsc -p tsconfig.adminService.json`
3. 再次清理（tsc 会重新生成副本）
4. 在 index.js / constants.js 顶部注入 `/* eslint-disable */` 标记

### 6. CI/CD 集成

`package.json` 注册：

```json
"audit:s33-admin-service-ts": "node scripts/audit-s33-admin-service-ts.js",
"audit:s33-admin-service-ts:strict": "node scripts/audit-s33-admin-service-ts.js --strict",
```

`ci:check` 链路加入：

```bash
npm run audit:s33-admin-service-ts:strict
```

## 审计检查项

### 基础检查（36 项）

1-6. 物理文件存在（index.ts / index.d.ts / index.js / constants.ts / constants.d.ts / constants.js）
7. tsconfig.adminService.json include index.ts + constants.ts
8-10. build-admin-service.js 配置（包含 index.js + constants.js target）
11-14. package.json 注册 audit + strict + ci:check
15-25. index.ts 类型定义（11 个核心类型 + ACTION_PERMISSIONS + main + handlers + shim）
26-31. constants.ts 类型定义（Sprint 33 + as const + OrderTypeKey + shim）
32-36. 其他（tsconfig strict 配置、build 脚本、test 存在）

### 严格模式额外检查（9 项）

37. tsc --noEmit 严格编译通过（adminService）
38. tsc --noEmit 严格编译通过（paymentService 回归）
39. tsc --noEmit 严格编译通过（orderService 回归）
40. index.js 头部含 eslint-disable 标记
41. constants.js 头部含 eslint-disable 标记
42. index.js 导出 main 函数
43. constants.js 导出 ORDER_TYPES
44. adminService 18 services 模块全部存在
45. index.ts 引入全部 16 handler services

## 测试覆盖

新增测试 `test/admin-service-ts-migration.test.js` 共 65 个 test cases，覆盖：

- **物理文件存在验证**（6 项）：.ts / .d.ts / .js 文件
- **tsconfig 配置验证**（7 项）：include / strict / target / module / declaration
- **build 脚本验证**（4 项）：存在 + 使用 tsc + 包含 index.js + constants.js
- **index.ts 类型定义验证**（17 项）：11 个接口 + 4 个类型 + main + handlers + shim
- **constants.ts 类型定义验证**（7 项）：as const + 2 个常量 + OrderTypeKey + shim
- **18 services 未破坏验证**（19 项）：16 handler + 2 utility .js 存在 + index.ts 全部引入
- **package.json 注册验证**（3 项）：audit script + ci:check
- **audit 脚本可执行验证**（2 项）：常规 + strict 模式退出码为 0

全部 65 个测试用例通过。

## 关键决策

### 1. 入口先行 vs 全量迁移

考虑过一次性迁移 18 个 services 子模块（每个 ~200-500 行），但风险过高：

- 16 个 services 共有 120+ 个 action，每个 action 都有不同的 event/auth 签名
- HTTP/JWT 双协议路径在每个 service 内部都有自定义鉴权
- 一次性迁移容易引入回归

最终选择 **入口先行**：建立 TypeScript 基础设施后，每个 service 可独立迁移、单独 review、单独发布。

### 2. services 仍为 CommonJS

`index.ts` 通过 `require('./services/xxx')` 加载 .js（CommonJS），与原 `index.js` 行为完全一致。这样：

- 16+2 个 service 子模块无需修改
- 18 个 service 可独立 Sprint 迁移（每个 ~500-1500 行代码量适中）
- tsc 编译产物 index.js / constants.js 可被 CloudBase runtime 直接加载

### 3. 强类型 ACTION_PERMISSIONS

`Record<string, PermissionLevel>` 类型约束每个 action 的权限等级只能是 4 个字面量之一，避免字符串拼写错误（如 `'super_Admin'` vs `'super_admin'`）。

### 4. type guard 替代类型断言

`parseHttpEvent` 的返回类型是 `HttpInfo | HttpParseError`，主函数用 `isHttpInfo()` type guard 进行类型收窄，比 `as HttpInfo` 断言更安全。

## 经验与教训

1. **tsc strict 模式的 4 个 NPE 风险**：strict 模式下 TypeScript 会对所有 nullable 类型做严格检查，本次共发现 3 个潜在 NPE 风险（HttpInfoOrError 收窄、_enrichAdminDb null 处理、parseError 后的类型收窄），都是迁移前未发现的隐患。
2. **类型 guard 比断言更稳健**：单纯用 `as HttpInfo` 可以让 tsc 通过，但运行时会真正调用 `(null).action`；type guard 在编译期就保证 null 已被处理。
3. **i18nOverride 等含数字命名**：[a-zA-Z]+ 不足以覆盖所有服务名，迁移时要注意保持 `[a-zA-Z0-9]+` 完整字符类。
4. **utility vs handler 分离**：audit 脚本要清楚区分"被 index.ts require 的 handler"和"被其他 service 内部引用的 utility"，避免误判。
5. **入口先行的价值**：完成 Sprint 33 后，后续 18 个 services 的迁移都基于统一的 ActionHandler 签名，可以独立 Sprint 进行，不会破坏入口行为。

## Sprint 33+ 后续规划

完成 Sprint 33 入口迁移后，剩余的 adminService services 子模块迁移：

| Sprint | 服务 | handler 数 | 预计代码量 |
| --- | --- | --- | --- |
| Sprint 33.1 | services/auth.js | 9 | ~600 行 |
| Sprint 33.2 | services/adminManagement.js | 5 | ~400 行 |
| Sprint 33.3 | services/user.js + services/wallet.js | 12 | ~700 行 |
| Sprint 33.4 | services/application.js | 5 | ~350 行 |
| Sprint 33.5 | services/hosting.js | 12 | ~700 行 |
| Sprint 33.6 | services/feeding.js | 9 | ~550 行 |
| Sprint 33.7 | services/activity.js | 7 | ~500 行 |
| Sprint 33.8 | services/mall.js | 16 | ~900 行 |
| Sprint 33.9 | services/banner.js + services/coupon.js | 20 | ~1100 行 |
| Sprint 33.10 | services/tuan.js | 12 | ~700 行 |
| Sprint 33.11 | services/stats.js + services/upload.js | 8 | ~500 行 |
| Sprint 33.12 | services/commissionConfig.js + i18nOverride.js | 11 | ~600 行 |

预计 12 个 sub-sprint 全部完成 adminService 完全 TS 化。

## 交付清单

- [x] 创建 index.ts（强类型化 11 个核心接口 + PermissionLevel / ActionHandler / handlers / main）
- [x] 创建 constants.ts（强类型化 ORDER_TYPES / ORDER_TYPE_NAMES + OrderTypeKey）
- [x] 创建 tsconfig.adminService.json（strict + CommonJS + ES2020）
- [x] 创建 tsconfig.common.json（补全缺失文件）
- [x] 创建 tsconfig.orderService.json（补全缺失文件）
- [x] 创建 tsconfig.paymentService.json（补全缺失文件）
- [x] 创建 scripts/build-admin-service.js（编译 + eslint-disable 注入 + 清理 tsc 副本）
- [x] 创建 scripts/audit-s33-admin-service-ts.js（45 项审计检查全部通过）
- [x] 创建 test/admin-service-ts-migration.test.js（65 个测试用例全部通过）
- [x] package.json 注册 audit:s33-admin-service-ts:strict 到 ci:check
- [x] CI 全链路验证：tsc --noEmit（3 个服务）+ audit + jest 全部通过

Sprint 33 完成。
