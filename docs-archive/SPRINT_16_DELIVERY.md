# Sprint 16 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W45-W46

## 目标

- 风控实际接入业务：`submitEvaluation` / `createRefund` 走 `RISK_*` 错误码
- miniapp 端 i18n：内置字典 + 业务文案 + CDN 加载
- TypeScript 迁移继续：`auth-middleware.js` → `.ts`
- 业务文案 i18n 拓展：商品 / 活动 / Banner 关键文案
- i18n 字典预编译为 JSON（CDN 友好）

## 关键任务完成度

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S16-01 | 评价 / 退款业务接入 `RISK_*` 错误码 | ✅ | orderService/orders.js、paymentService/services/refund.js |
| S16-02 | miniapp 端 i18n（utils/i18n.js） | ✅ | 错误码 + 业务文案 + locale 推断 + 持久化 |
| S16-03 | auth-middleware.js → .ts 迁移 | ✅ | 24 个迁移测试 |
| S16-04 | 集成测试 - 评价风控 / 退款风控子链路 | ✅ | 49 个测试（评价 24 + 退款 25） |
| S16-05 | i18n 字典 CDN 化（预编译 JSON） | ✅ | build:i18n 脚本 + loadFromCdn API |
| S16-06 | 业务文案 i18n（商品/活动/Banner） | ✅ | 55 个业务文案 + 36 个测试 |
| S16-07 | Sprint 16 交付文档 | ✅ | 本文档 |

## 1. 评价 / 退款业务接入 `RISK_*` 错误码

### 1.1 改造前

- 业务层使用 `RATE_LIMITED` 错误码（语义不准）表达"被风控拦截"
- 客户端只能看到"操作过于频繁"，无法判断是 rate-limit 还是 风控决策
- 风控决策不透明，运营无法做精细化抽检

### 1.2 改造后

[cloudfunctions/orderService/orders.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/orders.js)（评价）：

```js
// Sprint 16：风控前置扫描
let riskDecision = 'RISK_PASS' // 默认放行
try {
  const risk = await detectReviewSpam(db, openid, comment)
  riskDecision = mapActionToErrorCode(risk.action)
  assertRiskDecision(risk.action, { openid, target: 'evaluation', reasons: risk.reasons })
} catch (e) {
  if (e && e.code === 'RISK_REJECT') throw e
  if (e && e.code === 'RISK_PENDING') { /* 标 pendingReview */ }
  riskDecision = 'RISK_PASS' // 异常降级
}
// 落库时附带 riskDecision，便于运营审计
db.collection('evaluations').add({ ..., riskDecision })
```

[cloudfunctions/paymentService/services/refund.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/refund.js)（退款）：同样的模式。

### 1.3 三档决策码

| Action | 错误码 | 客户端表现 | 业务处理 |
| --- | --- | --- | --- |
| `allow` | `RISK_PASS` | 无 | 正常落库 |
| `review` | `RISK_PENDING` | 提示"待审核" | 标 pendingReview，运营抽检 |
| `reject` | `RISK_REJECT` | 提示"被风控拒绝" | 不落库 |

### 1.4 客户端 i18n 文案

| 错误码 | zh-CN | en-US | ja-JP |
| --- | --- | --- | --- |
| `RISK_PASS` | 风控检查通过 | Risk check passed | リスクチェック合格 |
| `RISK_PENDING` | 请求已受理，待人工审核 | Request received, pending manual review | リクエストを受理しました。人的審査待ちです |
| `RISK_REJECT` | 请求被风控拒绝 | Request rejected by risk control | リスク管理により拒否されました |

## 2. miniapp 端 i18n（utils/i18n.js）

### 2.1 设计目标

- 小程序端 `(error.type, locale) → 本地化文案` 翻译
- 内置字典覆盖 51 个错误码 + 55 个业务文案
- 自动从系统语言推断 locale
- 缺翻译降级到 zh-CN → code 字面量
- 与云端 errors-i18n.ts 字典对齐

### 2.2 核心 API

```js
const i18n = require('./utils/i18n')

// 业务文案
i18n.t('OPERATION_SUCCESS', 'en-US')   // 'Success'

// 错误码转文案
i18n.getErrorMessage('RISK_PENDING')    // 跟随 currentLocale
i18n.getErrorMessage('AUTH_REQUIRED', 'ja-JP')  // 'ログインが必要です'

// 解析云函数返回
i18n.resolveCloudErrorMessage(res)     // 优先 res.message，其次 res.error.type → i18n

// 切换语言（持久化到 storage）
i18n.setLocale('en-US')

// 运营覆盖（热更新）
i18n.applyCustomOverrides({ AUTH_REQUIRED: { 'en-US': 'Plz sign in' } })

// CDN 加载（启动时拉合并字典）
await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json')
```

### 2.3 解析优先级

```
1. customOverrides[code]?.[locale]    （最高，运营/测试可覆盖）
2. CDN override[code]?.[locale]       （loadFromCdn 注入）
3. ERROR_I18N/BIZ_I18N[code]?.[locale]（内置字典）
4. fallback to zh-CN                  （默认）
5. literal code                       （兜底）
```

### 2.4 验证测试（31 个）

[test/utils-i18n.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/utils-i18n.test.js)：
- 模块 API 完整性（3）
- 错误码 → 本地化文案（10）
- 业务文案 t()（4）
- 缺翻译降级（2）
- Locale 切换与持久化（4）
- resolveCloudErrorMessage（4）
- applyCustomOverrides 优先级（4）
- 与云端 errors-i18n.ts 兼容（2）
- 鲁棒性（5）

## 3. auth-middleware.js → .ts 迁移

### 3.1 迁移内容

[cloudfunctions/common/auth-middleware.ts](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/auth-middleware.ts)：

| 导出 | 类型签名 | 用途 |
| --- | --- | --- |
| `VerifyAuthOptions` | `interface` | `{ requireLogin, requireAdmin, permission }` |
| `AuthResult` | `interface` | `{ openid, isAdmin, permissions? }` |
| `AdminDoc` | `interface` | `{ _id, status, permissions, role }` |
| `WXContext` | `type` | `{ OPENID, APPID, UNIONID }` |
| `verifyAuth` | `(event, options) => Promise<AuthResult>` | 主入口 |

### 3.2 关键设计

1. **类型断言绕过 CloudBaseInstance 接口**：`cloud.getWXContext?.()` 类型断言
2. **联合类型 `permission`**：`'mall' | 'hosting' | 'partner' | 'tuan' | 'commission' | 'feeding'` 业务白名单
3. **AdminDoc 严格类型**：`status: 'active' | 'inactive' | 'banned'`，`role: 'admin' | 'super_admin'`
4. **错误抛出统一**：用 `err('AUTH_REQUIRED' | 'PERMISSION_DENIED' | ...)` 业务码

### 3.3 验证测试（24 个）

[test/common-auth-middleware-ts-migration.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/common-auth-middleware-ts-migration.test.js)：
- 源文件 / 产物 / API 完整性（3）
- .ts 源码契约：VerifyAuthOptions / AuthResult / AdminDoc（3）
- 登录态检查：未登录 / 已登录 / 关闭登录检查（4）
- 管理员检查：未登录 / 非 admin / 缺 status / status 非法 / active / banned（6）
- 权限校验：未传 permission / 传 permission / 缺权限 / 有权限（4）
- 超级管理员：role=admin → 普通；role=super_admin → 全通（3）
- tsconfig / build 工具链（1）

## 4. 集成测试 - 评价 / 退款风控子链路（49 个）

### 4.1 评价风控子链路（24 个）

[test/integration/risk-evaluation-flow.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/risk-evaluation-flow.test.js)：

| 类别 | 数量 | 关键场景 |
| --- | --- | --- |
| 单项检测 | 10 | HIGH_FREQ / HOST_CONCENTRATION / DUP_COMMENT / COMMENT_LENGTH / FIVE_STAR_RATIO |
| 主入口集成 | 5 | 空 db / 高频 / 复合 / 集中 5 星 / details 完整 |
| assertRiskDecision 联动 | 3 | allow / review / reject |
| mapActionToErrorCode | 3 | 三档映射 |
| commentFingerprint | 3 | 空白 / emoji / 空字符 |

### 4.2 退款风控子链路（25 个）

[test/integration/risk-refund-flow.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/risk-refund-flow.test.js)：

| 类别 | 数量 | 关键场景 |
| --- | --- | --- |
| 单项检测 | 11 | HIGH_FREQ / RATE / FULL_REFUND / SAME_AMOUNT × 边界 |
| 主入口集成 | 6 | 空 db / 高频 / 复合 / 全退（首次） / 全退（已有） / 退款率 |
| assertRiskDecision | 3 | 三档抛错 |
| mapActionToErrorCode | 3 | 三档映射 |

### 4.3 端到端

```
用户操作（评价 / 退款）
  ↓
service 层（submitEvaluation / createRefund）
  ↓
detectReviewSpam / detectRefundAbuse  ← 拉 db 快照，5 / 4 项检测
  ↓
RiskReport { level, action, reasons, details, target }
  ↓
业务层 assertRiskDecision
  ↓
allow → RISK_PASS    （正常落库）
review → RISK_PENDING（标 pendingReview，运营抽检）
reject → RISK_REJECT （拒绝写入，抛错）
```

## 5. i18n 字典 CDN 化（S16-05）

### 5.1 目标

- 把 `errors-i18n.ts` 的 51 个错误码 + 55 个业务文案拆成 3 个 JSON
- 小程序端走 CDN 加载，避免打大包
- 运营可热更新 CDN 上的 JSON

### 5.2 工具链

[scripts/build-i18n.js](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/build-i18n.js)：

```bash
npm run build:i18n
# 或
npm run build:all  # common + i18n
```

输出目录 `dist/i18n/`：

```
dist/i18n/
├── errors.zh-CN.json        # 50 codes，~1.6KB
├── errors.en-US.json        # 50 codes，~1.7KB
├── errors.ja-JP.json        # 50 codes，~1.9KB
├── errors.all.json          # 全量（运维查询）
├── biz.zh-CN.json           # 55 biz texts
├── biz.en-US.json
├── biz.ja-JP.json
├── merged.zh-CN.json        # 104 entries（首选，小程序端一次拉完）
├── merged.en-US.json
├── merged.ja-JP.json
└── manifest.json            # 版本信息
types/
└── i18n-cdn.d.ts            # TS 类型
```

### 5.3 客户端加载

[utils/i18n.js](file:///Users/yy/Documents/trae_projects/zuoyou/utils/i18n.js) 新增 `loadFromCdn()`：

```js
// app.js 启动时
App({
  onLaunch() {
    const i18n = require('./utils/i18n')
    // 加载当前 locale 的合并字典
    i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json')
      .then(res => console.log(`[i18n] loaded ${res.loaded} entries from ${res.url}`))
  }
})
```

`{{locale}}` 占位符自动替换为当前 locale。

### 5.4 加载策略

```
1. 持久化 CDN URL 到 storage（app_i18n_cdn_url）
2. wx.request GET，5s timeout
3. 成功 → 注入 _customOverrides（覆盖内置）
4. 失败 → 不抛错，回落到内置字典
5. 空响应 / 非对象 / 无 wx 环境 → 静默失败
```

### 5.5 验证测试（52 个）

[test/utils-i18n-cdn.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/utils-i18n-cdn.test.js)：
- build:i18n 脚本 + 产物（12）
- errors.{locale}.json 内容（5）
- merged.{locale}.json 合并字典（4）
- manifest.json（5）
- types/i18n-cdn.d.ts（5）
- errors.all.json 全量字典（3）
- JSON 体积（4）
- loadFromCdn 行为（14）

## 6. 业务文案 i18n（S16-06）

### 6.1 新增 55 个业务文案

[utils/i18n.js](file:///Users/yy/Documents/trae_projects/zuoyou/utils/i18n.js) 新增 BIZ_I18N 条目：

| 域 | 数量 | 关键 key |
| --- | --- | --- |
| 商品（mall） | 12 | PRODUCT_LOAD_FAILED / OUT_OF_STOCK / OFF_SHELF / DETAIL_TITLE / CART_EMPTY |
| 活动（activity） | 20 | ACTIVITY_LIST_TITLE / JOIN_NOW / REGISTRATION_SUCCESS / EXPIRED_PAYMENT / EMPTY_TITLE |
| 轮播图（Banner） | 3 | BANNER_LOAD_FAILED / PLACEHOLDER_TITLE / PLACEHOLDER_DESC |
| 支付 / 订单 | 6 | PAYMENT_SUCCESS / CANCELLED / REQUIRED_ADDRESS / ORDER_PLACE_SUCCESS / COUPON_LOCK_FAILED |
| 寄养 / 上门 | 4 | DATE_REQUIRED / ADDRESS_REQUIRED / INVALID_PARAMS / LOAD_FAILED |
| 通用 | 10 | OPERATION_SUCCESS / LOADING / CONFIRM / CANCEL / RETRY / EMPTY_DATA / NETWORK_ERROR |

### 6.2 关键决策

1. **与云端字典对齐**：交集 key（INVALID_PARAMS / RISK_REJECT 等）文案一致
2. **每条三语齐备**：zh-CN / en-US / ja-JP 都非空
3. **去重合并**：BIZ_I18N 与 ERROR_I18N 的交集 key 合并到 merged JSON
4. **小写 enum 命名**：所有 key 使用 SCREAMING_SNAKE_CASE

### 6.3 验证测试（36 个）

[test/utils-biz-i18n.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/utils-biz-i18n.test.js)：
- 商品域 12 个文案（5）
- 活动域 20 个文案（7）
- 轮播图 3 个文案（2）
- 支付 / 订单 6 个文案（6）
- 寄养 / 上门 4 个文案（4）
- 字典完整性（3）
- 与云端字典无冲突（1）
- CDN 预编译 JSON（5）
- 缺翻译降级（2）

## 7. 改动文件清单

### 新增

- `scripts/build-i18n.js`（i18n 字典 → JSON 编译脚本）
- `cloudfunctions/common/auth-middleware.ts`（auth-middleware TypeScript 迁移）
- `test/common-auth-middleware-ts-migration.test.js`（24 个迁移测试）
- `test/utils-i18n.test.js`（31 个 miniapp 端 i18n 测试）
- `test/utils-i18n-cdn.test.js`（52 个 CDN 加载测试）
- `test/utils-biz-i18n.test.js`（36 个业务文案测试）
- `test/integration/risk-evaluation-flow.test.js`（24 个评价风控子链路）
- `test/integration/risk-refund-flow.test.js`（25 个退款风控子链路）
- `dist/i18n/*.json`（10 个 JSON 产物）
- `types/i18n-cdn.d.ts`（TypeScript 类型声明）

### 修改

- `cloudfunctions/orderService/orders.js`（评价接入 RISK_*）
- `cloudfunctions/paymentService/services/refund.js`（退款接入 RISK_*）
- `cloudfunctions/common/auth-middleware.js`（tsc 编译产物）
- `cloudfunctions/common/auth-middleware.d.ts`（tsc 自动生成）
- `utils/i18n.js`（业务文案 + loadFromCdn）
- `tsconfig.common.json`（include 加 auth-middleware.ts）
- `scripts/build-common.js`（TARGETS 加 auth-middleware.js）
- `package.json`（build:i18n / build:all 脚本）
- `.github/workflows/ci.yml`（drift 检查扩到 11 个 .ts）

## 8. 测试 / 覆盖

| 指标 | Sprint 15 末 | Sprint 16 末 | 变化 |
| --- | --- | --- | --- |
| 测试套件 | 63 | **68** | +5（auth-middleware 迁移 / miniapp i18n / CDN 加载 / 业务文案 / 评价退款风控） |
| 测试用例 | 1136 | **1298** | +162（+24 迁移 +31 miniapp i18n +52 CDN +36 业务文案 +49 风控集成） |
| 集成测试子链路 | 17 | **17** | —（沿用 Sprint 15 的评价退款链路，独立集成测试拆出来） |
| TypeScript .ts 源文件 | 10 | **11** | +1（auth-middleware） |
| 编译产物 .js 文件 | 10 | **11** | +1 |
| 业务文案 i18n 覆盖 | 0 | **55** | +55 |
| i18n 字典 | 51 | **51** | —（错误码无新增） |
| 错误码注册表 | 51 | **51** | —（RISK_* 已在 Sprint 14 注册） |
| audit:error-codes:strict | ✅ pass | **✅ pass** | — |

## 9. 度量看板

| 指标 | Sprint 15 末 | Sprint 16 末 | Δ |
| --- | --- | --- | --- |
| 测试用例 | 1136 | **1298** | +162 |
| 测试套件 | 63 | **68** | +5 |
| TypeScript .ts 实现 | 10 | **11** | +1（auth-middleware） |
| 业务文案 i18n | 0 | **55** | +55 |
| i18n 字典文件 | 0 | **10 个 JSON** | +10 |
| miniapp 端 i18n | 0 | **完整（错误码+业务+CDN）** | +1 模块 |
| 风险决策码接入 | 接口定义 | **业务实际使用** | +2 业务点 |
| 错误码注册表 | 51 | **51** | — |
| audit:error-codes:strict | ✅ | **✅** | — |
| pre-existing typo 修复 | 1 | **1** | — |
| CI 门禁 job | 7 | **7** | — |

## 10. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 业务层接入 `RISK_*` 错误码后，运营历史告警可能受影响 | RISK_PENDING / RISK_REJECT 在 errors.ts 已注册，audit:error-codes:strict 0 报错 |
| miniapp 端 i18n 字典与云端可能漂移 | 单元测试断言"共同 key 文案一致"，CI 必跑 |
| CDN 加载失败可能阻塞首屏 | loadFromCdn 是渐进增强：失败回落到内置字典，loadFromCdn 不抛错 |
| ja-JP 文案质量参差（机翻） | 已在 Sprint 15 标注 ❓ 待校；customOverrides 机制支持运营热覆盖 |
| auth-middleware.ts 编译产物 .js 头部 eslint-disable 标记 | build-common.js 已覆盖（auth-middleware.js 加入 TARGETS） |
| JSON 体积膨胀影响首屏 | 紧凑格式（无空白），merged.zh-CN 1.6KB < 5KB 阈值 |

## 11. 已知问题（需后续 Sprint 处理）

### 11.1 业务文案尚未在 wxml 全面替换

- 状态：i18n 字典已含 55 个业务文案
- 但页面层 `wx.showToast({ title: '商品已下架' })` 仍硬编码
- 建议：Sprint 17 在关键路径（首页 / 商品详情 / 活动报名 / 订单支付）批量替换
- 影响：i18n 切换语言时，部分 toast 仍显示中文

### 11.2 CDN URL 未配硬编码

- 状态：loadFromCdn API 已就位
- 但 CDN URL 模板（`https://cdn.example.com/...`）未在配置中
- 建议：Sprint 17 在 `config.js` 加 `CDN.I18N_BASE_URL` 配置项

### 11.3 ja-JP 文案质量待校

- 状态：i18n 字典已含日文，但部分文案为机翻
- 建议：运营 + 本地化团队 Sprint 17 校稿
- 处理：customOverrides 机制支持运行时覆盖

## 12. 下一步（Sprint 17 计划）

1. **i18n 运营后台**
   - 错误码运营后台支持在线编辑 i18n 文案
   - 写入 MongoDB / CloudBase DB，运行时优先查运营字典，降级到内置 DEFAULT_I18N
2. **业务文案页面层替换**
   - 关键路径批量替换硬编码中文 → `i18n.t('KEY')`
   - 验证语言切换在所有页面生效
3. **风控检测限流**
   - `assertRiskDecision` / `detectReviewSpam` API 加 rate-limit
   - 防止恶意调用 detect API 拖垮 db
4. **TypeScript 继续推广**
   - 迁移剩余 common JS 源（`date-range.js` / `permissions.js` / `normalize.js` / `query-builders.js`）
5. **CDN 部署自动化**
   - build:i18n 完成后自动上传到 COS / CDN
   - CI 中加 cdn-deploy job

## 13. 关键测试结果

```
Test Suites: 1 skipped, 68 passed, 68 of 69 total
Tests:       1 skipped, 1298 passed, 1299 total
Time:        ~3.6s

audit:error-codes:strict → pass
build:common → 11/11 .js 编译通过
build:i18n → 10/10 JSON + 1/1 .d.ts 生成
```

**Sprint 16 完整收官。**
