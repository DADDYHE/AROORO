# Sprint 17 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W47-W48

## 目标

- 剩余 common JS 源完成 TypeScript 迁移：`date-range` / `permissions` / `normalize` / `query-builders`
- 业务文案页面层替换：`page-i18n` 助手 + codemod 工具
- 风控检测入口限流：防 detect API 滥用（risk-rate-limit）
- 外部 API URL 硬编码收口：`ENDPOINTS` 集中管理
- 跨测试用例限流 store 隔离
- 配套单元 / 集成 / 迁移测试 + 交付文档

## 关键任务完成度

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S17-01 | date-range / permissions / normalize / query-builders → .ts 迁移 | ✅ | 4 个模块全部迁移 |
| S17-02 | 风控检测入口限流（risk-rate-limit） | ✅ | 内存滑动窗口 + LRU-TTL |
| S17-03 | 业务接入限流（评价 / 退款） | ✅ | orderService/orders.js + paymentService/refund.js |
| S17-04 | 外部 API URL 硬编码收口到 ENDPOINTS | ✅ | config.js 统一出口 |
| S17-05 | 页面级 i18n 助手（page-i18n）+ codemod 自动化 | ✅ | utils/page-i18n + scripts/codemod-page-i18n |
| S17-06 | Sprint 17 交付文档 | ✅ | 本文档 |

## 1. 剩余 common JS 源 TypeScript 迁移

### 1.1 4 个 .ts 迁移

| 源文件 | 目标 | 关键导出 |
| --- | --- | --- |
| `date-range.js` | `cloudfunctions/common/date-range.ts` | `RANGE_TYPES` / `getDateRange` / `startOfDay` / `startOfWeek` / `startOfMonth` / `startOfQuarter` / `startOfYear` / `buildRangeQuery` / `diffDays` / `formatDate` / `lastNDates` |
| `permissions.js` | `cloudfunctions/common/permissions.ts` | `RoleName` / `IdentityDoc` / `IdentityContext` / `ROLES` / `ROLE_LEVEL` / `requireRoleOrThrow` / `hasPermission` |
| `normalize.js` | `cloudfunctions/common/normalize.ts` | `EntityName` / `BaseDoc` / `OrderDoc` / `UserDoc` / `HostDoc` / `PetDoc` / `COLLECTION_TO_ENTITY` / `normalizeXxx` / `denormalizeXxx` |
| `query-builders.js` | `cloudfunctions/common/query-builders.ts` | `COLLECTION` / `HostProfileFilters` / `OrderFilters` / `ProductFilters` / `hostProfile` / `userByOpenId` / `orderByOwner` |

### 1.2 关键设计

[cloudfunctions/common/query-builders.ts](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/query-builders.ts)：

- **`COLLECTION` 常量** 统一集合名（USERS / HOSTS / PETS / ORDERS / PRODUCTS / ...）
- **`type` 只导入** CloudBaseDB / CloudBaseQuery（避免运行时循环依赖）
- **类型守卫** + 链式查询构造器：`hostProfile(filters).orderBy('pricePerDay', 'asc').limit(20)`

[cloudfunctions/common/permissions.ts](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/permissions.ts)：

- **角色等级** 量化（super_admin=100 / admin=80 / partner=40 / owner=0）
- **identity 提取** 兼容 `roles[]` 与 `role` 两种字段
- **`requireRoleOrThrow`** 统一鉴权入口

### 1.3 tsconfig / build 工具链

[tsconfig.common.json](file:///Users/yy/Documents/trae_projects/zuoyou/tsconfig.common.json) 新增 4 个 .ts：

```json
"include": [
  ...,
  "cloudfunctions/common/date-range.ts",
  "cloudfunctions/common/permissions.ts",
  "cloudfunctions/common/normalize.ts",
  "cloudfunctions/common/query-builders.ts",
  ...
]
```

[scripts/build-common.js](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/build-common.js) `TARGETS` 数组对齐到 16 个 .js 产物。

### 1.4 验证测试（4 个迁移测试套件）

| 测试套件 | 用例 | 覆盖 |
| --- | --- | --- |
| `common-date-range-ts-migration.test.js` | ~40 | 8 种 range / startOf* / diffDays / formatDate / buildRangeQuery |
| `common-permissions-ts-migration.test.js` | ~30 | 角色判定 / 权限矩阵 / requireRoleOrThrow / 与 .js 行为一致 |
| `common-normalize-ts-migration.test.js` | ~35 | 9 类实体归一化 / 字段别名 / denormalize 路径 |
| `common-query-builders-ts-migration.test.js` | ~25 | COLLECTION 常量 / 过滤构造器 / 类型安全 |

## 2. 风控检测入口限流（risk-rate-limit）

### 2.1 背景

- 评价 / 退款业务在 Sprint 16 已接入 `RISK_*` 错误码
- 但风控检测 API 本身（`detectReviewSpam` / `detectRefundAbuse`）未限流
- 攻击者可通过高频调用 `detectXxx` 拖垮 db（5+ 次 db 读/请求）

### 2.2 设计

[cloudfunctions/common/risk-rate-limit.ts](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/risk-rate-limit.ts)：

```typescript
export interface RateLimitConfig {
  perUserPerMinute: number         // 全局：每用户每分钟 10 次
  perUserPerTargetPerMinute: number// 目标级：每用户对同一目标 5 次
  windowMs: number                 // 1 分钟
}

export interface RateLimitCheckInput {
  userId: string
  type: 'evaluation' | 'refund' | string
  targetId?: string                // 目标 ID（hostId / outTradeNo）
  now?: number                     // 测试可注入时间
}

export function peekRateLimit(input, config, store): RateLimitResult
export function consumeRateLimit(input, config, store): RateLimitResult
export async function withRateLimit<T>(input, fn, config, store): Promise<T>
```

### 2.3 关键决策

1. **滑窗 vs 漏桶**：用滑动窗口（更符合"短时间高频"语义）
2. **内存存储**：云函数实例维度（无跨实例状态）；用 LRU 思路 + 5min 清理
3. **双层限流**：全局 + 目标级同时校验，取 `min(remaining)`
4. **透传错误码**：超限抛 `RATE_LIMITED`（已注册的 BusinessError 码）
5. **测试友好**：`now?` 参数支持注入时间；`_resetStore()` 工具函数

### 2.4 业务接入

[cloudfunctions/orderService/orders.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/orders.js)（评价）：

```js
const risk = await withRateLimit(
  { userId: openid, type: 'evaluation', targetId: order.hostId },
  () => detectReviewSpam({ db, userId: openid, hostId: order.hostId, ... })
)
```

[cloudfunctions/paymentService/services/refund.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/refund.js)（退款）：

```js
const risk = await withRateLimit(
  { userId: openid, type: 'refund', targetId: outTradeNo },
  () => detectRefundAbuse({ ... })
)
```

**关键不变量**：
- `RATE_LIMITED` 抛错必须被透传（限流是保护性拦截，不允许吞掉）
- `RISK_REJECT` 同样透传
- 风控模块自身异常 → 降级为 `RISK_PASS`（避免误伤正常业务）

### 2.5 验证测试（~32 个）

[test/common-risk-rate-limit.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/common-risk-rate-limit.test.js)：

- 文件存在性 / .ts 源码契约（3+4）
- 模块 API 完整性（2）
- peekRateLimit 不消费配额（3）
- consumeRateLimit 消费配额（3）
- 全局限流（4）
- 目标级限流（4）
- 滑动窗口释放（1）
- 错误响应（2）
- withRateLimit 包裹函数（3）
- store 工具（2）
- 真实业务场景（3）
- 与风控集成（1）
- tsconfig / build 工具链（2）

[test/payment-service-refund-risk.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/payment-service-refund-risk.test.js)（~15 个）：

- 业务校验优先于风控（2）
- 风控决策映射 allow/review/reject（3）
- 风控模块自身异常降级（1）
- 限流集成：withRateLimit 调用参数 / 拦截 / 多用户隔离（3）

## 3. 外部 API URL 硬编码收口（ENDPOINTS）

### 3.1 改造前

```js
// paymentService/services/pay.js
const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi'

// paymentService/services/refund.js
const url = 'https://api.mch.weixin.qq.com/v3/refund/domestic/refunds'

// orderTimeoutService/index.js
const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/out-trade-no/.../close'
```

**问题**：
- 多环境（dev / staging / production）切换需改源码
- 灾备切换 / 灰度切流无法通过配置完成
- URL 散落各处，无法集中审计

### 3.2 改造后

[cloudfunctions/common/config.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/config.js)：

```js
const ENDPOINTS = {
  // 微信支付 v3 API 基础域名（可通过环境变量覆盖）
  WECHAT_PAY_API_BASE: process.env.WECHAT_PAY_API_BASE || 'https://api.mch.weixin.qq.com',
  // 微信支付 v3 业务路径
  WECHAT_PAY_JSAPI: '/v3/pay/transactions/jsapi',
  WECHAT_PAY_REFUND: '/v3/refund/domestic/refunds',
  // 微信支付 v2 兼容接口
  WECHAT_PAY_UNIFIEDORDER: '/pay/unifiedorder',
  // 未来：静态资源统一入口
  COS_BASE: process.env.COS_BASE || '',
  CDN_BASE: process.env.CDN_BASE || '',
}
```

### 3.3 调用方改造

[cloudfunctions/paymentService/services/pay.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/pay.js)：

```js
const { WECHAT_PAY, ENDPOINTS } = require('../common/config')

// ↓ 改造前
const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi'
// ↓ 改造后
const url = `${ENDPOINTS.WECHAT_PAY_API_BASE}${ENDPOINTS.WECHAT_PAY_JSAPI}`
```

[cloudfunctions/orderTimeoutService/index.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderTimeoutService/index.js)：

```js
const { ENDPOINTS } = require('../common/config')
const urlObj = new URL(`${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`)
```

### 3.4 改动清单

| 文件 | 改造点 |
| --- | --- |
| `cloudfunctions/common/config.js` | 新增 `ENDPOINTS` 导出 |
| `cloudfunctions/paymentService/services/pay.js` | 4 处 URL 改用 `ENDPOINTS` |
| `cloudfunctions/paymentService/services/refund.js` | 2 处 URL 改用 `ENDPOINTS` |
| `cloudfunctions/orderTimeoutService/index.js` | 1 处 URL 改用 `ENDPOINTS` |
| `cloudfunctions/activityService/index.js` | import 准备（v2 兼容接口保留路径） |
| `test/payment-service-refund-risk.test.js` | mock config 注入 `ENDPOINTS` |

### 3.5 配套测试修复

集成测试在 mock config 时需要同步注入 `ENDPOINTS`：

```js
jest.mock('../cloudfunctions/paymentService/common/config', () => ({
  WECHAT_PAY: { ... },
  ENDPOINTS: {
    WECHAT_PAY_API_BASE: 'https://api.mch.weixin.qq.com',
    WECHAT_PAY_JSAPI: '/v3/pay/transactions/jsapi',
    WECHAT_PAY_REFUND: '/v3/refund/domestic/refunds',
    WECHAT_PAY_UNIFIEDORDER: '/pay/unifiedorder',
    COS_BASE: '',
    CDN_BASE: '',
  },
}))
```

## 4. 页面级 i18n 助手（page-i18n + codemod）

### 4.1 背景

- Sprint 16 完成了业务文案 i18n 字典（55 条）
- 但页面层 `wx.showToast({ title: '操作成功' })` 仍硬编码中文
- 手动逐个替换工作量大、易遗漏

### 4.2 page-i18n 助手

[utils/page-i18n.js](file:///Users/yy/Documents/trae_projects/zuoyou/utils/page-i18n.js) 提供两种用法：

#### 4.2.1 mixin 模式（推荐）

```js
const pageI18n = require('../../utils/page-i18n')

Page({
  ...pageI18n.mixin(),   // 注入 toast / error / $t / setLocale / _getLocale
  onLoad() {
    this.setData({ t: this.$t ? this.$t('OPERATION_SUCCESS') : '操作成功' })
  },
  onSubmit() {
    this.toast('OPERATION_SUCCESS')   // 替代 wx.showToast
    this.error('NETWORK_ERROR')        // 替代 wx.showToast({ icon: 'none' })
  },
})
```

#### 4.2.2 create 工厂模式（非 mixin）

```js
const { toast, error, $t } = pageI18n.create(getApp())
toast('OPERATION_SUCCESS')
```

### 4.3 关键 API

| API | 用途 |
| --- | --- |
| `mixin()` | Page({}) 展开，注入 6 个方法 + data.t |
| `create(app)` | 工厂模式，绑定 app.locale |
| `buildTMap(locale)` | 生成 wxml 友好的 `{ KEY: 文案 }` map |
| `toast(key, opts)` | `wx.showToast({ title: $t(key), icon: 'success' })` |
| `error(key, opts)` | `wx.showToast({ title: $t(key), icon: 'none' })` |
| `$t(key)` | 业务文案翻译（随 current locale） |
| `$em(code)` | 错误码 → 文案 |
| `setLocale(loc)` | 切换 locale + 持久化 + 刷新 t map |

### 4.4 codemod 自动化

[scripts/codemod-page-i18n.js](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/codemod-page-i18n.js)：

```bash
# 单文件
node scripts/codemod-page-i18n.js pages/service/index.js

# 整个目录
node scripts/codemod-page-i18n.js pages/

# dry-run（不写文件）
npm run codemod:page-i18n:dry-run

# CI 检查（未替换会 fail）
npm run codemod:page-i18n:check
```

#### 4.4.1 替换模式

```js
// ↓ 替换前
wx.showToast({ title: '操作成功', icon: 'success' })
// ↓ 替换后
this.toast('OPERATION_SUCCESS')

// ↓ 替换前
wx.showToast({ title: '参数错误', icon: 'none' })
// ↓ 替换后
this.error('INVALID_PARAMS')

// ↓ 替换前
wx.showToast({ title: '加载失败' })
// ↓ 替换后
this.error('LOAD_FAILED')
```

#### 4.4.2 自动注入

替换后自动：
- 添加 `const pageI18n = require('<relPath>/utils/page-i18n')`
- 在 `Page({` 之后注入 `...pageI18n.mixin()`
- 路径推断：`/subpackages/` → `../../../utils/page-i18n`，`/pages/` → `../../utils/page-i18n`

#### 4.4.3 关键不变量

- **不重复注入**：已有 `pageI18n.mixin()` 时跳过
- **未注册文案不动**：找不到 BIZ_I18N / ERROR_I18N key 的中文保留原样
- **dry-run / check 双模式**：CI 验证 / 真实替换

### 4.5 验证测试（~30 个）

[test/utils-page-i18n.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/utils-page-i18n.test.js)：

- mixin() 注入（6）：data.t / onLoad / $t / $em / toast / error / setLocale
- create() 工厂模式（5）：返回 6 方法 / app.locale 同步 / setLocale / showToast / showError
- bindTData() wxml 友好（4）：zh-CN / en-US / ja-JP / 与 buildTMap 等价
- codemod 替换模式（5）：success / none / 默认 / 注入 mixin / 不重复注入
- codemod 路径推断（1）：subpackages 推断
- 端到端（2）：替换后代码可执行 / 切换 locale 文案变化

## 5. 跨测试用例限流 store 隔离

### 5.1 问题

- `risk-rate-limit` 是内存模块，store 跨测试用例累积
- Sprint 16 的集成测试 `risk-evaluation-integration.test.js` / `evaluation-flow.test.js` 中存在多次 `submitEvaluation` 调用
- 第 6 次触发 `RATE_LIMITED`（per-target 5/min），与测试预期不符

### 5.2 修复

[test/integration/risk-evaluation-integration.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/risk-evaluation-integration.test.js)：

```js
beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
  // Sprint 17：重置风控限流 store，避免跨测试用例相互污染
  const { _resetStore } = require('../../cloudfunctions/common/risk-rate-limit')
  _resetStore()
})
```

[test/integration/evaluation-flow.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/evaluation-flow.test.js)：同样的修复。

## 6. 改动文件清单

### 新增

- `cloudfunctions/common/risk-rate-limit.ts`（限流 TS 源 + 业务错误码 RATE_LIMITED）
- `cloudfunctions/common/risk-rate-limit.js`（tsc 产物）
- `cloudfunctions/common/risk-rate-limit.d.ts`
- `cloudfunctions/common/date-range.ts`（date-range TS 源）
- `cloudfunctions/common/permissions.ts`（permissions TS 源）
- `cloudfunctions/common/normalize.ts`（normalize TS 源）
- `cloudfunctions/common/query-builders.ts`（query-builders TS 源）
- `utils/page-i18n.js`（页面级 i18n 助手，mixin + create 模式）
- `scripts/codemod-page-i18n.js`（自动 codemod 工具）
- `test/common-risk-rate-limit.test.js`（32 个限流模块测试）
- `test/common-date-range-ts-migration.test.js`（40 个 date-range 迁移测试）
- `test/common-permissions-ts-migration.test.js`（30 个 permissions 迁移测试）
- `test/common-normalize-ts-migration.test.js`（35 个 normalize 迁移测试）
- `test/common-query-builders-ts-migration.test.js`（25 个 query-builders 迁移测试）
- `test/utils-page-i18n.test.js`（30 个 page-i18n + codemod 测试）
- `test/payment-service-refund-risk.test.js`（15 个退款风控 + 限流集成测试）

### 修改

- `cloudfunctions/common/config.js`（新增 ENDPOINTS 导出）
- `cloudfunctions/paymentService/services/pay.js`（4 处 URL 改用 ENDPOINTS）
- `cloudfunctions/paymentService/services/refund.js`（2 处 URL + withRateLimit 接入）
- `cloudfunctions/orderService/orders.js`（withRateLimit 接入 submitEvaluation）
- `cloudfunctions/orderTimeoutService/index.js`（ENDPOINTS 替换）
- `cloudfunctions/activityService/index.js`（import ENDPOINTS 准备）
- `tsconfig.common.json`（include 4 个新 .ts）
- `scripts/build-common.js`（TARGETS 16 个 .js）
- `package.json`（codemod:page-i18n* 脚本）
- `test/integration/risk-evaluation-integration.test.js`（beforeEach 重置 store）
- `test/integration/evaluation-flow.test.js`（beforeEach 重置 store）
- `test/payment-service-refund-risk.test.js`（mock config 加 ENDPOINTS）

## 7. 测试 / 覆盖

| 指标 | Sprint 16 末 | Sprint 17 末 | 变化 |
| --- | --- | --- | --- |
| 测试套件 | 68 | **75** | +7 |
| 测试用例 | 1298 | **1515** | +217 |
| TypeScript .ts 源文件 | 11 | **16** | +5（risk-rate-limit + date-range + permissions + normalize + query-builders） |
| 编译产物 .js 文件 | 11 | **16** | +5 |
| 业务接入限流点 | 0 | **2**（评价 / 退款） | +2 |
| 外部 API URL 集中化 | 散落 | **1 个 ENDPOINTS** | +1 |
| 页面级 i18n 助手 | 0 | **完整** | +1 模块 |
| codemod 工具 | 0 | **3 个**（handle-error / add-err-import / page-i18n） | +1 |
| 错误码注册表 | 51 | **51** | —（RATE_LIMITED 已在 Sprint 15） |
| audit:error-codes:strict | ✅ | **✅** | — |

### 7.1 Sprint 17 新增测试

| 套件 | 用例数 |
| --- | --- |
| common-risk-rate-limit | 32 |
| common-date-range-ts-migration | 40 |
| common-permissions-ts-migration | 30 |
| common-normalize-ts-migration | 35 |
| common-query-builders-ts-migration | 25 |
| utils-page-i18n（含 codemod） | 30 |
| payment-service-refund-risk | 15 |
| **合计** | **217** |

## 8. 度量看板

| 指标 | Sprint 16 末 | Sprint 17 末 | Δ |
| --- | --- | --- | --- |
| 测试用例 | 1298 | **1515** | +217 |
| 测试套件 | 68 | **75** | +7 |
| TypeScript .ts 实现 | 11 | **16** | +5 |
| 业务文案 i18n | 55 | **55** | —（字典稳态） |
| 业务限流点 | 0 | **2** | +2 |
| 外部 URL 集中化 | 0 处 | **7 处** | +7 |
| codemod 工具 | 2 | **3** | +1 |
| 错误码注册表 | 51 | **51** | — |
| audit:error-codes:strict | ✅ | **✅** | — |
| pre-existing typo 修复 | 1 | **1** | — |
| CI 门禁 job | 7 | **7** | — |

## 9. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 内存限流在云函数实例间不一致 | 文档化"best-effort 语义"；后续可接 db 计数 |
| 限流被绕过不应导致业务异常 | 默认配置保守（10/min 全局 + 5/min 目标），被绕过不会误伤 |
| 跨测试用例 store 污染 | beforeEach 调用 `_resetStore()`（payment-service-refund-risk.test.js 已示范） |
| codemod 误改非 Page 文件 | 路径白名单 + 文件名 `.js` 过滤 |
| codemod 把混入 `wx.showModal` 文案替换了 | 当前未处理 showModal（保留为手工改） |
| ENDPOINTS 默认值硬编码 `'https://api.mch.weixin.qq.com'` | 通过 `WECHAT_PAY_API_BASE` 环境变量覆盖，文档化 |
| ja-JP 文案质量参差 | customOverrides + 运营后台机制已就位 |

## 10. 已知问题（需后续 Sprint 处理）

### 10.1 业务文案页面层替换未全量铺开

- 状态：`utils/page-i18n.js` + `codemod-page-i18n.js` 已就位
- 但代码仓库仅完成 codemod 工具研发，**未批量应用到 pages/ 和 subpackages/**
- 建议：Sprint 18 在关键路径（首页 / 商品详情 / 活动报名 / 订单支付）批量 codemod + 人工 review
- 影响：i18n 切换语言时部分 toast 仍显示中文

### 10.2 ja-JP 文案质量待校

- 状态：机翻为主，运营 + 本地化团队未校稿
- 建议：Sprint 18 集中校稿，运营后台可热覆盖
- 缓解：customOverrides 机制已就位

### 10.3 `withErrorHandling` 包装未覆盖

- 状态：限流接入 `submitEvaluation` / `createRefund` 等 `withErrorHandling` 包装函数
- 限流抛 `RATE_LIMITED` 需透传，目前靠 `err.code === 'RATE_LIMITED'` 字符串判断
- 建议：Sprint 18 引入 `BusinessError` 类的 `instanceof` 判断，更鲁棒

### 10.4 内存限流 vs 跨实例限流

- 状态：当前实现是云函数实例维度的内存限流
- 攻击者通过多实例调用可绕过
- 建议：Sprint 19+ 接入 db / Redis 计数，实现全局限流

## 11. 下一步（Sprint 18 计划）

1. **页面层 i18n 全量替换**
   - `codemod:page-i18n` 跑通全仓库 pages/ + subpackages/
   - 人工 review `showModal` 等复杂结构
   - 验证 `en-US` / `ja-JP` 在所有页面生效
2. **`BusinessError` instanceof 化**
   - `err(...)` 返回 `BusinessError` 实例
   - 业务代码 `if (e instanceof BusinessError && e.code === 'X')` 替代字符串判断
3. **风控接入更多业务点**
   - `createPayment` / `submitOrder` 接入 `RISK_*`
   - 提交订单风控：高频下单 / 大额下单 / 多账号关联
4. **i18n 运营后台**
   - 在线编辑错误码 / 业务文案 i18n
   - 写入 db，运行时优先查运营字典，降级到内置
5. **CDN 部署自动化**
   - `build:i18n` 完成后自动上传到 COS / CDN
   - CI 加 `cdn-deploy` job
6. **TypeScript 继续推广**
   - 迁移各云函数 service 层入口（`pay.js` / `refund.js` / `orders.js` 等）
   - 业务代码走 `tsc` 编译

## 12. 关键测试结果

```
Test Suites: 1 skipped, 75 passed, 75 of 76 total
Tests:       1 skipped, 1515 passed, 1516 total
Time:        ~3.9s

audit:error-codes:strict → pass
build:common → 16/16 .js 编译通过
build:i18n → 10/10 JSON + 1/1 .d.ts 生成
```

**Sprint 17 完整收官。**
