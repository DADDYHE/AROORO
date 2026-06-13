# 用户资料扩展字段 + 权限模型细化 + Partner 入口预检查 实施计划

> **For agentic workers:** 可直接按 Task 顺序执行；每步带具体代码与验证命令。

**Goal:** 修复小程序端"编辑个人信息"页面字段不写入/不读取的真实 bug（落 `users` 集合），并将 `adminService` 的粗粒度 `'partner'` 权限拆分为 `super_admin` / `partner` 两级，最后给 partner 入口加同步预检查。

**Architecture:**
- P0: 扩 `FIELD_WHITELISTS.user` 加入扩展字段 + 让 `userService.check`/`login` 返回完整字段
- P1: 复用现成 `cloudfunctions/common/permissions.ts` 工具（已实现 `requireOrThrow` / `hasPermission` / `isSuperAdmin`），改造 `verifyAuth` 支持 `permission='super_admin' | 'partner' | 'any_admin'`，并把 web 端强管理 action（用户/管理员/财务/数据）从 `ACTION_PERMISSIONS` 标为 `super_admin`
- P2: 在 `subpackages/partner/home` 与 `application` 顶部同步判断 `app.globalData.userInfo.isPartner`，未授权直接 `wx.navigateBack` + toast

**Tech Stack:** 微信小程序 + 腾讯云 CloudBase 云函数（TypeScript 编译到 JavaScript） + Jest（测试 common 模块）

---

## 文件变更总览

| 文件 | 任务 | 操作 |
|---|---|---|
| `cloudfunctions/common/validator.ts` | P0 | 修改 `FIELD_WHITELISTS.user` |
| `cloudfunctions/common/validator.js` | P0 | 重新编译产物 |
| `cloudfunctions/userService/auth.js` | P0 | 修改 `checkUserInfo` / `login` / `getIdentity` 返回完整字段 |
| `test/common-validator.test.js` | P0 | 增补扩展字段白名单断言（已有文件，更新断言） |
| `cloudfunctions/common/auth-middleware.ts` | P1 | 改造 `verifyAuth` 支持 `super_admin` 等级 |
| `cloudfunctions/common/auth-middleware.js` | P1 | 重新编译产物 |
| `cloudfunctions/adminService/index.js` | P1 | 拆分 `ACTION_PERMISSIONS` 权限等级 |
| `test/common-auth-middleware.test.js` | P1 | 增补 `super_admin` 鉴权用例（已有文件） |
| `subpackages/partner/home/index.js` | P2 | onLoad 顶部加同步预检查 |
| `subpackages/partner/application/index.js` | P2 | onLoad 顶部加同步预检查 |

---

## Task 1: P0 - 扩展 FIELD_WHITELISTS.user 支持扩展字段

**Files:**
- Modify: `cloudfunctions/common/validator.ts:124`
- Modify: `cloudfunctions/common/validator.js:95`（重新编译）

- [ ] **Step 1: 修改源文件 FIELD_WHITELISTS.user**

`cloudfunctions/common/validator.ts:124` 改为：

```ts
  user: ['nickName', 'avatarUrl', 'gender', 'phone', 'birthday', 'email', 'address', 'ownerName', 'city', 'province', 'country', 'language', 'bio'],
```

- [ ] **Step 2: 同步修改编译产物（手改 .js 即可，TS 编译产物等价）**

`cloudfunctions/common/validator.js:95` 改为：

```js
    user: ['nickName', 'avatarUrl', 'gender', 'phone', 'birthday', 'email', 'address', 'ownerName', 'city', 'province', 'country', 'language', 'bio'],
```

- [ ] **Step 3: 编译验证（可选，更稳）**

```bash
npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.common.json
```

期望：无 TS 报错。

- [ ] **Step 4: 运行已有 common-validator 单测**

```bash
npx jest test/common-validator.test.js
```

期望：PASS（现有测试只校验 schema/validate 行为，不直接对白名单字符串做断言）。

---

## Task 2: P0 - userService.check / login / getIdentity 返回完整用户字段

**Files:**
- Modify: `cloudfunctions/userService/auth.js`（三处 return）
- Modify: `test/post-commit-correctness.test.js`（如有断言）

- [ ] **Step 1: 修改 `checkUserInfo` 返回完整字段（line 171-176）**

`cloudfunctions/userService/auth.js:171-176` 改为：

```js
    return handleSuccess({
      exists: true,
      _id: user._id,
      openid: user.openid,
      nickName: user.nickName || '',
      avatarUrl: user.avatarUrl || '',
      gender: user.gender || '',
      phone: user.phone || '',
      birthday: user.birthday || '',
      email: user.email || '',
      address: user.address || '',
      ownerName: user.ownerName || '',
      hasPhone: Boolean(user.phone),
    }, '获取用户信息成功')
```

- [ ] **Step 2: 修改 `login` 返回完整字段（line 89-100）**

`cloudfunctions/userService/auth.js:89-100` 改为：

```js
    return handleSuccess({
      user: {
        _id: user._id,
        openid: user.openid,
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || '',
        gender: user.gender || '',
        phone: user.phone || '',
        birthday: user.birthday || '',
        email: user.email || '',
        address: user.address || '',
        ownerName: user.ownerName || '',
        hasPhone: Boolean(user.phone),
        role: user.role || 'user',
        isPartner,
      },
      isNewUser,
    }, isNewUser ? '新用户注册成功' : '登录成功')
```

- [ ] **Step 3: 修改 `getIdentity` 返回完整字段（line 120-128）**

`cloudfunctions/userService/auth.js:120-128` 改为：

```js
    const identityData = {
      user: {
        _id: user._id,
        openid: user.openid,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        gender: user.gender || '',
        phone: user.phone || '',
        birthday: user.birthday || '',
        email: user.email || '',
        address: user.address || '',
        ownerName: user.ownerName || '',
        hasPhone: Boolean(user.phone),
      },
    }
```

- [ ] **Step 4: 同步检查 partner 字段传值是否被影响**

确认 `services/AuthService.js` 中 `_applyToGlobal` / `_persistLoginState` 用到的 user 字段（nickName/avatarUrl/hasPhone/role/isPartner/openid）**全部仍在返回结构中**。新加的字段是**累加**，不会破坏现有调用方。

- [ ] **Step 5: 跑测试**

```bash
npm run lint:cloudfunctions
npx jest test/common-validator.test.js test/common-auth-middleware.test.js
```

期望：lint 无错，jest 通过。

---

## Task 3: P0 - 验证 edit 页面读取路径

**Files:**
- Read-only check: `subpackages/profile/edit/index.js`

- [ ] **Step 1: 确认 edit 页面读取 userInfo 字段与新返回结构匹配**

打开 `subpackages/profile/edit/index.js:178-186`，`loadUserInfo` 期望的字段为 `nickName, gender, phone, birthday, email, address, avatarUrl`，与 Task 2 Step 1-3 返回结构**完全匹配**。无需修改前端代码。

- [ ] **Step 2: 确认 edit 页面写入字段与 FIELD_WHITELISTS.user 匹配**

`subpackages/profile/edit/index.js:134-142` 上传 `{gender, phone, birthday, email, address, avatarUrl, ownerName}` 7 个字段，全部已在 Task 1 Step 1 扩展后的白名单中。**写路径恢复有效**。

---

## Task 4: P1 - 改造 auth-middleware 支持 super_admin 等级

**Files:**
- Modify: `cloudfunctions/common/auth-middleware.ts`
- Modify: `cloudfunctions/common/auth-middleware.js`（编译产物）
- Modify: `test/common-auth-middleware.test.js`

- [ ] **Step 1: 修改源文件 `VerifyAuthOptions.permission` 类型**

`cloudfunctions/common/auth-middleware.ts:27` 改为：

```ts
  permission?: 'partner' | 'admin' | 'super_admin' | null
```

- [ ] **Step 2: 修改 `verifyAuth` 主逻辑支持 super_admin**

`cloudfunctions/common/auth-middleware.ts:90-115`（`if (!permission)` 之后到 `return` 之前）替换为：

```ts
  // ----- 需要特殊身份 -----
  if (!openid) {
    throw err('AUTH_REQUIRED', '未登录')
  }

  const { isSuperAdmin, isPartner } = require('./permissions') as {
    isSuperAdmin: (doc: unknown) => boolean
    isPartner: (doc: unknown) => boolean
  }

  let doc: AdminDoc | null = null
  try {
    const res = await db.collection('admins').doc(openid).get()
    doc = ((res && (res as { data: AdminDoc | null }).data) || null) as AdminDoc | null
  } catch (e) {
    doc = null
  }

  if (!doc || doc.status !== 'active') {
    throw err('PARTNER_REQUIRED', '无有效管理账号')
  }

  if (permission === 'super_admin') {
    if (!isSuperAdmin(doc)) {
      throw err('PERMISSION_DENIED', '需要超级管理员权限')
    }
    return { openid, adminId: doc._id, isSuperAdmin: true }
  }

  if (permission === 'admin') {
    if (!isSuperAdmin(doc)) {
      // 复用 partner 校验（partner 也算 admin 业务）
      if (!isPartner(doc)) {
        throw err('PERMISSION_DENIED', '需要管理员或合作伙伴权限')
      }
    }
    return { openid, adminId: doc._id, isAdmin: true, isSuperAdmin: isSuperAdmin(doc) }
  }

  // permission === 'partner'
  if (!isPartner(doc)) {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }

  return {
    openid,
    partnerId: doc._id,
    isPartner: true,
  }
```

- [ ] **Step 3: 同步修改编译产物 `cloudfunctions/common/auth-middleware.js`**

`cloudfunctions/common/auth-middleware.js:42-58`（`requireLogin && !openid` 之后到结尾）替换为：

```js
  // ----- 需要特殊身份 -----
  if (!openid) {
    throw (0, errors_1.err)('AUTH_REQUIRED', '未登录');
  }
  const { isSuperAdmin, isPartner } = require('./permissions');
  let doc = null;
  try {
      const res = await db.collection('admins').doc(openid).get();
      doc = (res && res.data) || null;
  }
  catch (e) {
      doc = null;
  }
  if (!doc || doc.status !== 'active') {
      throw (0, errors_1.err)('PARTNER_REQUIRED', '无有效管理账号');
  }
  if (permission === 'super_admin') {
      if (!isSuperAdmin(doc)) {
          throw (0, errors_1.err)('PERMISSION_DENIED', '需要超级管理员权限');
      }
      return { openid, adminId: doc._id, isSuperAdmin: true };
  }
  if (permission === 'admin') {
      if (!isSuperAdmin(doc) && !isPartner(doc)) {
          throw (0, errors_1.err)('PERMISSION_DENIED', '需要管理员或合作伙伴权限');
      }
      return { openid, adminId: doc._id, isAdmin: true, isSuperAdmin: isSuperAdmin(doc) };
  }
  if (!isPartner(doc)) {
      throw (0, errors_1.err)('PARTNER_REQUIRED', '无合作伙伴权限');
  }
  return {
      openid,
      partnerId: doc._id,
      isPartner: true,
  };
```

- [ ] **Step 4: 编译验证**

```bash
npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.common.json
```

期望：无 TS 报错。

- [ ] **Step 5: 运行 auth-middleware 单测**

```bash
npx jest test/common-auth-middleware.test.js test/common-permissions.test.js
```

期望：PASS。若有断言 `permission` 只接受 `'partner' | null` 的用例，需更新断言以接受新联合类型。

---

## Task 5: P1 - adminService 拆分 ACTION_PERMISSIONS

**Files:**
- Modify: `cloudfunctions/adminService/index.js:42-180`

- [ ] **Step 1: 引入 super_admin 等级字段**

`cloudfunctions/adminService/index.js` 在 `const ACTION_PERMISSIONS = {` 之前**新增**注释块与 import（如有需要）：

```js
// 权限等级：
//   null            → 仅需登录
//   'partner'       → 合作伙伴身份（含寄养/喂养/团长/活动主）
//   'admin'         → 管理员（含 super_admin / admin / partner）
//   'super_admin'   → 仅 super_admin
```

无需新 import，复用 verifyAuth 已支持的 permission 值。

- [ ] **Step 2: web 管理端强管理 action 改为 super_admin**

`cloudfunctions/adminService/index.js` 中以下 action 改为 `'super_admin'`：

```js
  // 列表
  getAdminList: 'super_admin',
  getAdminDetail: 'super_admin',
  updateAdminStatus: 'super_admin',
  // 用户
  getUserList: 'super_admin',
  getUserDetail: 'super_admin',
  updateUserStatus: 'super_admin',
  // 财务/数据
  getDashboardStats: 'super_admin',
  getEnhancedDashboardStats: 'super_admin',
  getFinanceOverview: 'super_admin',
  // 审批
  approveApplication: 'super_admin',
  rejectApplication: 'super_admin',
  getApplicationList: 'super_admin',
  // 佣金配置
  getPartnerCommissionRates: 'super_admin',
  updatePartnerCommissionRates: 'super_admin',
```

- [ ] **Step 3: 业务/资源类 action 保持 'partner'**

`getBoardingOrders / getHostProfile / getHostProfile / createHostProfile / updateHostProfile / handleBoardingOrder / getPendingHostReviews / reviewHost / getActiveHosts / getDisabledHosts / toggleHostAccepting / toggleHostStatus` 等保持 `'partner'`。

`getActivityList / getActivityDetail / createActivity / updateActivity / getActivityRegistrations / exportActivityRegistrations / getActivityOrders` 保持 `'partner'`。

`getProductList / getProductDetail / createProduct / updateProduct / deleteProduct / getMallOrders / getMallOrderDetail / handleMallOrder / shipMallOrder / completeMallOrder / getProductStats / getCategoryStats / listCategories / createCategory / updateCategory / deleteCategory` 保持 `'partner'`（这些是 partner 业务自营）。

`getFeederList / getFeederDetail / getCurrentFeeder / createFeederProfile / updateFeederProfile / getFeedingOrders / getFeederOrders / handleFeedingOrder / getFeedingOrderDetail` 保持 `'partner'`。

`getBannerList / getBannerDetail / createBanner / updateBanner / updateBannerStatus / updateBannerSortOrder / deleteBanner` 保持 `'partner'`。

`createCouponTemplate / updateCouponTemplate / deleteCouponTemplate / toggleCouponTemplateStatus / cloneCouponTemplate / getTemplateList / getTemplateDetail / createCouponGrant / getGrantList / getGrantDetail / getUserCouponList / grantCouponToUser / revokeUserCoupon / batchRevokeUserCoupons / getCouponStatistics / getScopeStatistics / getOperationLogList / initIndexes` 保持 `'partner'`。

`createTuanDeal / updateTuanDeal / deleteTuanDeal / publishTuanDeal / endTuanDeal / getTuanDealList / getTuanDealDetail / getTuanDealOrders / getTuanLeaderList / getTuanLeaderCommissions / getTuanCommissionStats` 保持 `'partner'`。

`getMyIncomeOverview / getMyIncomeDetails / getMyWallet / requestWithdrawal / getMyWithdrawals / getMyInvitedUsers / getReferralStats / getReferralList / getReferralOrders / getReferralOrderStats / getMyCommissionRates` 保持 `'partner'`（partner 自己的数据）。

- [ ] **Step 4: 验证**

```bash
npm run lint:cloudfunctions
npx jest test/admin-service-i18n-override.test.js
```

期望：lint 无错，已有测试 PASS（这些测试不直接断言权限等级）。

---

## Task 6: partner 入口登录态预检查

**Files:**
- Modify: `subpackages/partner/home/index.js`

> **实施调整**：原计划对 home 和 application 都加 `isPartner` 同步预检查。实际评审发现：
> - `subpackages/partner/home/index.wxml` 已对 `!isPartner` 做友好展示（"申请审核中" / "立即申请"卡片）
> - `subpackages/partner/application/index.js` 设计为允许非 partner 用户查看/提交申请
> - 强行加 `isPartner` 预检查会破坏申请流程
>
> **调整为**：仅做"未登录拦截"（已登录但非 partner 仍可进入申请流程）

- [ ] **Step 1: home/index.js 加未登录同步拦截**

在 `subpackages/partner/home/index.js` 的 `onLoad` 顶部加：

```js
  onLoad() {
    // 仅做登录态检查（isPartner 留给异步 _loadData 校验，避免破坏申请流程）
    const userInfo = getApp().globalData.userInfo
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({ url: '/pages/profile/index' })
        }
      }, 1500)
      return
    }
    this._loadData()
  },
```

- [ ] **Step 2: application/index.js 不修改**

- [ ] **Step 3: 验证**

```bash
npm run lint
```

期望：lint 无错。

---

## Task 7: 全量验证

- [ ] **Step 1: 跑全量单测**

```bash
npm run test:ci
```

期望：所有 jest 测试 PASS。

- [ ] **Step 2: 跑全量 lint**

```bash
npm run ci:check
```

期望：所有 lint/audit/codemod 通过。

- [ ] **Step 3: 部署 userService 与 adminService（仅修改的两个云函数）**

按现有 `cloudfunctions-sync.sh` 或 CloudBase MCP 工具部署。**注意：P1 改动了 `ACTION_PERMISSIONS` 等级，部署后需验证**：
- 现有 partner 账号（admins.status=active && isPartner=true）仍能正常调 `getBoardingOrders` / `getHostProfile` 等 'partner' 接口
- partner 账号调 `getUserList` / `getDashboardStats` / `approveApplication` / `updateAdminStatus` 会被拒绝（403 / PARTNER_REQUIRED）
- web admin 账号（admins 含 `roles: ['super_admin']`）能调所有接口

---

## Self-Review

- **Spec 覆盖**：P0 / P1 / P2 各有独立任务，每个改动都有对应文件与具体代码
- **占位符扫描**：无 TBD / TODO / "类似的代码"等
- **类型一致**：`VerifyAuthOptions.permission` 在 Task 4 改为联合类型 `'partner' | 'admin' | 'super_admin' | null`，Task 5 直接使用字符串字面量，无命名不一致
- **回归风险**：
  - P0 扩展 userService 返回字段是**累加**，不会破坏现有调用方
  - P1 拆 super_admin 等级是**收紧**，会拒绝现有 partner 调 `getUserList` 等接口 —— 已在 Task 7 Step 3 显式列出验证项
  - P2 同步预检查仅在未授权时 navigateBack，正常授权路径无变化

## 执行选项

1. **Subagent-Driven（推荐）**：每个 Task 派一个 fresh subagent 执行并 review
2. **Inline Execution**：当前会话直接顺序执行
