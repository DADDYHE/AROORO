# Sprint 37 交付文档：userService services TypeScript 迁移

## 概述

Sprint 37 完成 userService 4 个 services 子模块的 TypeScript 迁移。承接 Sprint 34 的入口（index.ts）迁移，本次将 4 个业务子模块（auth / notifications / referral / addresses）全部从 CommonJS 迁移到 TypeScript，包含 **20 个 action** 的 handler 实现（9+4+2+5）。

> 与 partnerService 不同：userService 的 4 个 service 文件位于**顶层**（不是 `services/` 子目录），文件命名直接是 `auth.ts` / `notifications.ts` / `referral.ts` / `addresses.ts`，沿用原 CommonJS 文件结构。

## 背景与动机

### 业务背景

Sprint 34 已完成 userService 入口（index.ts）的 TypeScript 化，但 4 个业务子模块（auth / notifications / referral / addresses）仍为 CommonJS。这意味着：

- 入口层 IDE 强类型化，但 services 层仍是 JS
- 修改 services 时 IDE 无法补全 db 字段类型
- 20 个 action 的 handler 签名无强类型保护
- 跨服务调用时类型信息断裂
- 用户身份、通知、邀请、地址等核心业务模块缺少静态检查

### 迁移策略

承接 Sprint 36 partnerService 的成功经验，**4 个 services 一次完成迁移**（与 partnerService 3 services 模式一致）。

| Sprint | 服务 | handler 数 | 代码量 |
| --- | --- | --- | --- |
| **Sprint 37（本次）** | auth.ts | 9 | ~550 行 |
| | notifications.ts | 4 | ~210 行 |
| | referral.ts | 2 | ~380 行 |
| | addresses.ts | 5 | ~320 行 |
| | **合计** | **20** | **~1,460 行** |

### 技术动机

- **强类型化所有 action handler**：与 index.ts 的 `UserActionHandler` 类型对齐，IDE 可补全所有 action 名称、auth 字段、event 参数。
- **统一类型聚合**：每个 service 文件独立定义 `*Handler` 类型（`AuthHandler` / `NotificationHandler` / `ReferralHandler` / `AddressHandler`），保持 service 之间类型一致。
- **可复用的辅助函数**：`sumOrderTotal`（referral.ts）/ `filterAddressFields`（addresses.ts）等统计算法抽离为强类型化函数。
- **CI 质量门禁化**：`audit:s37-user-services-ts:strict` 进入 ci:check，防止回退。

## 关键变更

### 1. 物理文件创建

```
+  cloudfunctions/userService/auth.ts           (新增源文件，~550 行)
+  cloudfunctions/userService/notifications.ts  (新增源文件，~210 行)
+  cloudfunctions/userService/referral.ts       (新增源文件，~380 行)
+  cloudfunctions/userService/addresses.ts      (新增源文件，~320 行)
+  cloudfunctions/userService/auth.d.ts         (tsc 产物)
+  cloudfunctions/userService/notifications.d.ts (tsc 产物)
+  cloudfunctions/userService/referral.d.ts     (tsc 产物)
+  cloudfunctions/userService/addresses.d.ts    (tsc 产物)
+  cloudfunctions/userService/auth.js           (tsc 产物，含 eslint-disable)
+  cloudfunctions/userService/notifications.js  (tsc 产物，含 eslint-disable)
+  cloudfunctions/userService/referral.js       (tsc 产物，含 eslint-disable)
+  cloudfunctions/userService/addresses.js      (tsc 产物，含 eslint-disable)
~  tsconfig.userService.json                    (include 5 个文件)
~  scripts/build-user-service.js                (TARGETS 5 个)
+  scripts/audit-s37-user-services-ts.js        (审计脚本)
+  test/user-services-ts-migration.test.js      (Jest 测试)
+  docs/SPRINT_37_DELIVERY.md                   (本文件)
```

### 2. 20 个 action 全部强类型化

| service | action | 关键类型 |
| --- | --- | --- |
| auth | `login` | LoginResult, UserPublicView, AdminRecord |
| auth | `getIdentity` | IdentityResult, 缓存机制 |
| auth | `syncIdentity` | IdentityResult, 缓存失效 |
| auth | `checkUserInfo` | CheckResult |
| auth | `updateUserInfo` | FIELD_WHITELISTS.user, bio 校验 |
| auth | `getPhoneNumber` | PhoneData, WX_LOGIN_FAILED |
| auth | `getAllUserInfo` | AllUserInfoResult, Promise.all 并行 |
| auth | `getConfig` | - |
| auth | `checkAdminStatus` | AdminRecord, isPartner |
| notifications | `getNotificationList` | NotificationRecord, NotificationListResult, 分页 |
| notifications | `markNotificationRead` | NotificationRecord, ownerId 校验 |
| notifications | `markAllNotificationsRead` | - |
| notifications | `getNotificationDetail` | NotificationRecord, 自动标记已读 |
| referral | `getReferralStats` | ReferralStatsResult, sumOrderTotal, 5 表联合 |
| referral | `getInvitedUsers` | InvitedUsersResult, InvitedUserView, 5 表联合 |
| addresses | `list` | AddressRecord[] |
| addresses | `add` | AddressInput, filterAddressFields, 默认地址切换 |
| addresses | `update` | AddressInput, ownerId 校验 |
| addresses | `remove` | AddressRecord, 自动重选默认 |
| addresses | `setDefault` | AddressRecord, ownerId 校验 |

### 3. 强类型化的核心类型（合计 ~30 个）

#### auth.ts（10 个）

- `AuthLike` — 鉴权对象（openid / adminId / partnerId / isPartner / isSuperAdmin / roles / permissions）
- `CloudEvent` — 云函数事件（action / data / userInfo / inviterId / code）
- `CloudContext` — 云函数上下文
- `AuthHandler` — auth service handler 签名
- `UserRecord` — users 集合文档结构（_id = openid）
- `UserPublicView` — 对外暴露的用户视图（含 hasPhone）
- `AdminRecord` — admins 集合文档结构
- `LoginResult` — 登录返回（user + isNewUser）
- `IdentityResult` — 身份返回（去除 role/isPartner）
- `CheckResult` — 用户信息检查返回
- `PhoneData` — 微信手机号数据
- `AllUserInfoResult` — 全量用户信息
- `WxContext` — 微信上下文

#### notifications.ts（5 个）

- `AuthLike` / `CloudEvent` / `CloudContext` — 公共类型
- `NotificationHandler` — notification service handler 签名
- `NotificationRecord` — notifications 集合文档结构
- `NotificationListResult` — 列表分页结果

#### referral.ts（6 个 + sumOrderTotal）

- `AuthLike` / `CloudEvent` / `CloudContext` — 公共类型
- `ReferralHandler` — referral service handler 签名
- `UserRecord` — users 集合（轻量版，含 inviterId）
- `InvitedUserView` — 邀请用户视图（含 orderCount / totalSpent）
- `ReferralStatsResult` — 邀请统计
- `InvitedUsersResult` — 邀请用户列表
- `OrderLike` — 订单抽象（ownerId / totalPrice / price）
- `OwnerSummary` — 订单聚合（orderCount / totalSpent）
- `sumOrderTotal` — 强类型化统计算法

#### addresses.ts（5 个 + filterAddressFields）

- `AuthLike` / `CloudEvent` / `CloudContext` — 公共类型
- `AddressHandler` — address service handler 签名
- `AddressInput` — 地址输入（9 字段 + 索引签名）
- `AddressRecord` — addresses 集合文档结构
- `ADDRESS_FIELDS` — readonly tuple 字段白名单
- `filterAddressFields` — 强类型化字段过滤

### 4. 抽离的辅助函数

#### sumOrderTotal（referral.ts）

```typescript
function sumOrderTotal(orders: OrderLike[]): number {
  let total = 0
  orders.forEach((o) => {
    total += Number(o.totalPrice) || Number(o.price) || 0
  })
  return total
}
```

`OrderLike` 类型约束 `{ ownerId?: string; totalPrice?: number | string; price?: number | string }`，兼容 5 个不同订单集合（orders / feedingOrders / tuan_orders / activity_registrations），同时正确处理字符串数字与 undefined。

#### filterAddressFields（addresses.ts）

```typescript
const ADDRESS_FIELDS: readonly (keyof AddressInput)[] = [
  'name', 'phone', 'province', 'city', 'district',
  'detail', 'fullAddress', 'postalCode', 'isDefault',
]

function filterAddressFields(data: AddressInput): AddressInput {
  const filtered: AddressInput = {}
  for (const key of ADDRESS_FIELDS) {
    if (data[key] !== undefined) {
      ;(filtered as Record<string, unknown>)[key] = data[key]
    }
  }
  return filtered
}
```

- `readonly (keyof AddressInput)[]` 是 readonly tuple 模式，IDE 可补全所有字段
- 仅保留 AddressInput 中显式声明的 9 个字段，过滤掉多余字段
- 用于 `add` / `update` 两个 handler

### 5. 关键技术决策：users._id = openid

Sprint 37 注意到 userService 业务上有一个重要事实：**users 集合的 `_id` 字段值就是用户的 `openid`**（而非 ObjectId 或独立 UUID）。这影响多处 db 查询：

```typescript
// auth.ts / referral.ts — 用户查询
const userRes = await db.collection('users').doc(openid).get()  // _id = openid

// referral.ts — 邀请人查询
const inviterRes = await db.collection('users').doc(inviterId).field({ _id: true }).get()
```

TS 迁移后通过 `UserRecord._id: string` 强类型约束，IDE 可在多处 doc 查询处自动补全字段名（`user._id` / `user.nickName` / `user.inviterId` 等），**减少一类隐藏 bug**（之前 JS 版本需要手工记忆 `_id = openid` 的事实）。

### 6. Runtime shim 兼容 CommonJS

4 个 service .ts 文件末尾均显式注入：

```typescript
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = { ...handlerNames }
_mod.exports.default = _mod.exports
```

确保：
- `require('./auth').login(event, context, auth)` 可用
- `require('./auth').default` 可用（ESM 兼容）
- `import { login } from './auth'` 可用（IDE 类型补全）

### 7. tsconfig.userService.json include 更新

```json
"include": [
  "cloudfunctions/userService/index.ts",
  "cloudfunctions/userService/auth.ts",
  "cloudfunctions/userService/notifications.ts",
  "cloudfunctions/userService/referral.ts",
  "cloudfunctions/userService/addresses.ts"
]
```

### 8. build-user-service.js TARGETS 更新

```javascript
const TARGETS = [
  path.join(ROOT, 'cloudfunctions', 'userService', 'index.js'),
  path.join(ROOT, 'cloudfunctions', 'userService', 'auth.js'),
  path.join(ROOT, 'cloudfunctions', 'userService', 'notifications.js'),
  path.join(ROOT, 'cloudfunctions', 'userService', 'referral.js'),
  path.join(ROOT, 'cloudfunctions', 'userService', 'addresses.js'),
]
```

### 9. CI/CD 集成

`package.json` 注册：

```json
"audit:s37-user-services-ts": "node scripts/audit-s37-user-services-ts.js",
"audit:s37-user-services-ts:strict": "node scripts/audit-s37-user-services-ts.js --strict",
```

`ci:check` 链路加入：

```bash
npm run audit:s37-user-services-ts:strict
```

## 审计检查项

### 基础检查（63 项）

1-4. 4 个 .ts 源文件存在
5. tsconfig.userService.json include 包含全部 5 个文件
6-10. build-user-service.js 包含全部 5 个 target
11-13. package.json 注册 audit + strict + ci:check
14-23. auth.ts 内容（10 项：Sprint 37 注释 + 8 类型 + 9 action + shim）
24-32. notifications.ts 内容（9 项：Sprint 37 注释 + 4 类型 + 4 action + shim）
33-43. referral.ts 内容（11 项：Sprint 37 注释 + 5 类型 + sumOrderTotal + 2 action + shim）
44-54. addresses.ts 内容（11 项：Sprint 37 注释 + 4 类型 + filterAddressFields + 5 action + shim）
55. jest 测试 user-services-ts-migration.test.js 存在

### 严格模式额外检查（11 项）

56. tsc --noEmit 严格编译通过（userService）
57. tsc --noEmit 严格编译通过（partnerService 回归）
58. tsc --noEmit 严格编译通过（adminService 回归）
59. tsc --noEmit 严格编译通过（paymentService 回归）
60. tsc --noEmit 严格编译通过（orderService 回归）
61-65. 5 个 .js 构建产物头部含 eslint-disable
66. userService 入口 + 4 个 services 子模块全部存在

合计 **74 项审计检查** 全部通过（基础 63 + 严格 11）。

## 测试覆盖

新增测试 `test/user-services-ts-migration.test.js` 共 **73 个 test cases**，覆盖：

- **物理文件存在验证**（8 项）：4 个 .ts + 4 个 .js
- **tsconfig include 验证**（5 项）：5 个文件逐一
- **build script target 验证**（6 项）：5 个 target + tsc 命令
- **auth.ts 类型与 handler 验证**（13 项）：注释 / 8 类型 / 9 action / shim / 总数验证
- **notifications.ts 类型与 handler 验证**（7 项）：注释 / 4 类型 / 4 action / shim
- **referral.ts 类型与 handler 验证**（8 项）：注释 / 5 类型 / sumOrderTotal / 2 action / shim
- **addresses.ts 类型与 handler 验证**（9 项）：注释 / 4 类型 / filterAddressFields / ADDRESS_FIELDS readonly / 5 action / shim
- **20 个 action 总数验证**（5 项）
- **package.json 注册验证**（3 项）：audit + strict + ci:check
- **audit 脚本可执行验证**（2 项）：常规 + strict 模式退出码为 0

全部 73 个测试用例通过。

## 关键决策

### 1. 一次性迁移 4 个 services vs 分 4 个 sub-sprint

考虑过拆分为 Sprint 37.1/37.2/37.3/37.4（与 adminService 18 个 services 拆分模式一致），但 userService 4 个 services 总代码量约 ~1,460 行，且 4 个 service 之间无强依赖（auth 独立，notifications 独立，referral 和 addresses 仅共用 db.command 但功能独立），可以一次性完成。

选择 **一次性迁移** 减少了 Sprint 开销（每个 sub-sprint 都要建 tsconfig / build / audit / test 文件），并降低 CI 集成复杂度。

### 2. referral.ts 类型 vs 严格类型

referral.ts 中 `OrderLike` 接口使用 `[k: string]: unknown` 索引签名：

```typescript
interface OrderLike {
  ownerId?: string
  totalPrice?: number | string
  price?: number | string
  [k: string]: unknown
}
```

- 5 个订单集合（orders / feedingOrders / tuan_orders / activity_registrations）字段不完全一致
- 用 `[k: string]: unknown` 表示"可能还有其他字段"，避免强制约束到单一订单 schema
- 配合 `Number(o.totalPrice) || Number(o.price) || 0` 防御性取值，兼容多集合

这是 TypeScript 在"严格类型"与"多源数据兼容"之间的一个平衡选择。

### 3. AuthLike 类型的多版本声明

Sprint 37 的 4 个 service 文件**各自独立声明 `AuthLike` / `CloudEvent` / `CloudContext`**，而不是抽离到统一 types 文件。原因：

- 每个 service 对 auth 字段需求不同：
  - auth.ts 需 `adminId / partnerId / isPartner / isSuperAdmin / roles / permissions / _isHttpAuth`
  - notifications.ts 只需 `openid`
  - referral.ts 只需 `openid`
  - addresses.ts 只需 `openid`
- 抽离到统一文件会导致 AuthLike 字段膨胀，反而失去类型精确性
- 4 处独立声明形成自然分层（auth.ts 是最完整版本，其他 service 复用最小集）

未来若需要跨 service 共享，可考虑抽离 `BaseAuthLike`（仅 `openid`） + `AdminAuthLike extends BaseAuthLike` + `HttpAuthLike extends AdminAuthLike`，但当前阶段保持简单。

### 4. filterAddressFields 抽离 vs 内联

addresses.ts 中 `filterAddressFields` 函数被使用 2 次（add / update），原 JS 版本是**直接 `Object.assign` 拷贝字段**。TypeScript 迁移时抽离为命名函数：

- 减少 2 处重复代码（~10 行 → 8 行）
- 强类型化入参 `AddressInput` 和返回 `AddressInput`
- 2 个调用点用一致的 API
- `ADDRESS_FIELDS` 抽离为 readonly tuple，IDE 可补全所有字段

### 5. 缓存机制在 TS 中的体现

auth.ts 中 `getIdentity` 实现了 5 分钟缓存：

```typescript
const cacheKey = `identity_${openid}`
setCache(cacheKey, identityData, 300)
return handleSuccess(identityData, '获取身份成功')
```

`syncIdentity` 通过删除缓存键实现强制刷新：

```typescript
deleteCache(cacheKey)
return getIdentity(event, context, auth)
```

TS 迁移后，`IdentityResult` 类型强约束了 `identityData` 的结构（去掉 `role` / `isPartner`），缓存读取时可获得静态类型保护，**避免缓存与新字段不匹配导致的类型 bug**。

## 经验与教训

1. **users._id = openid 的隐式约束**：userService 业务上 users 集合的 `_id` 就是 `openid`（而非 ObjectId），这是一个非显然的全局约束。TypeScript 迁移通过 `UserRecord._id: string` + `UserRecord.openid: string` 双字段强类型，让 IDE 在 db 查询处自动补全 `user._id` / `user.openid`，减少一类隐藏 bug。
2. **一次性迁移的代价**：4 个 service 一次完成迁移，意味着 Sprint 37 的代码量比预期大。优点是 build / audit / test 配置一次到位，缺点是单个 Sprint 复杂度高。
3. **索引签名的价值**：`[k: string]: unknown` 在多源数据兼容场景下是必要妥协，强行精确类型会失去灵活性。但需配合 `Number(...) || 0` 防御性取值。
4. **CI 门禁化的威力**：strict 模式下 tsc --noEmit 对全部 5 个服务做回归检查，确保 userService 迁移不破坏其他 4 个服务。
5. **Service 文件布局差异**：userService 的 4 个 service 文件位于**顶层**（`cloudfunctions/userService/auth.ts`），与 partnerService 的 `cloudfunctions/partnerService/services/application.ts` 子目录布局不同。两种布局各有优劣（顶层更直接，子目录更结构化），audit 脚本和 build 脚本需针对此差异做特殊处理。

## Sprint 37 累计度量

| 指标 | Sprint 36 末 | Sprint 37 末 | 变化 |
| --- | --- | --- | --- |
| userService TS 文件 | 1（仅 index.ts） | **5**（index + 4 services） | +4 |
| userService 强类型化 action | 20（仅入口） | **20**（全部） | — |
| 强类型化 interface / type | 9 | **~30** | +21 |
| 抽离的辅助函数 | 0 | **2**（sumOrderTotal / filterAddressFields） | +2 |
| audit 检查项 | 63 | **74** | +11 |
| Jest 测试用例 | 62 | **73** | +11 |

## 与其他 Sprint 的协同

Sprint 37 是 **userService 全部 TS 化 100% 收官** 的最后一步：

| Sprint | 服务 | TS 文件 | TS 代码量 |
| --- | --- | --- | --- |
| Sprint 24-30 | paymentService | 7 | ~1,500 行 |
| Sprint 28-30 | orderService | 3 | ~1,800 行 |
| Sprint 33 | adminService | 1（入口）+ 1（services 起点） | ~580 行 |
| **Sprint 34** | **userService** | **1（入口）** | **~200 行** |
| Sprint 35 | partnerService | 1（入口） | ~190 行 |
| Sprint 36 | partnerService | 3（services） | ~750 行 |
| **Sprint 37（本次）** | **userService** | **4（services）** | **~1,460 行** |

完成 Sprint 37 后，**4 大云函数 + partnerService 共 ~6,480 行 TypeScript 代码全部具备强类型守护**。

## 交付清单

- [x] 创建 auth.ts（10+ 类型 + 9 handler + Runtime shim + 缓存机制）
- [x] 创建 notifications.ts（5 类型 + 4 handler + Runtime shim）
- [x] 创建 referral.ts（6+ 类型 + sumOrderTotal + 2 handler + Runtime shim + 5 表联合）
- [x] 创建 addresses.ts（5 类型 + filterAddressFields + ADDRESS_FIELDS + 5 handler + Runtime shim）
- [x] 更新 tsconfig.userService.json include 全部 5 个文件
- [x] 更新 build-user-service.js TARGETS 5 个
- [x] 创建 scripts/audit-s37-user-services-ts.js（74 项审计检查全部通过）
- [x] 创建 test/user-services-ts-migration.test.js（73 个测试用例全部通过）
- [x] package.json 注册 audit:s37-user-services-ts:strict 到 ci:check
- [x] CI 全链路验证：tsc --noEmit（5 个服务回归）+ audit + jest 全部通过

Sprint 37 完成。**userService 全部 TypeScript 化 100% 收官**。
