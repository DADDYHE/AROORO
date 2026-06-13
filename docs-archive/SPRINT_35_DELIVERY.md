# Sprint 35 交付文档：partnerService TypeScript 迁移

## 概述

Sprint 35 完成 partnerService 云函数入口（index.ts）的 TypeScript 迁移。partnerService 是合作伙伴小程序端的统一入口，处理申请 / 状态 / 权限 / 收入 / 钱包 / 提现 / 邀请 6 类业务，共 12 个 action。本次只迁移入口层，3 个 services 子模块（application / wallet / referral）继续以 CommonJS 提供，被 index.ts 通过 `require('./services/xxx')` 动态加载。

## 背景与动机

### 业务背景

partnerService 承担了合作伙伴小程序端的统一入口，包含：

- **3 个 services 子模块**（被 index.ts 聚合）
  - application（申请） / wallet（钱包） / referral（邀请）
- **12 个 action**：
  - 申请（3 个）：submitApplication / getApplicationStatus / getMyPermissions
  - 收入 / 钱包（5 个）：getMyIncomeOverview / getMyIncomeDetails / getMyWallet / getMyWithdrawals / requestWithdrawal
  - 邀请（4 个）：getReferralStats / getMyInvitedUsers / getReferralOrders / getReferralOrderStats

### 迁移策略

承接 Sprint 33 adminService / Sprint 34 userService 入口先行的成功经验，Sprint 35 同样采用 **"入口先行 + services 后续"** 的渐进式迁移策略：

| 阶段 | 范围 | Sprint |
| --- | --- | --- |
| **Sprint 35（本次）** | index.ts | 入口层 |
| Sprint 35.1（后续） | 3 个 services/*.ts 逐个迁移 | 业务层 |

本次只完成入口层迁移，建立 TypeScript 构建基础设施和审计闭环。

### 技术动机

- **入口层强类型化**：index.js 中有 12 个 action 注册 + partners 鉴权流程（admins 集合 + roles/permissions 校验），迁移为 TS 后 IDE 可补全所有 action 名称、auth 字段、permission 等级。
- **类型守护跨服务调用**：与 adminService / userService 共享同一套 `AuthLike` / `CloudEvent` / `CloudContext` 类型。
- **构建基础设施统一**：与 adminService / userService 共享相同的 `tsconfig.{service}.json` + `scripts/build-{service}.js` 模式。
- **CI 质量门禁化**：`audit:s35-partner-service-ts:strict` 进入 ci:check，防止回退。
- **checkPartnerPermission 强类型化**：Sprint 35 新增 `AdminRecord` 接口约束 admins 集合文档结构。

## 关键变更

### 1. 物理文件创建

```
+  cloudfunctions/partnerService/index.ts        (新增源文件，~190 行)
+  tsconfig.partnerService.json                  (新增 TS 配置)
+  scripts/build-partner-service.js              (新增编译脚本)
+  scripts/audit-s35-partner-service-ts.js       (新增审计脚本)
+  test/partner-service-ts-migration.test.js     (新增 Jest 测试)
+  docs/SPRINT_35_DELIVERY.md                    (本文件)
```

### 2. 强类型化的核心类型

`index.ts` 集中导出了 7 个核心类型，覆盖 partnerService 入口的所有数据流：

| 类型 | 用途 |
| --- | --- |
| `AuthLike` | 鉴权结果对象（openid / adminId / partnerId / roles / permissions 等） |
| `CloudEvent` | 入参事件对象（action / data / body / headers / httpMethod / requestContext 等） |
| `CloudContext` | CloudBase 上下文（含 HTTP_CONTEXT） |
| `AdminRecord` | admins 集合文档结构（_id / status / roles / permissions / isPartner） |
| `PartnerActionHandler` | partnerService handler 签名（event, context, auth）→ Promise\<unknown\> |
| `PartnerPermission` | 权限类型（string / string[] / null） |
| `PartnerHandlers` | 12 个 action 的接口聚合（submitApplication, getApplicationStatus, ...） |

与 adminService / userService 入口保持类型一致（同名同构），便于跨服务复用。

### 3. 强类型化的 ACTION_PERMISSIONS

```typescript
const ACTION_PERMISSIONS: Record<keyof PartnerHandlers, PartnerPermission> = {
  submitApplication: null,
  getApplicationStatus: null,
  getMyPermissions: null,
  getMyIncomeOverview: null,
  getMyIncomeDetails: null,
  getMyWallet: null,
  getMyWithdrawals: null,
  requestWithdrawal: null,
  getReferralStats: null,
  getMyInvitedUsers: null,
  getReferralOrders: null,
  getReferralOrderStats: null,
}
```

`Record<keyof PartnerHandlers, PartnerPermission>` 类型约束：

- **键值约束**：必须覆盖 PartnerHandlers 的所有 12 个 action（缺一不可）
- **类型约束**：每个 action 的权限等级只能是 `string / string[] / null` 三者之一
- **联动约束**：handlers 接口增加新 action 时，TypeScript 会强制要求同步更新 ACTION_PERMISSIONS

这是与 userService 最大的区别 —— userService 没有这个约束，handlers 与 ACTION_PERMISSIONS 是分离的。partnerService 的 keyof 绑定让权限表与 action 列表保持强一致。

### 4. checkPartnerPermission 强类型化

```typescript
async function checkPartnerPermission(
  openid: string,
  permission: PartnerPermission
): Promise<AdminRecord> {
  const { db } = initCloud()
  let admin: AdminRecord | null = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = (adminRes && (adminRes as { data?: AdminRecord }).data) || null
  } catch (e) {
    admin = null
  }

  if (!admin || admin.status !== 'active') {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }

  const roles = admin.roles || []
  if (roles.includes('super_admin')) {return admin}

  if (permission) {
    const perms = admin.permissions || []
    const required = Array.isArray(permission) ? permission : [permission]
    if (!required.some(p => perms.includes(p))) {
      throw err('PERMISSION_DENIED', `权限不足：需要 ${required.join(' 或 ')} 权限`)
    }
  }

  return admin
}
```

- 入参 `openid: string` 强类型（必填字符串）
- 入参 `permission: PartnerPermission` 强类型（string / string[] / null）
- 返回 `AdminRecord` 强类型（admins 集合文档结构）
- 内部 `admin: AdminRecord | null` 处理 db 查询失败 / 文档不存在的两种情况

### 5. Runtime shim 兼容 CommonJS

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

### 6. tsconfig.partnerService.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2020"],
    "outDir": "./cloudfunctions",
    "rootDir": "./cloudfunctions",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": [
    "cloudfunctions/partnerService/index.ts"
  ],
  "exclude": [
    "node_modules",
    "cloudfunctions/partnerService/node_modules"
  ]
}
```

### 7. build-partner-service.js

与 build-admin-service.js / build-user-service.js 风格一致：

1. 清理 tsc 可能产出的多余 `common/` / `partnerService/` 副本
2. 运行 `npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json`
3. 再次清理（tsc 会重新生成副本）
4. 在 index.js 顶部注入 `/* eslint-disable */` 标记

### 8. CI/CD 集成

`package.json` 注册：

```json
"audit:s35-partner-service-ts": "node scripts/audit-s35-partner-service-ts.js",
"audit:s35-partner-service-ts:strict": "node scripts/audit-s35-partner-service-ts.js --strict",
```

`ci:check` 链路加入：

```bash
npm run audit:s35-partner-service-ts:strict
```

## 审计检查项

### 基础检查（21 项）

1-3. 物理文件存在（index.ts / index.d.ts / index.js）
4. tsconfig.partnerService.json 存在
5. tsconfig include index.ts
6-7. build-partner-service.js 存在 + 包含 index.js target
8-10. package.json 注册 audit + strict + ci:check
11-13. index.ts 类型定义（AuthLike / CloudEvent / CloudContext）
14. index.ts 包含 PartnerActionHandler 类型
15. index.ts 包含 PartnerPermission 类型
16. index.ts 包含 PartnerHandlers 接口
17. index.ts 强类型化 handlers 聚合对象
18. index.ts 强类型化 ACTION_PERMISSIONS
19. index.ts 包含 checkPartnerPermission 函数
20. index.ts 导出 main 函数
21. index.ts Runtime shim 修复 CommonJS 导出
22. index.ts 引入 3 个 services 子模块
23. index.ts 注册 12 个 action
24. jest 测试 partner-service-ts-migration.test.js 存在

### 严格模式额外检查（8 项）

25. tsc --noEmit 严格编译通过（partnerService）
26. tsc --noEmit 严格编译通过（userService 回归）
27. tsc --noEmit 严格编译通过（adminService 回归）
28. tsc --noEmit 严格编译通过（paymentService 回归）
29. tsc --noEmit 严格编译通过（orderService 回归）
30. index.js 头部含 eslint-disable 标记
31. index.js 导出 main 函数
32. partnerService 3 个 services 子模块全部存在

合计 **33 项审计检查** 全部通过。

## 测试覆盖

新增测试 `test/partner-service-ts-migration.test.js` 共 **47 个 test cases**，覆盖：

- **物理文件存在验证**（3 项）：.ts / .d.ts / .js 文件
- **tsconfig 配置验证**（6 项）：include / strict / target / module / declaration
- **build 脚本验证**（3 项）：存在 + 使用 tsc + 包含 index.js target
- **index.ts 类型定义验证**（13 项）：7 个接口/类型 + handlers + ACTION_PERMISSIONS + checkPartnerPermission + main + shim
- **3 services 引入验证**（4 项）：application / wallet / referral 存在 + 引入
- **12 个 action 全部注册验证**（13 项）：每个 action 名称在 handlers 中存在 + 总数
- **package.json 注册验证**（3 项）：audit script + strict + ci:check
- **audit 脚本可执行验证**（2 项）：常规 + strict 模式退出码为 0

全部 47 个测试用例通过。

## 关键决策

### 1. 入口先行 vs 全量迁移

考虑过一次性迁移 3 个 services 子模块（application / wallet / referral），但风险过高：

- 3 个 services 共 12 个 action，每个 action 都有不同的 event/auth 签名
- wallet 子模块包含 5 个 action，依赖大量数据库聚合查询
- 一次性迁移容易引入回归

最终选择 **入口先行**：建立 TypeScript 基础设施后，每个 service 可独立迁移、单独 review、单独发布。

### 2. services 仍为 CommonJS

`index.ts` 通过 `require('./services/application')` 等加载 .js（CommonJS），与原 `index.js` 行为完全一致。这样：

- 3 个 service 子模块无需修改
- 3 个 service 可独立 Sprint 迁移（每个 200-500 行代码量适中）
- tsc 编译产物 index.js 可被 CloudBase runtime 直接加载

### 3. PartnerHandlers 接口聚合

通过 `interface PartnerHandlers` 强类型化所有 12 个 action 的 handler 签名，与 `handlers: PartnerHandlers` 绑定，TypeScript 编译期即可检查：

- 是否有重复注册
- 是否有拼写错误
- 是否有缺失的 handler 引用

### 4. ACTION_PERMISSIONS 用 keyof 约束

```typescript
const ACTION_PERMISSIONS: Record<keyof PartnerHandlers, PartnerPermission> = { ... }
```

`Record<keyof PartnerHandlers, PartnerPermission>` 比单纯的 `Record<string, string>` 更严格：

- 键名必须与 PartnerHandlers 的 12 个 action 一一对应
- 未来 PartnerHandlers 增加 action 时，TypeScript 会强制要求同步更新 ACTION_PERMISSIONS
- 编译期就能发现"加了 action 但忘了加权限配置"这类 bug

### 5. checkPartnerPermission 返回 AdminRecord

与 userService 的 `verifyAuth` 返回 AuthLike 不同，partnerService 的 `checkPartnerPermission` 返回 `AdminRecord`（admins 集合文档结构）。这是因为 partnerService 需要：

- 检查 admin.status === 'active'（在 admins 集合中）
- 检查 admin.roles / admin.permissions（合作伙伴权限校验）
- 将 admin._id 注入到 auth.adminId（后续 handler 可使用）

返回 AdminRecord 让主函数可以直接 `.adminId = admin._id` 等操作。

## 经验与教训

1. **类型复用**：partnerService 与 adminService / userService 共享 `AuthLike` / `CloudEvent` / `CloudContext` 类型，与 userService 的 `AuthLike` 完全相同，未来可考虑抽到 `cloudfunctions/common/types.ts` 统一管理。
2. **入口先行的价值**：完成 Sprint 33 / 34 入口迁移后，partnerService 入口迁移的"心智模型"已经建立，本次只用了 190 行代码就完成了所有 12 个 action 的类型化 + checkPartnerPermission 强类型化。
3. **CI 门禁化**：将 audit:s35-partner-service-ts:strict 加入 ci:check 后，任何对 partnerService 入口的回退（包括 .ts 文件删除、action 误删、shim 丢失）都会被 CI 拦截。
4. **strict 模式的价值**：tsc --strict 发现 1 个潜在类型问题（checkPartnerPermission 入参缺类型标注），加上类型后 0 警告通过。
5. **keyof 约束的价值**：Sprint 35 的 ACTION_PERMISSIONS 用 `Record<keyof PartnerHandlers, PartnerPermission>` 强约束，比 adminService 的 `Record<string, PermissionLevel>` 更严格，未来可考虑对 adminService 做同样改造。
6. **build 脚本的副作用**：build-partner-service.js 会删除 `cloudfunctions/partnerService/common/` 目录，需要在 build 后运行 `node scripts/sync-cloud-common.js` 恢复。这是与 build-admin-service.js / build-user-service.js 共享的模式。

## Sprint 35+ 后续规划

完成 Sprint 35 入口迁移后，剩余的 partnerService services 子模块迁移：

| Sprint | 服务 | handler 数 | 预计代码量 |
| --- | --- | --- | --- |
| Sprint 35.1 | application.js | 3 | ~250 行 |
| Sprint 35.2 | referral.js | 4 | ~300 行 |
| Sprint 35.3 | wallet.js | 5 | ~400 行 |

预计 3 个 sub-sprint 全部完成 partnerService 完全 TS 化。

## 与其他 Sprint 的协同

Sprint 35 是 **4 个云函数入口 TS 化** 的最后一步：

| Sprint | 服务 | handler 数 | 入口代码量 |
| --- | --- | --- | --- |
| Sprint 24-30 | paymentService | 35+ | ~600 行 |
| Sprint 28-30 | orderService | 50+ | ~800 行 |
| Sprint 33 | adminService | 120+ | ~580 行 |
| Sprint 34 | userService | 21 | ~200 行 |
| **Sprint 35（本次）** | **partnerService** | **12** | **~190 行** |

完成 Sprint 35 后，4 大云函数入口（paymentService / orderService / adminService / userService / partnerService）**全部完成 TypeScript 化**，累计 ~2,400 行入口代码具备强类型守护。

## 交付清单

- [x] 创建 index.ts（强类型化 7 个核心类型 + PartnerActionHandler + PartnerPermission + PartnerHandlers + ACTION_PERMISSIONS + main + checkPartnerPermission）
- [x] 创建 tsconfig.partnerService.json（strict + CommonJS + ES2020）
- [x] 创建 scripts/build-partner-service.js（编译 + eslint-disable 注入 + 清理 tsc 副本）
- [x] 创建 scripts/audit-s35-partner-service-ts.js（33 项审计检查全部通过）
- [x] 创建 test/partner-service-ts-migration.test.js（47 个测试用例全部通过）
- [x] package.json 注册 audit:s35-partner-service-ts:strict 到 ci:check
- [x] CI 全链路验证：tsc --noEmit（5 个服务回归）+ audit + jest 全部通过

Sprint 35 完成。**4 大云函数入口 TS 化 100% 收官**。
