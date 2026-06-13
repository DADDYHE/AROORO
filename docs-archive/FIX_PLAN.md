# AROORO 项目修复方案规划（v1.0）

> 配套《全面检查报告》执行。按优先级分 Sprint 推进，每 Sprint 2 周。
> 创建日期：2026-06-11

---

## 一、规划总览

| 阶段 | Sprint 范围 | 主题 | 任务数 | 状态 |
|------|------------|------|--------|------|
| P0 | Sprint 60 | 安全修复 + 调用统一 | 2 | ⏳ |
| P1 | Sprint 61-62 | 代码质量 + 测试补全 | 6 | ⏳ |
| P2 | Sprint 63-65 | 架构优化 + 组件化 | 10 | ⏳ |
| P3 | Sprint 66-67 | 工程化增强 | 5 | ⏳ |

---

## 二、P0 — 安全修复 + 调用统一（Sprint 60 · 2 周）

### S60-01: 统一 AppID 配置

**问题**：`project.config.json`、`.env`、`config/env.secrets.js` 三处 AppID 不一致，可能导致云开发调用失败或支付签名错误。

**修复方案**：

1. 确认生产环境 AppID（以微信公众平台后台为准）
2. 统一三处配置：
   - `project.config.json` → `appid` 字段
   - `.env` → `APPID` 字段
   - `config/env.secrets.js` → `production.appId` 字段
3. 同步更新 `.env.example` 模板
4. 添加 CI 审计脚本 `audit-appid-consistency.js`，检查三处一致性

**涉及文件**：
```
project.config.json
.env
.env.example
config/env.secrets.js
scripts/audit-appid-consistency.js（新增）
```

**验收标准**：
- [ ] 三处 AppID 完全一致
- [ ] CI 审计脚本通过
- [ ] 小程序真机预览正常
- [ ] 云函数调用正常

**预计耗时**：2 小时

---

### S60-02: CouponService 统一调用模式

**问题**：`services/CouponService.js` 直接使用 `wx.cloud.callFunction()`，绕过了 `CloudFunctionService` 的缓存/重试/错误上报能力。

**修复方案**：

1. 将 `CouponService` 改为依赖注入模式（与 HostService/OrderService 一致）
2. 通过 `CloudFunctionService.call('couponService', action, data)` 调用
3. 删除直接 `wx.cloud.callFunction()` 调用
4. 补充 CouponService 单元测试

**涉及文件**：
```
services/CouponService.js（重构）
test/coupon-service-unit.test.js（新增）
```

**重构前**：
```javascript
// 直接调用，无缓存/重试/错误上报
const res = await wx.cloud.callFunction({
  name: 'couponService',
  data: { action: 'getCoupons', data: params }
})
```

**重构后**：
```javascript
// 统一调用，享受缓存/重试/错误上报
const res = await CloudFunctionService.call('couponService', 'getCoupons', params)
```

**验收标准**：
- [ ] CouponService 所有方法通过 CloudFunctionService 调用
- [ ] 无直接 `wx.cloud.callFunction()` 调用
- [ ] 单元测试通过
- [ ] 优惠券相关功能正常（领取/使用/查询）

**预计耗时**：3 小时

---

## 三、P1 — 代码质量 + 测试补全（Sprint 61-62 · 4 周）

### S61-01: 业务层核心单元测试

**问题**：49 个业务文件中仅 1 个有专门测试（2%），核心支付/订单/钱包模块缺乏测试保障。

**修复方案**：

为以下 5 个核心文件补充单元测试（每个至少 10 个用例）：

| 文件 | 行数 | 当前覆盖率 | 目标覆盖率 | 优先级 |
|------|------|-----------|-----------|--------|
| `paymentService/services/pay.js` | 354 | 85% | 90% | P0 |
| `orderService/orders.js` | 768 | 9.3% | 60% | P0 |
| `partnerService/wallet.js` | 454 | 85% | 90% | P1 |
| `mallService/index.js` | 744 | - | 50% | P1 |
| `adminService/services/user.js` | 1092 | - | 40% | P2 |

**测试策略**：
- Mock wx-server-sdk（复用现有 `test/__mocks__/wx-server-sdk.js`）
- Mock CloudBase 数据库操作
- 覆盖成功/失败/边界三种场景
- 使用 jest.spyOn 模拟外部依赖

**涉及文件**：
```
test/payment-service-pay.test.js（增强）
test/order-service-orders.test.js（增强）
test/partner-service-wallet.test.js（增强）
test/mall-service-unit.test.js（新增）
test/admin-service-user.test.js（新增）
```

**验收标准**：
- [ ] 5 个核心文件均有专门测试
- [ ] 每个文件至少 10 个用例
- [ ] 全局覆盖率从 65% 提升到 75%
- [ ] orderService.orders.js 覆盖率从 9.3% 提升到 60%

**预计耗时**：每个文件 4-6 小时，共 20-30 小时

---

### S61-02: console.* 批量替换为 logger

**问题**：74 处 `console.log/info/warn/error` 直接调用，未走 `cloudfunctions/common/logger.js`。

**修复方案**：

1. 编写 codemod 脚本 `scripts/codemod-console-to-logger.js`
2. 扫描所有 `console.*` 调用
3. 根据上下文自动替换为 `logger.debug/info/warn/error`
4. 补充 logger 导入语句
5. 运行 ESLint 验证

**替换规则**：
```javascript
// Before
console.log('[ServiceName] message:', data)
console.error('[ServiceName] error:', error)

// After
const logger = require('../common/logger').createLogger('ServiceName')
logger.info('message', { data })
logger.error('error', { error: error.message, stack: error.stack })
```

**涉及文件**：
```
scripts/codemod-console-to-logger.js（新增）
cloudfunctions/*/index.js（批量修改）
cloudfunctions/*/services/*.ts（批量修改）
```

**验收标准**：
- [ ] `grep -r "console\." cloudfunctions/` 返回 0 结果（除 common/logger.js 外）
- [ ] ESLint 0 error
- [ ] 所有云函数正常运行

**预计耗时**：4 小时（含脚本编写 + 验证）

---

### S61-03: 重复代码抽取

**问题**：`createCommissionRecord` 在 activity/mall/feeding 三处重复；`refundCouponForOrder` 在 mall/feeding 重复。

**修复方案**：

1. 抽取 `createCommissionRecord` 到 `cloudfunctions/common/commission-utils.ts`
2. 抽取 `refundCouponForOrder` 到 `cloudfunctions/common/coupon-utils.ts`
3. 各服务改为 import 共享函数
4. 补充共享函数单元测试

**涉及文件**：
```
cloudfunctions/common/commission-utils.ts（新增）
cloudfunctions/common/coupon-utils.ts（新增）
cloudfunctions/activityService/services/*.ts（修改）
cloudfunctions/mallService/services/*.ts（修改）
cloudfunctions/feedingService/services/*.ts（修改）
test/common-commission-utils.test.js（新增）
test/common-coupon-utils.test.js（新增）
```

**验收标准**：
- [ ] 重复代码消除
- [ ] 共享函数有独立测试
- [ ] 原有功能不受影响

**预计耗时**：6 小时

---

### S62-01: i18n 覆盖率补全

**问题**：部分页面（home、messages）未使用 i18n，直接硬编码中文。

**修复方案**：

1. 扫描所有页面，列出未使用 `pageI18n.mixin()` 的页面
2. 为这些页面添加 i18n 支持
3. 收集硬编码中文字符串到 i18n 字典
4. 更新 zh/en/ja 三语翻译

**涉及文件**：
```
pages/home/index.js（添加 pageI18n）
pages/messages/index.js（添加 pageI18n）
utils/i18n.js（补充字典）
```

**验收标准**：
- [ ] 所有主包页面使用 pageI18n.mixin()
- [ ] 硬编码中文字符串为 0
- [ ] 三语切换正常

**预计耗时**：4 小时

---

### S62-02: 云图标路径统一

**问题**：多处直接写 `cloud://cloudbase-d7getcjqy33b13475...` 路径，wxs/cloudIcons.wxs 工具未被充分利用。

**修复方案**：

1. 扫描所有硬编码的云存储路径
2. 替换为 `wxs/cloudIcons.wxs` 的 `icon()` 方法调用
3. 或在 JS 中通过统一的 `getCloudUrl()` 函数构建

**涉及文件**：
```
wxs/cloudIcons.wxs（可能需要扩展）
pages/**/*.js（批量修改）
subpackages/**/*.js（批量修改）
```

**验收标准**：
- [ ] 硬编码云存储路径为 0
- [ ] 所有云图标通过统一函数获取

**预计耗时**：3 小时

---

## 四、P2 — 架构优化 + 组件化（Sprint 63-65 · 6 周）

### S63-01: adminService 按业务域拆分

**问题**：100+ 个 action 聚合在一个云函数，冷启动时间长，维护困难。

**修复方案**：

按业务域拆分为独立云函数：

| 原始 | 拆分后 | Actions |
|------|--------|---------|
| adminService | adminUserService | 用户管理相关 |
| | adminOrderService | 订单管理相关 |
| | adminProductService | 商品/活动管理相关 |
| | adminFinanceService | 钱包/提现/佣金相关 |
| | adminSystemService | 系统配置/i18n/审计相关 |

**迁移策略**：
1. 保持旧 adminService 入口兼容（转发到新服务）
2. 逐步迁移前端调用到新服务
3. 验证无误后移除旧入口

**涉及文件**：
```
cloudfunctions/adminUserService/（新增）
cloudfunctions/adminOrderService/（新增）
cloudfunctions/adminProductService/（新增）
cloudfunctions/adminFinanceService/（新增）
cloudfunctions/adminSystemService/（新增）
cloudfunctions/adminService/index.ts（改为转发）
services/CloudFunctionService.js（添加新服务）
```

**验收标准**：
- [ ] 5 个新云函数独立运行
- [ ] 旧 adminService 兼容转发
- [ ] 管理后台所有功能正常
- [ ] 冷启动时间降低 50%

**预计耗时**：每个服务 4 小时，共 20 小时

---

### S63-02: 页面组件化

**问题**：活动卡片、团购卡片、订单卡片等在多页面重复实现，未抽取为可复用组件。

**修复方案**：

抽取以下可复用组件：

| 组件 | 使用页面 | 说明 |
|------|----------|------|
| `activity-card` | home, quick-register, activity/list | 活动卡片 |
| `tuan-card` | home, discover, group-detail | 团购卡片 |
| `order-card` | profile/order-stats, activity/my-registered | 订单卡片 |
| `pet-avatar` | pet/list, pet/detail, profile/index | 宠物头像 |
| `host-card` | booking/host-list-all, feeding/groomer-list | 寄养家庭/喂养师卡片 |

**涉及文件**：
```
components/activity-card/（新增）
components/tuan-card/（新增）
components/order-card/（新增）
components/pet-avatar/（新增）
components/host-card/（新增）
pages/home/index.wxml（修改）
pages/discover/index.wxml（修改）
subpackages/*/index.wxml（修改）
```

**验收标准**：
- [ ] 5 个组件独立可用
- [ ] 原有页面功能不变
- [ ] 组件有基础 props 验证

**预计耗时**：每个组件 3 小时，共 15 小时

---

### S64-01: ListBehavior 推广

**问题**：activity/list 使用了 ListBehavior，但 host-list-all、discover、quick-register 等页面各自实现了相同的分页逻辑。

**修复方案**：

1. 增强 ListBehavior，支持更多配置项（排序、筛选、空状态）
2. 推广到以下页面：
   - `subpackages/booking/host-list-all.js`
   - `pages/discover/index.js`
   - `pages/quick-register/index.js`
   - `subpackages/activity/list.js`（已使用，优化）
   - `subpackages/mall/product-list.js`

**涉及文件**：
```
behaviors/listBehavior.js（增强）
subpackages/booking/host-list-all.js（修改）
pages/discover/index.js（修改）
pages/quick-register/index.js（修改）
subpackages/mall/product-list.js（修改）
```

**验收标准**：
- [ ] 5 个页面使用统一的 ListBehavior
- [ ] 分页逻辑无重复代码
- [ ] 下拉刷新/上拉加载功能正常

**预计耗时**：8 小时

---

### S64-02: 活动支付迁移到微信支付 V3

**问题**：activityService 仍用微信支付 V1 + XML 解析，而 paymentService 已迁到 V3，存在不一致。

**修复方案**：

1. 将 activityService 的支付逻辑迁移到 paymentService
2. 使用 V3 API（JSON 格式，无需 XML 解析）
3. 统一支付回调处理
4. 删除 V1 相关代码

**涉及文件**：
```
cloudfunctions/activityService/services/payment.ts（重构）
cloudfunctions/paymentService/services/pay.ts（添加活动支付）
```

**验收标准**：
- [ ] 活动支付使用 V3 API
- [ ] 支付回调正常处理
- [ ] 无 XML 解析代码

**预计耗时**：6 小时

---

### S64-03: TabBar 配置统一

**问题**：`app.json` selectedColor `#4ECDC4` vs `index.js` selectedColor `#FF6B00`；图标路径不一致。

**修复方案**：

1. 统一 selectedColor 为品牌色
2. 统一图标路径格式（SVG 或 PNG，选择一种）
3. 同步更新 app.json 和 custom-tab-bar/index.js

**涉及文件**：
```
app.json（修改）
custom-tab-bar/index.js（修改）
```

**验收标准**：
- [ ] selectedColor 一致
- [ ] 图标路径格式统一
- [ ] TabBar 渲染正常

**预计耗时**：2 小时

---

### S65-01: group-detail/index.js 拆分

**问题**：423 行，包含完整的 SKU 选择、价格计算、规格联动逻辑。

**修复方案**：

1. 抽取 SKU 选择组件 `components/sku-selector/`
2. 抽取价格计算逻辑到 `utils/priceCalculator.js`
3. 简化 group-detail 页面逻辑

**涉及文件**：
```
components/sku-selector/（新增）
utils/priceCalculator.js（新增）
subpackages/booking/group-detail.js（简化）
```

**验收标准**：
- [ ] SKU 选择组件独立可用
- [ ] 价格计算逻辑可复用
- [ ] group-detail 页面行数减少到 200 以下

**预计耗时**：6 小时

---

### S65-02: home/index.js 职责拆分

**问题**：315 行，同时处理 Banner/宠物/活动/团购/最近浏览多个板块的数据加载。

**修复方案**：

1. 抽取各板块的数据加载逻辑到独立模块
2. 使用 Behavior 混入各板块能力
3. 简化 home 页面主逻辑

**涉及文件**：
```
behaviors/homeBannerBehavior.js（新增）
behaviors/homePetBehavior.js（新增）
behaviors/homeActivityBehavior.js（新增）
pages/home/index.js（简化）
```

**验收标准**：
- [ ] 各板块数据加载独立
- [ ] home 页面行数减少到 150 以下
- [ ] 首页功能正常

**预计耗时**：4 小时

---

### S65-03: 限流覆盖扩展

**问题**：限流仅覆盖 4 个业务点，部分公开接口缺少限流保护。

**修复方案**：

1. 扫描所有云函数入口，识别需要限流的接口
2. 为以下接口添加限流：
   - `userService.login`（登录限流）
   - `userService.register`（注册限流）
   - `activityService.apply`（报名限流）
   - `mallService.createOrder`（下单限流）
3. 更新 `rate_limit_configs` 配置

**涉及文件**：
```
cloudfunctions/userService/index.ts（添加限流）
cloudfunctions/activityService/index.ts（添加限流）
cloudfunctions/mallService/index.ts（添加限流）
cloudfunctions/common/rate-limit-config.ts（更新配置）
```

**验收标准**：
- [ ] 4 个新接口有限流保护
- [ ] 限流配置合理（不影响正常用户）
- [ ] 超限返回友好提示

**预计耗时**：4 小时

---

## 五、P3 — 工程化增强（Sprint 66-67 · 4 周）

### S66-01: API 文档自动生成

**问题**：云函数的 action 和参数缺少自动化文档。

**修复方案**：

1. 编写脚本 `scripts/generate-api-docs.js`
2. 扫描所有云函数的 `SUPPORTED_ACTIONS` 和 handler 参数
3. 生成 Markdown 格式的 API 文档
4. 集成到 CI（每次部署自动更新）

**涉及文件**：
```
scripts/generate-api-docs.js（新增）
docs/API_REFERENCE.md（自动生成）
```

**验收标准**：
- [ ] 脚本可自动生成 API 文档
- [ ] 文档包含所有 action 的参数说明
- [ ] CI 集成成功

**预计耗时**：8 小时

---

### S66-02: 性能基线（k6）建立

**问题**：缺少核心 API 的性能基线数据。

**修复方案**：

1. 编写 k6 测试脚本，覆盖以下场景：
   - 用户登录
   - 订单创建
   - 支付回调
   - 商品列表查询
   - 活动报名
2. 建立 p50/p95/p99 基线
3. 集成到 CI（定期运行）

**涉及文件**：
```
test/perf/k6-login.js（新增）
test/perf/k6-order.js（新增）
test/perf/k6-payment.js（新增）
test/perf/k6-product.js（新增）
test/perf/k6-activity.js（新增）
```

**验收标准**：
- [ ] 5 个场景有 k6 脚本
- [ ] 性能基线数据记录
- [ ] CI 集成成功

**预计耗时**：10 小时

---

### S66-03: 错误码国际化完整覆盖

**问题**：errors-i18n.ts 存在但未在所有错误路径中使用。

**修复方案**：

1. 扫描所有 `throw err()` 调用
2. 确保错误消息通过 i18n 系统
3. 补充缺失的错误码翻译

**涉及文件**：
```
cloudfunctions/common/errors-i18n.ts（补充）
cloudfunctions/*/services/*.ts（修改）
```

**验收标准**：
- [ ] 所有错误消息支持三语
- [ ] 错误码字典完整

**预计耗时**：6 小时

---

### S67-01: ESLint 清理 TIM 全局变量

**问题**：`.eslintrc.json` 仍声明 TIM 全局变量，但 IM 服务已在 Sprint 2 移除。

**修复方案**：

1. 从 `.eslintrc.json` 移除 `TIM` 全局变量声明
2. 搜索代码中是否还有 TIM 相关引用
3. 清理残留代码

**涉及文件**：
```
.eslintrc.json（修改）
```

**验收标准**：
- [ ] TIM 全局变量移除
- [ ] 无 TIM 相关代码残留

**预计耗时**：30 分钟

---

### S67-02: Grafana Dashboard 模板

**问题**：Sprint 57-58 构建的 metrics 体系缺少可视化 Dashboard。

**修复方案**：

1. 基于 metrics.ts 暴露的指标，编写 Grafana JSON 模板
2. 覆盖以下面板：
   - 订单创建趋势
   - 支付成功率
   - 错误码分布
   - 限流命中率
   - P95 延迟
3. 提供导入指南

**涉及文件**：
```
docs/grafana-dashboard.json（新增）
docs/grafana-setup-guide.md（新增）
```

**验收标准**：
- [ ] Dashboard JSON 可导入 Grafana
- [ ] 面板数据正确展示

**预计耗时**：6 小时

---

### S67-03: 空生命周期方法清理

**问题**：部分页面有空的 empty/onHide/onUnload 方法。

**修复方案**：

1. 扫描所有页面的生命周期方法
2. 移除空的（无逻辑的）生命周期方法
3. 保留有实际逻辑的方法

**涉及文件**：
```
pages/**/*.js（批量修改）
subpackages/**/*.js（批量修改）
```

**验收标准**：
- [ ] 空生命周期方法为 0
- [ ] 页面功能正常

**预计耗时**：2 小时

---

## 六、任务依赖关系

```
Sprint 60 (P0)
├── S60-01: 统一 AppID
└── S60-02: CouponService 统一调用
    ↓
Sprint 61 (P1)
├── S61-01: 业务层核心测试
├── S61-02: console.* 替换
└── S61-03: 重复代码抽取
    ↓
Sprint 62 (P1)
├── S62-01: i18n 覆盖率补全
└── S62-02: 云图标路径统一
    ↓
Sprint 63 (P2)
├── S63-01: adminService 拆分（依赖 S61-03）
└── S63-02: 页面组件化
    ↓
Sprint 64 (P2)
├── S64-01: ListBehavior 推广
├── S64-02: 活动支付 V3 迁移
├── S64-03: TabBar 配置统一
└── S64-04: 限流覆盖扩展
    ↓
Sprint 65 (P2)
├── S65-01: group-detail 拆分
├── S65-02: home/index.js 拆分
└── S65-03: 空生命周期清理
    ↓
Sprint 66 (P3)
├── S66-01: API 文档自动生成
├── S66-02: k6 性能基线
└── S66-03: 错误码国际化
    ↓
Sprint 67 (P3)
├── S67-01: ESLint TIM 清理
├── S67-02: Grafana Dashboard
└── S67-03: 空生命周期清理
```

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| adminService 拆分导致回归 | 中 | 高 | 先写测试作为安全网，拆分后测试必须过 |
| 组件化引入样式冲突 | 低 | 中 | 使用 BEM 命名 + scoped styles |
| i18n 替换遗漏 | 中 | 低 | CI 脚本扫描硬编码中文 |
| 限流配置过严影响正常用户 | 低 | 高 | 灰度上线 + 监控告警 |
| 支付 V3 迁移兼容性 | 中 | 高 | 双写验证期 + 回滚方案 |

---

## 八、验收总标准

### 代码质量
- [ ] ESLint 0 error
- [ ] Prettier 0 diff
- [ ] 全局测试覆盖率 ≥ 80%
- [ ] 核心模块测试覆盖率 ≥ 90%

### 功能验证
- [ ] 小程序所有页面正常
- [ ] 云函数所有 action 正常
- [ ] 支付流程完整
- [ ] 管理后台所有功能正常

### 性能指标
- [ ] 冷启动时间 ≤ 2s
- [ ] 核心 API P95 ≤ 1s
- [ ] 支付回调 ≤ 5s

### 安全指标
- [ ] 限流覆盖所有公开接口
- [ ] 敏感信息加密存储
- [ ] 操作审计完整

---

## 九、参考文档

- [全面检查报告](docs/FULL_CHECK_REPORT.md)
- [重构计划](docs/REFACTOR_PLAN.md)
- [架构概览](docs/ARCHITECTURE.md)
- [命名规范](docs/NAMING_CONVENTION.md)
- [Sprint 57-58 交付](docs/SPRINT_57_58_DELIVERY.md)
