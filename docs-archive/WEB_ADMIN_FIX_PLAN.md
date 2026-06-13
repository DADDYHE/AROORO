# AROORO Web Admin 修复方案规划

> 配套《Web Admin 审查报告》执行。基于审查发现，按优先级分 Sprint 推进。
> 创建日期：2026-06-12

---

## 一、规划总览

| 阶段 | Sprint 范围 | 主题 | 任务数 | 状态 |
|------|------------|------|--------|------|
| P0 | Sprint 83 | 安全漏洞修复 | 5 | ⏳ 待决策 |
| P1 | Sprint 84 | Bug 修复 | 8 | ⏳ 待决策 |
| P2 | Sprint 85 | 代码质量改进 | 9 | ⏳ 待决策 |

---

## 二、P0 — 安全漏洞修复（Sprint 83 · 1 周）

### T100: .env.development 添加到 .gitignore

**问题**：`.env.development` 包含 API Key 但未在 `.gitignore` 中，可能被提交到仓库。

**涉及文件**：
```
web-admin/.gitignore
```

**修复方案**：
1. 在 `.gitignore` 中添加 `.env.development`
2. 确认 Git 历史中是否已包含该文件
3. 如果已包含，考虑使用 `git filter-branch` 或 BFG 清理

**验收标准**：
- [ ] .env.development 在 .gitignore 中
- [ ] Git 历史中无敏感信息

**预计耗时**：1 小时

---

### T101: server.js 环境变量从 .env 读取

**问题**：`server.js` 硬编码了 `CB_ENV = 'cloudbase-d7getcjqy33b13475'`。

**涉及文件**：
```
web-admin/server.js
```

**修复方案**：
1. 将 `CB_ENV` 从环境变量读取
2. 使用 `dotenv` 加载 `.env` 文件
3. 添加环境变量校验

**验收标准**：
- [ ] CB_ENV 从环境变量读取
- [ ] 有环境变量校验

**预计耗时**：30 分钟

---

### T102: server.js 添加请求验证

**问题**：API 代理未验证 `action` 和 `data` 参数，攻击者可调用任何云函数。

**涉及文件**：
```
web-admin/server.js
```

**修复方案**：
1. 添加 action 白名单
2. 验证 data 参数结构
3. 添加请求大小限制

**验收标准**：
- [ ] action 白名单校验
- [ ] data 参数验证
- [ ] 请求大小限制

**预计耗时**：2 小时

---

### T103: server.js CSP 策略加强

**问题**：CSP 允许 `'unsafe-inline'` 和 `'unsafe-eval'`，XSS 防护形同虚设。

**涉及文件**：
```
web-admin/server.js
```

**修复方案**：
1. 移除 `'unsafe-inline'` 和 `'unsafe-eval'`
2. 使用 nonce 或 hash 替代 inline script
3. 或使用 CSP Level 3 的 strict-dynamic

**验收标准**：
- [ ] CSP 不包含 unsafe-inline/unsafe-eval
- [ ] 页面功能正常

**预计耗时**：4 小时

---

### T104: server.js 添加 rate limiting

**问题**：无请求频率限制，易受 DDoS 攻击。

**涉及文件**：
```
web-admin/server.js
```

**修复方案**：
1. 使用 express-rate-limit 中间件
2. 配置合理的限制（如每分钟 100 次）
3. 添加 IP 黑名单机制

**验收标准**：
- [ ] 有限流中间件
- [ ] 配置合理
- [ ] 超限返回 429

**预计耗时**：2 小时

---

## 三、P1 — Bug 修复（Sprint 84 · 1 周）

### T105: TuanDealEdit upload headers key 错误

**问题**：使用 `admin_token` 而非 `token`，导致上传认证失败。

**涉及文件**：
```
web-admin/src/views/tuan/TuanDealEdit.vue:180-184
```

**修复方案**：
1. 将 `admin_token` 改为 `token`
2. 或使用 `useAuthStore().token`

**验收标准**：
- [ ] 上传功能正常
- [ ] 认证正确

**预计耗时**：15 分钟

---

### T106: formatMoney NaN 处理

**问题**：非数字字符串返回 `¥NaN`。

**涉及文件**：
```
web-admin/src/utils/format.js:21-24
```

**修复方案**：
1. 添加 `isNaN` 检查
2. 无效值返回 `¥0.00`

**验收标准**：
- [ ] 无效值显示 ¥0.00
- [ ] 正常值显示正确

**预计耗时**：15 分钟

---

### T107: echarts 内存泄漏修复

**问题**：每次调用都重新 `echarts.init()` 而不 dispose 旧实例。

**涉及文件**：
```
web-admin/src/views/order/OrderStatsView.vue
web-admin/src/views/dashboard/DashboardView.vue
```

**修复方案**：
1. 在 `echarts.init()` 前检查并 dispose 旧实例
2. 使用 `echarts.getInstanceByDom()` 获取已有实例
3. 在 `onUnmounted` 中 dispose 所有实例

**验收标准**：
- [ ] 无内存泄漏
- [ ] 图表正常显示

**预计耗时**：3 小时

---

### T108: TuanDealEdit upload headers key 修复

**问题**：同 T105。

**涉及文件**：
```
web-admin/src/views/tuan/TuanDealEdit.vue:180-184
```

**修复方案**：同 T105。

**预计耗时**：15 分钟

---

### T109: formatMoney NaN 修复

**问题**：同 T106。

**涉及文件**：
```
web-admin/src/utils/format.js:21-24
```

**修复方案**：同 T106。

**预计耗时**：15 分钟

---

### T110: upload.js 移除冗余错误检查

**问题**：`result.code` 检查永远不会被执行。

**涉及文件**：
```
web-admin/src/api/upload.js:14-20
```

**修复方案**：
1. 移除冗余的 `result.code` 检查
2. 直接 `return result.data`

**验收标准**：
- [ ] 上传功能正常
- [ ] 无冗余检查

**预计耗时**：15 分钟

---

### T111: DashboardView 双 onMounted 合并

**问题**：两个 onMounted 可能导致 ResizeObserver 观察 null 元素。

**涉及文件**：
```
web-admin/src/views/dashboard/DashboardView.vue:172,310
```

**修复方案**：
1. 将 ResizeObserver 初始化合并到第一个 onMounted
2. 在 renderCharts() 之后执行

**验收标准**：
- [ ] 图表正常显示
- [ ] ResizeObserver 正常工作

**预计耗时**：1 小时

---

### T112: AllOrdersView 分页逻辑修复

**问题**：全部类型模式下 5 个并行请求，分页逻辑不正确。

**涉及文件**：
```
web-admin/src/views/order/AllOrdersView.vue:107-125
```

**修复方案**：
1. 后端实现统一的订单查询接口
2. 或限制全部类型模式下的分页大小
3. 添加去重逻辑

**验收标准**：
- [ ] 分页逻辑正确
- [ ] 无重复数据

**预计耗时**：4 小时

---

## 四、P2 — 代码质量改进（Sprint 85 · 1 周）

### T113: server.js 添加 HTTPS 强制

**问题**：未强制 HTTPS。

**涉及文件**：
```
web-admin/server.js
```

**修复方案**：
1. 添加 HTTPS 重定向中间件
2. 或在反向代理层配置

**验收标准**：
- [ ] HTTP 请求重定向到 HTTPS

**预计耗时**：1 小时

---

### T114: api/index.js 添加重试机制

**问题**：网络错误时无重试。

**涉及文件**：
```
web-admin/src/api/index.js
```

**修复方案**：
1. 使用 axios-retry 或自定义重试逻辑
2. 配置重试次数和延迟
3. 仅对网络错误重试

**验收标准**：
- [ ] 网络错误自动重试
- [ ] 重试次数可配置

**预计耗时**：2 小时

---

### T115: cloudbase.js 清理死代码

**问题**：`cloudbase.js` 中的匿名登录逻辑从未被调用。

**涉及文件**：
```
web-admin/src/cloudbase.js
```

**修复方案**：
1. 确认是否需要保留
2. 如不需要，删除文件
3. 更新导入引用

**验收标准**：
- [ ] 无死代码
- [ ] 功能正常

**预计耗时**：30 分钟

---

### T116: auth.js token 刷新机制

**问题**：token 过期后直接登出，无刷新机制。

**涉及文件**：
```
web-admin/src/stores/auth.js
```

**修复方案**：
1. 在 token 过期前自动刷新
2. 使用 refresh token（如支持）
3. 或静默重新登录

**验收标准**：
- [ ] token 过期前自动刷新
- [ ] 用户无感知

**预计耗时**：4 小时

---

### T117: 路由权限细化

**问题**：只检查是否登录，未检查具体权限。

**涉及文件**：
```
web-admin/src/router/index.js
```

**修复方案**：
1. 在路由 meta 中添加权限要求
2. 在 beforeEach 中检查用户权限
3. 无权限时重定向到 403 页面

**验收标准**：
- [ ] 路由有权限要求
- [ ] 无权限时重定向

**预计耗时**：3 小时

---

### T118: echarts 实例管理统一

**问题**：多个页面独立管理 echarts 实例，存在大量重复代码。

**涉及文件**：
```
web-admin/src/composables/useChart.js（新增）
```

**修复方案**：
1. 创建 `useChart` composable
2. 封装 init/dispose/resize 逻辑
3. 在所有 echarts 页面中使用

**验收标准**：
- [ ] 创建 useChart composable
- [ ] 所有 echarts 页面使用
- [ ] 无内存泄漏

**预计耗时**：4 小时

---

### T119: 提取 useAutoRefresh composable

**问题**：6 个 OrderList 组件有重复的自动刷新逻辑。

**涉及文件**：
```
web-admin/src/composables/useAutoRefresh.js（新增）
```

**修复方案**：
1. 创建 `useAutoRefresh` composable
2. 封装 start/stop/watch 逻辑
3. 在所有 OrderList 组件中使用

**验收标准**：
- [ ] 创建 useAutoRefresh composable
- [ ] 所有 OrderList 组件使用
- [ ] 功能正常

**预计耗时**：3 小时

---

### T120: 移除未使用的导入

**问题**：多个文件导入了 `formatPhone` 但未使用。

**涉及文件**：
```
web-admin/src/views/order/AllOrdersView.vue
web-admin/src/views/order/TuanOrderList.vue
web-admin/src/views/order/ActivityOrderList.vue
web-admin/src/views/mall-order/MallOrderList.vue
web-admin/src/views/hosting/BoardingOrderList.vue
web-admin/src/views/feeding/FeedingOrderList.vue
```

**修复方案**：
1. 移除未使用的 `formatPhone` 导入

**验收标准**：
- [ ] 无未使用的导入
- [ ] 功能正常

**预计耗时**：30 分钟

---

### T121: variables.scss 清理

**问题**：SCSS 变量定义但从未被引用。

**涉及文件**：
```
web-admin/src/styles/variables.scss
```

**修复方案**：
1. 删除未使用的 SCSS 变量文件
2. 或在需要的地方引用

**验收标准**：
- [ ] 无未使用的样式文件

**预计耗时**：15 分钟

---

## 五、任务依赖关系

```
Sprint 83 (P0)
├── T100: .env.development 添加到 .gitignore
├── T101: server.js 环境变量从 .env 读取
├── T102: server.js 添加请求验证
├── T103: server.js CSP 策略加强
└── T104: server.js 添加 rate limiting
    ↓
Sprint 84 (P1)
├── T105: TuanDealEdit upload headers key 错误
├── T106: formatMoney NaN 处理
├── T107: echarts 内存泄漏修复
├── T108: TuanDealEdit upload headers key 修复
├── T109: formatMoney NaN 修复
├── T110: upload.js 移除冗余错误检查
├── T111: DashboardView 双 onMounted 合并
└── T112: AllOrdersView 分页逻辑修复
    ↓
Sprint 85 (P2)
├── T113: server.js 添加 HTTPS 强制
├── T114: api/index.js 添加重试机制
├── T115: cloudbase.js 清理死代码
├── T116: auth.js token 刷新机制
├── T117: 路由权限细化
├── T118: echarts 实例管理统一
├── T119: 提取 useAutoRefresh composable
├── T120: 移除未使用的导入
└── T121: variables.scss 清理
```

---

## 六、验收总标准

### 安全性
- [ ] .env.development 不被提交到 git
- [ ] CSP 不包含 unsafe-inline/unsafe-eval
- [ ] API 代理有 action 白名单
- [ ] 有限流机制
- [ ] Token 安全存储

### 功能性
- [ ] 所有页面功能正常
- [ ] 上传功能正常
- [ ] 分页逻辑正确
- [ ] 图表正常显示

### 代码质量
- [ ] 无未使用的导入
- [ ] 无内存泄漏
- [ ] 无重复代码

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| CSP 加强导致功能异常 | 中 | 高 | 灰度上线 + 回滚方案 |
| echarts 修复引入回归 | 低 | 中 | 先写测试作为安全网 |
| 分页逻辑修改影响用户体验 | 中 | 中 | 灰度上线 + 用户反馈 |
| rate limiting 影响正常用户 | 低 | 高 | 合理配置阈值 |

---

## 八、参考文档

- [Web Admin 审查报告](docs/WEB_ADMIN_AUDIT_REPORT.md)
- [云函数审查报告](docs/CLOUD_FUNCTION_AUDIT_REPORT.md)
- [项目架构概览](docs/ARCHITECTURE.md)
