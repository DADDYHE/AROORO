# 上门服务订单管理优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善 Web 管理端上门服务订单的入口、命名一致性和详情页功能

**Architecture:** 前端 Vue 3 + Element Plus，遵循现有商城订单/寄养订单的组件模式；后端已有 `getFeedingOrderDetail` 接口，只需补充前端 API 调用和页面组件

**Tech Stack:** Vue 3 (Composition API), Element Plus, Vue Router, Axios

---

## File Structure

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| Modify | `web-admin/src/utils/constants.js` | 侧边栏菜单：上门服务菜单增加订单入口；订单管理菜单中"服务订单"改名为"上门服务订单" |
| Modify | `web-admin/src/api/feeding.js` | 新增 `getFeedingOrderDetail` API 调用 |
| Modify | `web-admin/src/router/index.js` | 新增 `/order/feeding/:id` 路由 |
| Modify | `web-admin/src/views/feeding/FeedingOrderList.vue` | 操作列增加"详情"按钮 |
| Create | `web-admin/src/views/feeding/FeedingOrderDetail.vue` | 上门服务订单详情页 |

---

### Task 1: 侧边栏菜单优化

**Files:**
- Modify: `web-admin/src/utils/constants.js:80-82` (上门服务菜单)
- Modify: `web-admin/src/utils/constants.js:57-65` (订单管理菜单)

- [ ] **Step 1: 在"上门服务"菜单下增加"上门服务订单"入口**

将 `SIDEBAR_MENUS` 中上门服务菜单从：

```js
{ title: '上门服务', icon: 'Service', path: '/feeding', permission: 'feeding', children: [
    { title: '服务师管理', path: '/feeding/feeders' },
]},
```

改为：

```js
{ title: '上门服务', icon: 'Service', path: '/feeding', permission: 'feeding', children: [
    { title: '上门服务订单', path: '/order/feeding' },
    { title: '服务师管理', path: '/feeding/feeders' },
]},
```

- [ ] **Step 2: 将订单管理菜单中"服务订单"改名为"上门服务订单"**

将订单管理子菜单中的：

```js
{ title: '服务订单', path: '/order/feeding' },
```

改为：

```js
{ title: '上门服务订单', path: '/order/feeding' },
```

- [ ] **Step 3: 验证菜单渲染**

启动开发服务器，登录后检查侧边栏：
- "上门服务"菜单下应显示"上门服务订单"和"服务师管理"两个子项
- "订单管理"菜单下"服务订单"应改为"上门服务订单"

---

### Task 2: 补充前端 API 调用

**Files:**
- Modify: `web-admin/src/api/feeding.js`

- [ ] **Step 1: 添加 getFeedingOrderDetail 函数**

在 `web-admin/src/api/feeding.js` 中新增一行导出：

```js
import { callAction } from './index'
export function getFeederList(params) { return callAction('getFeederList', params) }
export function getFeedingOrders(params) { return callAction('getFeedingOrders', params) }
export function handleFeedingOrder(orderId, operation) { return callAction('handleFeedingOrder', { orderId, operation }) }
export function getFeedingOrderDetail(orderId) { return callAction('getFeedingOrderDetail', { orderId }) }
```

后端 `adminService/index.js:127` 已注册 `getFeedingOrderDetail: 'feeding'`，`services/feeding.js:182-201` 已实现该函数，无需后端改动。

---

### Task 3: 添加订单详情路由

**Files:**
- Modify: `web-admin/src/router/index.js:21`

- [ ] **Step 1: 在 feeding 订单列表路由后添加详情路由**

在 `router/index.js` 的 children 数组中，`order/feeding` 路由之后添加：

```js
{ path: 'order/feeding/:id', name: 'FeedingOrderDetail', component: () => import('@/views/feeding/FeedingOrderDetail.vue'), meta: { title: '上门服务订单详情', permission: 'feeding' } },
```

完整上下文（第 21-23 行区域）：

```js
      { path: 'order/feeding', name: 'FeedingOrderList', component: () => import('@/views/feeding/FeedingOrderList.vue'), meta: { title: '服务订单', permission: 'feeding' } },
      { path: 'order/feeding/:id', name: 'FeedingOrderDetail', component: () => import('@/views/feeding/FeedingOrderDetail.vue'), meta: { title: '上门服务订单详情', permission: 'feeding' } },
      { path: 'order/boarding', name: 'BoardingOrderList', component: () => import('@/views/hosting/BoardingOrderList.vue'), meta: { title: '寄养订单', permission: 'hosting' } },
```

同时将 `FeedingOrderList` 的 meta.title 也改为 `'上门服务订单'`：

```js
      { path: 'order/feeding', name: 'FeedingOrderList', component: () => import('@/views/feeding/FeedingOrderList.vue'), meta: { title: '上门服务订单', permission: 'feeding' } },
```

---

### Task 4: 订单列表增加"详情"按钮

**Files:**
- Modify: `web-admin/src/views/feeding/FeedingOrderList.vue`

- [ ] **Step 1: 在操作列添加"详情"按钮**

参照 `MallOrderList.vue` 的模式，在 `FeedingOrderList.vue` 的操作列最前面添加详情按钮。

将操作列模板从：

```html
<el-table-column label="操作" width="200" fixed="right">
  <template #default="{ row }">
    <el-button v-if="row.status === 'pending'" link type="primary" @click="handleOrder(row._id, 'confirm')">确认</el-button>
    <el-button v-if="row.status === 'confirmed'" link type="success" @click="handleOrder(row._id, 'start')">开始</el-button>
    <el-button v-if="row.status === 'in_progress'" link type="success" @click="handleOrder(row._id, 'complete')">完成</el-button>
    <el-button v-if="row.status !== 'completed' && row.status !== 'cancelled'" link type="danger" @click="handleOrder(row._id, 'cancel')">取消</el-button>
  </template>
</el-table-column>
```

改为：

```html
<el-table-column label="操作" width="240" fixed="right">
  <template #default="{ row }">
    <el-button link type="primary" @click="$router.push(`/order/feeding/${row._id}`)">详情</el-button>
    <el-button v-if="row.status === 'pending'" link type="primary" @click="handleOrder(row._id, 'confirm')">确认</el-button>
    <el-button v-if="row.status === 'confirmed'" link type="success" @click="handleOrder(row._id, 'start')">开始</el-button>
    <el-button v-if="row.status === 'in_progress'" link type="success" @click="handleOrder(row._id, 'complete')">完成</el-button>
    <el-button v-if="row.status !== 'completed' && row.status !== 'cancelled'" link type="danger" @click="handleOrder(row._id, 'cancel')">取消</el-button>
  </template>
</el-table-column>
```

---

### Task 5: 创建上门服务订单详情页

**Files:**
- Create: `web-admin/src/views/feeding/FeedingOrderDetail.vue`

- [ ] **Step 1: 创建详情页组件**

参照 `MallOrderDetail.vue` 和后端 `getFeedingOrderDetail` 返回的数据结构（`feeding.js:182-201`），创建详情页：

```vue
<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'上门服务订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ FEEDING_STATUS[order.status] || order.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="用户">{{ order.userName || order.userId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.userPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务师">{{ order.feederName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务师电话">{{ order.feederPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务地址" :span="2">{{ order.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务时间">{{ order.serviceDate ? formatDate(order.serviceDate) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalPrice || order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="宠物">{{ order.petName || order.petNames || '-' }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ order.note || order.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'pending'">
        <el-button type="primary" @click="handleOrder('confirm')">确认订单</el-button>
        <el-button type="danger" @click="handleOrder('reject')">拒绝</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'confirmed'">
        <el-button type="success" @click="handleOrder('start')">开始服务</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'in_progress'">
        <el-button type="success" @click="handleOrder('complete')">完成服务</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getFeedingOrderDetail, handleFeedingOrder } from '@/api/feeding'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_TAG_TYPE } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const FEEDING_STATUS = { pending: '待确认', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' }

const route = useRoute()
const loading = ref(false)
const order = ref({})

async function fetchDetail() {
  loading.value = true
  try {
    const res = await getFeedingOrderDetail(route.params.id)
    order.value = res.data || {}
  } finally {
    loading.value = false
  }
}

async function handleOrder(operation) {
  const labels = { confirm: '确认', start: '开始', complete: '完成', reject: '拒绝' }
  await ElMessageBox.confirm(`确定${labels[operation]}该订单？`)
  await handleFeedingOrder(route.params.id, operation)
  ElMessage.success('操作成功')
  await fetchDetail()
}

onMounted(fetchDetail)
</script>
```

- [ ] **Step 2: 验证详情页功能**

启动开发服务器，进入上门服务订单列表，点击"详情"按钮：
- 应正确跳转到 `/order/feeding/{id}` 页面
- 应显示订单号、状态、用户、服务师、金额、地址等字段
- 确认/开始/完成/拒绝按钮应根据状态正确显示
- 点击返回按钮应回到列表页

---

### Task 6: 全部订单页面命名一致性

**Files:**
- Modify: `web-admin/src/views/order/AllOrdersView.vue:7,52,103`

- [ ] **Step 1: 将全部订单页面中"喂养订单"改为"上门服务订单"**

在 `AllOrdersView.vue` 中：

第 7 行，将：
```html
<el-option label="喂养订单" value="feeding" />
```
改为：
```html
<el-option label="上门服务订单" value="feeding" />
```

第 52 行，将：
```js
feeding: { pending: '待确认', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' },
```
保持不变（状态映射无需修改）。

第 103 行，将：
```js
const ORDER_TYPE_LABELS = { boarding: '寄养', mall: '商城', feeding: '服务', tuan: '团购', activity: '活动' }
```
改为：
```js
const ORDER_TYPE_LABELS = { boarding: '寄养', mall: '商城', feeding: '上门服务', tuan: '团购', activity: '活动' }
```

---

## Self-Review Checklist

### 1. Spec Coverage
| 需求 | 对应 Task |
|------|-----------|
| 上门服务菜单下增加订单入口 | Task 1 Step 1 |
| 订单管理菜单命名统一为"上门服务订单" | Task 1 Step 2 |
| 路由 meta.title 统一命名 | Task 3 Step 1 |
| 补充前端 API 调用 | Task 2 Step 1 |
| 添加订单详情路由 | Task 3 Step 1 |
| 列表页增加详情按钮 | Task 4 Step 1 |
| 创建订单详情页 | Task 5 Step 1 |
| 全部订单页面命名一致性 | Task 6 Step 1 |

### 2. Placeholder Scan
无 TBD / TODO / "implement later" / "add validation" 等占位符。

### 3. Type Consistency
- API 函数名 `getFeedingOrderDetail` 在 Task 2 定义、Task 5 使用，一致
- 路由路径 `/order/feeding/:id` 在 Task 3 定义、Task 4 按钮跳转使用，一致
- 状态映射 `FEEDING_STATUS` 在 Task 5 与现有 `FeedingOrderList.vue` 保持一致
- `handleFeedingOrder` 函数签名 `(orderId, operation)` 与现有 API 一致
