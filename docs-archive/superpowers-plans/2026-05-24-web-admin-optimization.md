# Web管理端优化方案

> **目标：** 基于用户端功能现状，评估并优化Web管理端（web-admin）的功能完整性

**架构设计说明：**

| 角色 | 管理端 | 功能范围 |
|------|--------|---------|
| **平台管理员** | web-admin (Vue 3) | 团购、商城、上门服务、优惠券、用户管理、数据看板、审批、权限配置 |
| **合作伙伴** | 小程序分包 (subpackages/admin) | 活动管理、寄养管理、收入查看、带货推荐、提现 |

---

## ✅ 实施完成清单

### Phase 1: 数据看板增强
- [x] 使用已安装的 echarts 图表库
- [x] 增强 `DashboardView.vue` - 添加趋势图表（订单趋势、收入趋势、类型分布）
- [x] 增强 `DashboardView.vue` - 添加核心指标卡片（今日订单、今日收入、总用户数、总收入）
- [x] 增强 `DashboardView.vue` - 添加快捷入口（待支付、待发货、待审核、待处理提现）

### Phase 2: 订单管理优化
- [x] 创建订单统计API (`src/api/order-stats.js`)
- [x] 创建订单统计页面 (`src/views/order/OrderStatsView.vue`)
- [x] 添加路由 `/order/stats`
- [x] 更新菜单 - 添加订单统计入口
- [x] 增强 `AllOrdersView.vue` - 添加日期筛选和导出功能

### Phase 3: 优惠券统计
- [x] 创建优惠券统计API (`src/api/coupon-stats.js`)
- [x] 创建优惠券统计页面 (`src/views/coupon/StatsView.vue`)
- [x] 添加路由 `/coupon/stats`
- [x] 更新菜单 - 优惠券子菜单（模板管理、发放管理、优惠券统计）

### Phase 4: 清理废弃代码
- [x] 删除废弃的 `admin/` 目录（小程序旧管理端）

---

## 新增/修改文件清单

### 新建文件

| 文件路径 | 描述 |
|---------|------|
| `web-admin/src/api/order-stats.js` | 订单统计API |
| `web-admin/src/api/coupon-stats.js` | 优惠券统计API |
| `web-admin/src/views/order/OrderStatsView.vue` | 订单统计页面 |
| `web-admin/src/views/coupon/StatsView.vue` | 优惠券统计页面 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `web-admin/src/views/dashboard/DashboardView.vue` | 增强看板（图表+卡片+快捷入口） |
| `web-admin/src/views/order/AllOrdersView.vue` | 添加日期筛选和导出功能 |
| `web-admin/src/router/index.js` | 添加新路由 |
| `web-admin/src/utils/constants.js` | 更新菜单配置 |

### 删除文件

| 文件路径 | 说明 |
|---------|------|
| `admin/` | 小程序旧管理端目录（已废弃） |

---

## 新增功能预览

### 数据看板增强
- 4个核心指标卡片（今日订单、今日收入、总用户数、总收入）
- 4个快捷入口（待支付、待发货、待审核、待处理提现）
- 订单趋势图（支持7天/30天切换）
- 订单类型分布饼图
- 收入趋势柱状图
- 收入类型分布饼图

### 订单统计页面
- 订单统计概览（总数、收入、今日统计）
- 订单趋势图表
- 订单类型分布图表
- 订单明细列表（支持类型、状态、日期筛选）
- 订单导出功能（CSV格式）

### 优惠券统计页面
- 优惠券概览（已发放、已使用、核销金额、使用率）
- 发放趋势图表
- 使用率分布饼图
- 各模板发放量图表
- 优惠券效果数据（带动订单、带动收入、核销金额、优惠金额）
- 发放记录列表

### 全部订单增强
- 日期范围筛选
- 导出当前筛选结果为CSV

---

## 后续建议

1. **后端API对接** - 新增的统计页面需要后端提供对应接口：
   - `getOrderStats` - 订单统计
   - `exportOrders` - 订单导出
   - `getOrderTrend` - 订单趋势
   - `getOrderTypeStats` - 订单类型统计
   - `getCouponStatistics` - 优惠券统计
   - `getDashboardStats` - 增强看板统计（需要新增 pendingPayment, pendingShip, pendingApproval, pendingWithdrawal, todayOrders, todayRevenue, orderTrend, revenueTrend, ordersByType 等字段）

2. **数据导出增强** - 当前订单导出仅导出当前页，可考虑添加全量导出

3. **权限控制完善** - 确认各菜单项的权限配置正确

---

## 验证清单

- [ ] 数据看板：显示趋势图表
- [ ] 数据看板：显示核心指标卡片
- [ ] 数据看板：显示快捷入口
- [ ] 订单统计：页面访问正常
- [ ] 订单统计：筛选功能正常
- [ ] 订单统计：导出功能正常
- [ ] 优惠券统计：页面访问正常
- [ ] 优惠券统计：图表显示正常
- [ ] 整体：权限控制正确
- [ ] 整体：响应式布局正常
