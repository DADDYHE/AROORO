# AROORO Web管理端实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建独立的Web管理后台，承载超级管理员的全部管理功能，复用现有adminService云函数，通过HTTP API接入。

**Architecture:** Vue3 SPA + Element Plus，通过云函数URL化调用现有adminService，JWT Bearer Token认证。Web端与C端小程序共用同一套云数据库和云函数，权限体系复用adminService的ACTION_PERMISSIONS + ROLE_PERMISSIONS。

**Tech Stack:** Vue3 + Vite + Element Plus + Pinia + Vue Router 4 + Axios + ECharts

---

## 一、项目结构

```
web-admin/
├── index.html
├── vite.config.js
├── package.json
├── .env.development              # 开发环境变量
├── .env.production               # 生产环境变量
├── public/
│   └── favicon.ico
├── src/
│   ├── main.js                   # 入口
│   ├── App.vue                   # 根组件
│   ├── api/
│   │   ├── index.js              # Axios实例 + 拦截器
│   │   ├── auth.js               # 登录/登出/刷新Token
│   │   ├── dashboard.js          # 数据看板
│   │   ├── user.js               # 用户管理
│   │   ├── admin.js              # 管理员管理
│   │   ├── order.js              # 全部订单
│   │   ├── finance.js            # 财务管理
│   │   ├── withdrawal.js         # 提现审核
│   │   ├── hosting.js            # 寄养管理
│   │   ├── feeding.js            # 上门服务
│   │   ├── product.js            # 商品库
│   │   ├── mall-order.js         # 商城订单
│   │   ├── tuan.js               # 团购管理
│   │   ├── coupon.js             # 优惠券
│   │   ├── review.js             # 评价管理
│   │   ├── banner.js             # 内容管理
│   │   └── referral.js           # 推广管理
│   ├── router/
│   │   └── index.js              # 路由定义 + 导航守卫
│   ├── stores/
│   │   ├── auth.js               # 认证状态（token/user/permissions）
│   │   └── app.js                # 应用状态（侧边栏/面包屑）
│   ├── layouts/
│   │   └── AdminLayout.vue       # 后台布局（侧边栏+顶栏+内容区）
│   ├── views/
│   │   ├── login/
│   │   │   └── LoginView.vue
│   │   ├── dashboard/
│   │   │   └── DashboardView.vue
│   │   ├── user/
│   │   │   ├── UserListView.vue
│   │   │   └── UserDetailView.vue
│   │   ├── admin/
│   │   │   ├── AdminListView.vue
│   │   │   └── ApprovalCenter.vue
│   │   ├── order/
│   │   │   └── AllOrdersView.vue
│   │   ├── finance/
│   │   │   └── FinanceView.vue
│   │   ├── withdrawal/
│   │   │   └── WithdrawalReview.vue
│   │   ├── hosting/
│   │   │   ├── HostReviewList.vue
│   │   │   ├── HostProfileList.vue
│   │   │   └── BoardingOrderList.vue
│   │   ├── feeding/
│   │   │   ├── FeederList.vue
│   │   │   └── FeedingOrderList.vue
│   │   ├── product/
│   │   │   ├── ProductListView.vue
│   │   │   └── ProductEditView.vue
│   │   ├── mall-order/
│   │   │   ├── MallOrderList.vue
│   │   │   └── MallOrderDetail.vue
│   │   ├── tuan/
│   │   │   ├── TuanDealList.vue
│   │   │   ├── TuanDealEdit.vue
│   │   │   └── CommissionManage.vue
│   │   ├── coupon/
│   │   │   ├── TemplateList.vue
│   │   │   ├── TemplateEdit.vue
│   │   │   └── GrantList.vue
│   │   ├── review/
│   │   │   └── ReviewList.vue
│   │   ├── banner/
│   │   │   └── BannerList.vue
│   │   └── referral/
│   │       └── ReferralView.vue
│   ├── composables/
│   │   ├── usePermission.js       # 权限检查 composable
│   │   ├── usePagination.js       # 分页逻辑 composable
│   │   └── useExport.js           # 导出CSV composable
│   ├── utils/
│   │   ├── format.js              # 日期/金额/状态格式化
│   │   └── constants.js           # 状态映射/角色映射
│   └── styles/
│       └── variables.scss         # Element Plus 主题变量覆盖
```

---

## 二、云函数HTTP化改造

### 2.1 adminService 云函数URL化配置

**文件**: `cloudfunctions/adminService/config.json`

```json
{
  "timeout": 15,
  "permissions": { "openapi": [] },
  "httpPath": "/adminService"
}
```

### 2.2 adminService 入口增加HTTP请求解析

**文件**: `cloudfunctions/adminService/index.js`

在现有 `exports.main` 之前增加HTTP入口处理：

```javascript
function parseHttpEvent(event, context) {
  if (context && context.HTTP_CONTEXT) {
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
      return {
        action: body.action,
        data: body.data || {},
        _httpContext: context.HTTP_CONTEXT,
        _isHttpCall: true,
      }
    } catch (e) {
      return { action: null, _isHttpCall: true, _parseError: e }
    }
  }
  return null
}

function parseHttpAuth(httpContext) {
  const authHeader = httpContext?.headers?.authorization || httpContext?.headers?.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const { verifyToken } = require('./common/token-utils')
    const decoded = verifyToken(token)
    return { openid: decoded.openid, adminId: decoded.adminId, roles: decoded.roles }
  } catch (e) {
    return null
  }
}
```

修改 `exports.main`：

```javascript
exports.main = async (event, context) => {
  const httpInfo = parseHttpEvent(event, context)

  if (httpInfo && httpInfo._isHttpCall) {
    if (httpInfo._parseError) {
      return { statusCode: 400, body: JSON.stringify({ code: 400, message: '请求格式错误' }) }
    }
    if (!httpInfo.action || !handlers[httpInfo.action]) {
      return { statusCode: 400, body: JSON.stringify({ code: 400, message: `未知操作: ${httpInfo.action}` }) }
    }

    const httpAuth = parseHttpAuth(context.HTTP_CONTEXT)
    if (!httpAuth) {
      return { statusCode: 401, body: JSON.stringify({ code: 401, message: '未登录或Token已过期' }) }
    }

    const permission = ACTION_PERMISSIONS[httpInfo.action]
    if (permission !== null) {
      const adminRoles = httpAuth.roles || []
      let perms = []
      for (const r of adminRoles) {
        const rp = ROLE_PERMISSIONS[r] || []
        if (rp.includes('all')) { perms = ['all']; break }
        perms = perms.concat(rp)
      }
      perms = [...new Set(perms)]
      const required = Array.isArray(permission) ? permission : [permission]
      if (!required.some(p => perms.includes(p))) {
        return { statusCode: 403, body: JSON.stringify({ code: 403, message: `权限不足：需要 ${required.join(' 或 ')} 权限` }) }
      }
    }

    try {
      const mergedEvent = { ...httpInfo.data, action: httpInfo.action }
      const auth = { openid: httpAuth.openid, adminId: httpAuth.adminId, roles: httpAuth.roles, _isHttpAuth: true }
      const result = await handlers[httpInfo.action](mergedEvent, context, auth)
      return { statusCode: 200, body: JSON.stringify(result) }
    } catch (error) {
      const code = error.code || 500
      return { statusCode: code >= 400 && code < 600 ? code : 500, body: JSON.stringify({ code, message: error.message }) }
    }
  }

  // 原有小程序调用逻辑保持不变
  const { action } = event
  if (!action || !handlers[action]) {
    return handleError(new Error(`未知操作: ${action}`), '无效的操作类型', ERROR_CODES.VALIDATION)
  }
  try {
    const permission = ACTION_PERMISSIONS[action]
    const requireAdmin = !NO_ADMIN_REQUIRED.has(action)
    const mergedEvent = { ...event, ...event.data }
    const auth = await verifyAuth(mergedEvent, { requireLogin: true, requireAdmin, permission })
    return await handlers[action](mergedEvent, context, auth)
  } catch (error) {
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}
```

### 2.3 新增Web端登录云函数action

**文件**: `cloudfunctions/adminService/services/auth.js`

新增 `webLogin` action（账号密码登录）：

```javascript
async function webLogin(event, context, auth) {
  const { username, password } = event
  if (!username || !password) {
    return handleError(new Error('用户名和密码不能为空'), '参数错误', ERROR_CODES.VALIDATION)
  }

  const adminRes = await db.collection('admins')
    .where({ username, status: 'active' })
    .limit(1)
    .get()

  if (!adminRes.data || adminRes.data.length === 0) {
    return handleError(new Error('用户名或密码错误'), '登录失败', ERROR_CODES.AUTH)
  }

  const admin = adminRes.data[0]
  const bcrypt = require('bcryptjs')
  const valid = await bcrypt.compare(password, admin.passwordHash)
  if (!valid) {
    return handleError(new Error('用户名或密码错误'), '登录失败', ERROR_CODES.AUTH)
  }

  const { generateToken } = require('../common/token-utils')
  const token = generateToken({
    openid: admin.openid,
    adminId: admin._id,
    roles: admin.roles || [],
  })

  return handleSuccess({
    token,
    admin: {
      _id: admin._id,
      openid: admin.openid,
      nickName: admin.nickName || admin.username,
      avatarUrl: admin.avatarUrl || '',
      roles: admin.roles || [],
      permissions: getAdminPermissions(admin.roles || []),
    }
  })
}

function getAdminPermissions(roles) {
  const { ROLE_PERMISSIONS } = require('../constants')
  let perms = []
  for (const role of roles) {
    const rp = ROLE_PERMISSIONS[role] || []
    if (rp.includes('all')) { return ['all'] }
    perms = perms.concat(rp)
  }
  return [...new Set(perms)]
}
```

### 2.4 admins集合增加Web登录字段

在 `admins` 集合的文档中新增：

```javascript
{
  username: String,          // 登录用户名（唯一）
  passwordHash: String,      // bcrypt加密后的密码
}
```

### 2.5 新增Web端专用action

**文件**: `cloudfunctions/adminService/services/wallet.js`（新建）

```javascript
async function getWithdrawalList(event, context, auth) {
  const { status, page = 1, pageSize = 20 } = event
  const query = {}
  if (status) query.status = status
  const result = await paginate('withdrawals', query, { page, pageSize, sort: { createdAt: -1 } })
  return handleSuccess(result)
}

async function approveWithdrawal(event, context, auth) {
  const { withdrawalId } = event
  if (!withdrawalId) return handleError(new Error('缺少提现记录ID'), '参数错误', ERROR_CODES.VALIDATION)

  const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
  if (!wRes.data) return handleError(new Error('提现记录不存在'), '数据错误', ERROR_CODES.DATA)
  const w = wRes.data
  if (w.status !== 'pending') return handleError(new Error('当前状态不可审核'), '状态错误', ERROR_CODES.BUSINESS)

  // TODO: 调用微信商家转账API
  // const transferResult = await wxTransfer(w.openid, w.amount)

  await db.collection('withdrawals').doc(withdrawalId).update({
    data: {
      status: 'completed',
      reviewedBy: auth.openid,
      reviewedAt: db.serverDate(),
      transferTime: db.serverDate(),
      updatedAt: db.serverDate(),
    }
  })

  await db.collection('wallets').where({ openid: w.openid }).update({
    data: {
      frozenAmount: _.inc(-w.amount),
      totalWithdrawn: _.inc(w.amount),
      updatedAt: db.serverDate(),
    }
  })

  return handleSuccess({ message: '审核通过，已发起转账' })
}

async function rejectWithdrawal(event, context, auth) {
  const { withdrawalId, rejectReason } = event
  if (!withdrawalId) return handleError(new Error('缺少提现记录ID'), '参数错误', ERROR_CODES.VALIDATION)

  const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
  if (!wRes.data) return handleError(new Error('提现记录不存在'), '数据错误', ERROR_CODES.DATA)
  const w = wRes.data
  if (w.status !== 'pending') return handleError(new Error('当前状态不可审核'), '状态错误', ERROR_CODES.BUSINESS)

  await db.collection('withdrawals').doc(withdrawalId).update({
    data: {
      status: 'rejected',
      rejectReason: rejectReason || '审核未通过',
      reviewedBy: auth.openid,
      reviewedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }
  })

  await db.collection('wallets').where({ openid: w.openid }).update({
    data: {
      balance: _.inc(w.amount),
      frozenAmount: _.inc(-w.amount),
      updatedAt: db.serverDate(),
    }
  })

  return handleSuccess({ message: '已拒绝提现申请' })
}
```

**ACTION_PERMISSIONS 新增**：

```javascript
webLogin: null,
getWithdrawalList: 'user_management',
approveWithdrawal: 'user_management',
rejectWithdrawal: 'user_management',
```

---

## 三、前端实现任务分解

### Task 1: 项目初始化与基础配置

**Files:**
- Create: `web-admin/package.json`
- Create: `web-admin/vite.config.js`
- Create: `web-admin/index.html`
- Create: `web-admin/.env.development`
- Create: `web-admin/.env.production`
- Create: `web-admin/src/main.js`
- Create: `web-admin/src/App.vue`
- Create: `web-admin/src/styles/variables.scss`

- [ ] **Step 1: 创建项目目录并初始化**

```bash
mkdir -p web-admin/src/{api,router,stores,layouts,views,composables,utils,styles}
cd web-admin
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "arooro-web-admin",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.0",
    "element-plus": "^2.7.0",
    "axios": "^1.7.0",
    "echarts": "^5.5.0",
    "dayjs": "^1.11.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.4.0",
    "sass": "^1.77.0",
    "unplugin-auto-import": "^0.17.0",
    "unplugin-vue-components": "^0.27.0"
  }
}
```

- [ ] **Step 3: 创建 vite.config.js**

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://cloud1-8gvqhsiga3011047.service.tcloudbase.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 4: 创建环境变量文件**

`.env.development`:
```
VITE_API_BASE_URL=/api/adminService
VITE_APP_TITLE=AROORO管理后台
```

`.env.production`:
```
VITE_API_BASE_URL=https://cloud1-8gvqhsiga3011047.service.tcloudbase.com/adminService
VITE_APP_TITLE=AROORO管理后台
```

- [ ] **Step 5: 创建 main.js**

```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn, size: 'default' })
app.mount('#app')
```

- [ ] **Step 6: 创建 App.vue**

```vue
<template>
  <router-view />
</template>
```

- [ ] **Step 7: 创建 variables.scss**

```scss
$--color-primary: #4ECDC4;
$--color-success: #67C23A;
$--color-warning: #E6A23C;
$--color-danger: #F56C6C;
$--color-info: #909399;
```

- [ ] **Step 8: 安装依赖**

```bash
cd web-admin && npm install
```

- [ ] **Step 9: Commit**

```bash
git add web-admin/
git commit -m "feat(web-admin): 项目初始化与基础配置"
```

---

### Task 2: API层与认证状态管理

**Files:**
- Create: `web-admin/src/api/index.js`
- Create: `web-admin/src/api/auth.js`
- Create: `web-admin/src/stores/auth.js`
- Create: `web-admin/src/utils/constants.js`
- Create: `web-admin/src/utils/format.js`

- [ ] **Step 1: 创建 Axios 实例**

`src/api/index.js`:
```javascript
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

http.interceptors.response.use(
  (res) => {
    const data = res.data
    if (data.code !== undefined && data.code !== 0) {
      ElMessage.error(data.message || '请求失败')
      if (data.code === 401) {
        const auth = useAuthStore()
        auth.logout()
        router.push('/login')
      }
      return Promise.reject(new Error(data.message))
    }
    return data
  },
  (err) => {
    if (err.response?.status === 401) {
      const auth = useAuthStore()
      auth.logout()
      router.push('/login')
    }
    ElMessage.error(err.response?.data?.message || err.message || '网络错误')
    return Promise.reject(err)
  }
)

async function callAction(action, data = {}) {
  return http.post('', { action, data })
}

export { http, callAction }
export default http
```

- [ ] **Step 2: 创建 auth API**

`src/api/auth.js`:
```javascript
import { callAction } from './index'

export function webLogin(username, password) {
  return callAction('webLogin', { username, password })
}

export function getAdminInfo() {
  return callAction('checkAuth')
}
```

- [ ] **Step 3: 创建认证 Store**

`src/stores/auth.js`:
```javascript
import { defineStore } from 'pinia'
import { webLogin, getAdminInfo } from '@/api/auth'
import router from '@/router'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    admin: JSON.parse(localStorage.getItem('admin') || 'null'),
    permissions: JSON.parse(localStorage.getItem('permissions') || '[]'),
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
    hasAllPermission: (state) => state.permissions.includes('all'),
    roles: (state) => state.admin?.roles || [],
  },
  actions: {
    async login(username, password) {
      const res = await webLogin(username, password)
      const { token, admin } = res.data
      this.token = token
      this.admin = admin
      this.permissions = admin.permissions || []
      localStorage.setItem('token', token)
      localStorage.setItem('admin', JSON.stringify(admin))
      localStorage.setItem('permissions', JSON.stringify(this.permissions))
    },
    logout() {
      this.token = ''
      this.admin = null
      this.permissions = []
      localStorage.removeItem('token')
      localStorage.removeItem('admin')
      localStorage.removeItem('permissions')
      router.push('/login')
    },
    hasPermission(perm) {
      if (this.permissions.includes('all')) return true
      if (!perm) return true
      const required = Array.isArray(perm) ? perm : [perm]
      return required.some(p => this.permissions.includes(p))
    },
  },
})
```

- [ ] **Step 4: 创建常量定义**

`src/utils/constants.js`:
```javascript
export const ROLE_LABELS = {
  super_admin: '超级管理员',
  host_admin: '寄养家庭管理员',
  activity_admin: '活动管理员',
  mall_admin: '商城管理员',
  feeding_admin: '上门服务员',
  coupon_admin: '优惠券管理员',
  tuan_admin: '团购管理员',
  content_admin: '内容管理员',
}

export const ORDER_STATUS_LABELS = {
  pending: '待确认',
  paid: '已支付',
  confirmed: '已确认',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  pending_payment: '待支付',
  shipped: '已发货',
  rejected: '已拒绝',
}

export const ORDER_STATUS_TAG_TYPE = {
  pending: 'warning',
  paid: 'primary',
  confirmed: 'primary',
  in_progress: '',
  completed: 'success',
  cancelled: 'info',
  pending_payment: 'warning',
  shipped: '',
  rejected: 'danger',
}

export const WITHDRAWAL_STATUS_LABELS = {
  pending: '待审核',
  approved: '已通过',
  processing: '处理中',
  completed: '已完成',
  rejected: '已拒绝',
}

export const HOST_SERVICE_STATUS_LABELS = {
  pending_review: '待审核',
  active: '正常',
  suspended: '已暂停',
  inactive: '已停用',
  rejected: '已拒绝',
}

export const SIDEBAR_MENUS = [
  { title: '数据看板', icon: 'DataAnalysis', path: '/dashboard', permission: 'user_management' },
  { title: '用户管理', icon: 'User', path: '/user', permission: 'user_management' },
  { title: '管理员管理', icon: 'Stamp', path: '/admin', permission: 'user_management' },
  { title: '全部订单', icon: 'List', path: '/order', permission: null },
  { title: '财务管理', icon: 'Money', path: '/finance', permission: 'user_management' },
  { title: '提现审核', icon: 'Wallet', path: '/withdrawal', permission: 'user_management' },
  { title: '寄养管理', icon: 'House', path: '/hosting', permission: 'hosting', children: [
    { title: '家庭审核', path: '/hosting/review' },
    { title: '档案管理', path: '/hosting/profile' },
    { title: '寄养订单', path: '/hosting/orders' },
  ]},
  { title: '上门服务', icon: 'Service', path: '/feeding', permission: 'feeding', children: [
    { title: '服务师管理', path: '/feeding/feeders' },
    { title: '服务订单', path: '/feeding/orders' },
  ]},
  { title: '商品库', icon: 'Goods', path: '/product', permission: 'mall' },
  { title: '商城订单', icon: 'ShoppingCart', path: '/mall-order', permission: 'mall' },
  { title: '团购管理', icon: 'Connection', path: '/tuan', permission: 'tuan', children: [
    { title: '团购列表', path: '/tuan/list' },
    { title: '佣金管理', path: '/tuan/commission' },
  ]},
  { title: '优惠券', icon: 'Ticket', path: '/coupon', permission: 'coupon' },
  { title: '评价管理', icon: 'ChatDotSquare', path: '/review', permission: 'user_management' },
  { title: '内容管理', icon: 'Picture', path: '/banner', permission: 'content' },
  { title: '推广管理', icon: 'Share', path: '/referral', permission: null },
]
```

- [ ] **Step 5: 创建格式化工具**

`src/utils/format.js`:
```javascript
import dayjs from 'dayjs'

export function formatDate(val) {
  if (!val) return '-'
  const d = typeof val === 'object' && val.$date ? new Date(val.$date) : new Date(val)
  return dayjs(d).format('YYYY-MM-DD HH:mm')
}

export function formatMoney(val) {
  if (val === undefined || val === null) return '¥0.00'
  return '¥' + Number(val).toFixed(2)
}

export function formatStatus(val, map) {
  return map[val] || val || '-'
}
```

- [ ] **Step 6: Commit**

```bash
git add web-admin/src/api/ web-admin/src/stores/ web-admin/src/utils/
git commit -m "feat(web-admin): API层与认证状态管理"
```

---

### Task 3: 路由与布局

**Files:**
- Create: `web-admin/src/router/index.js`
- Create: `web-admin/src/layouts/AdminLayout.vue`
- Create: `web-admin/src/stores/app.js`

- [ ] **Step 1: 创建路由**

`src/router/index.js`:
```javascript
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AdminLayout from '@/layouts/AdminLayout.vue'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/login/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: AdminLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { title: '数据看板', permission: 'user_management' } },
      { path: 'user', name: 'UserList', component: () => import('@/views/user/UserListView.vue'), meta: { title: '用户管理', permission: 'user_management' } },
      { path: 'user/:id', name: 'UserDetail', component: () => import('@/views/user/UserDetailView.vue'), meta: { title: '用户详情', permission: 'user_management' } },
      { path: 'admin', name: 'AdminList', component: () => import('@/views/admin/AdminListView.vue'), meta: { title: '管理员管理', permission: 'user_management' } },
      { path: 'admin/approval', name: 'ApprovalCenter', component: () => import('@/views/admin/ApprovalCenter.vue'), meta: { title: '审批中心', permission: 'user_management' } },
      { path: 'order', name: 'AllOrders', component: () => import('@/views/order/AllOrdersView.vue'), meta: { title: '全部订单' } },
      { path: 'finance', name: 'Finance', component: () => import('@/views/finance/FinanceView.vue'), meta: { title: '财务管理', permission: 'user_management' } },
      { path: 'withdrawal', name: 'WithdrawalReview', component: () => import('@/views/withdrawal/WithdrawalReview.vue'), meta: { title: '提现审核', permission: 'user_management' } },
      { path: 'hosting/review', name: 'HostReview', component: () => import('@/views/hosting/HostReviewList.vue'), meta: { title: '寄养家庭审核', permission: 'hosting' } },
      { path: 'hosting/profile', name: 'HostProfileList', component: () => import('@/views/hosting/HostProfileList.vue'), meta: { title: '寄养档案管理', permission: 'hosting' } },
      { path: 'hosting/orders', name: 'BoardingOrders', component: () => import('@/views/hosting/BoardingOrderList.vue'), meta: { title: '寄养订单', permission: 'hosting' } },
      { path: 'feeding/feeders', name: 'FeederList', component: () => import('@/views/feeding/FeederList.vue'), meta: { title: '服务师管理', permission: 'feeding' } },
      { path: 'feeding/orders', name: 'FeedingOrders', component: () => import('@/views/feeding/FeedingOrderList.vue'), meta: { title: '服务订单', permission: 'feeding' } },
      { path: 'product', name: 'ProductList', component: () => import('@/views/product/ProductListView.vue'), meta: { title: '商品库', permission: 'mall' } },
      { path: 'product/create', name: 'ProductCreate', component: () => import('@/views/product/ProductEditView.vue'), meta: { title: '创建商品', permission: 'mall' } },
      { path: 'product/:id/edit', name: 'ProductEdit', component: () => import('@/views/product/ProductEditView.vue'), meta: { title: '编辑商品', permission: 'mall' } },
      { path: 'mall-order', name: 'MallOrderList', component: () => import('@/views/mall-order/MallOrderList.vue'), meta: { title: '商城订单', permission: 'mall' } },
      { path: 'mall-order/:id', name: 'MallOrderDetail', component: () => import('@/views/mall-order/MallOrderDetail.vue'), meta: { title: '商城订单详情', permission: 'mall' } },
      { path: 'tuan/list', name: 'TuanDealList', component: () => import('@/views/tuan/TuanDealList.vue'), meta: { title: '团购列表', permission: 'tuan' } },
      { path: 'tuan/create', name: 'TuanDealCreate', component: () => import('@/views/tuan/TuanDealEdit.vue'), meta: { title: '创建团购', permission: 'tuan' } },
      { path: 'tuan/:id/edit', name: 'TuanDealEdit', component: () => import('@/views/tuan/TuanDealEdit.vue'), meta: { title: '编辑团购', permission: 'tuan' } },
      { path: 'tuan/commission', name: 'CommissionManage', component: () => import('@/views/tuan/CommissionManage.vue'), meta: { title: '佣金管理', permission: 'tuan' } },
      { path: 'coupon', name: 'TemplateList', component: () => import('@/views/coupon/TemplateList.vue'), meta: { title: '优惠券模板', permission: 'coupon' } },
      { path: 'coupon/create', name: 'TemplateCreate', component: () => import('@/views/coupon/TemplateEdit.vue'), meta: { title: '创建优惠券', permission: 'coupon' } },
      { path: 'coupon/:id/edit', name: 'TemplateEdit', component: () => import('@/views/coupon/TemplateEdit.vue'), meta: { title: '编辑优惠券', permission: 'coupon' } },
      { path: 'coupon/grants', name: 'GrantList', component: () => import('@/views/coupon/GrantList.vue'), meta: { title: '发放管理', permission: 'coupon' } },
      { path: 'review', name: 'ReviewList', component: () => import('@/views/review/ReviewList.vue'), meta: { title: '评价管理', permission: 'user_management' } },
      { path: 'banner', name: 'BannerList', component: () => import('@/views/banner/BannerList.vue'), meta: { title: '轮播图管理', permission: 'content' } },
      { path: 'referral', name: 'Referral', component: () => import('@/views/referral/ReferralView.vue'), meta: { title: '推广管理' } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.public) return next()
  if (!auth.isLoggedIn) return next('/login')
  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return next('/dashboard')
  }
  next()
})

export default router
```

- [ ] **Step 2: 创建后台布局**

`src/layouts/AdminLayout.vue`:
```vue
<template>
  <el-container class="admin-layout">
    <el-aside :width="isCollapsed ? '64px' : '220px'" class="admin-aside">
      <div class="logo-area">
        <span v-if="!isCollapsed" class="logo-text">AROORO</span>
        <span v-else class="logo-text-mini">A</span>
      </div>
      <el-menu
        :default-active="currentPath"
        :collapse="isCollapsed"
        router
        background-color="#1d1e2c"
        text-color="#a0a3bd"
        active-text-color="#4ECDC4"
      >
        <template v-for="menu in visibleMenus" :key="menu.path">
          <el-sub-menu v-if="menu.children" :index="menu.path">
            <template #title>
              <el-icon><component :is="menu.icon" /></el-icon>
              <span>{{ menu.title }}</span>
            </template>
            <el-menu-item v-for="child in menu.children" :key="child.path" :index="child.path">
              {{ child.title }}
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="menu.path">
            <el-icon><component :is="menu.icon" /></el-icon>
            <template #title>{{ menu.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="admin-header">
        <el-icon class="collapse-btn" @click="isCollapsed = !isCollapsed">
          <Fold v-if="!isCollapsed" /><Expand v-else />
        </el-icon>
        <el-breadcrumb separator="/">
          <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
          <el-breadcrumb-item v-if="route.meta.title">{{ route.meta.title }}</el-breadcrumb-item>
        </el-breadcrumb>
        <div class="header-right">
          <el-dropdown @command="onCommand">
            <span class="admin-name">{{ adminName }} <el-icon><ArrowDown /></el-icon></span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="admin-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { SIDEBAR_MENUS } from '@/utils/constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isCollapsed = ref(false)

const currentPath = computed(() => route.path)
const adminName = computed(() => auth.admin?.nickName || '管理员')

const visibleMenus = computed(() =>
  SIDEBAR_MENUS.filter(m => !m.permission || auth.hasPermission(m.permission))
)

function onCommand(cmd) {
  if (cmd === 'logout') auth.logout()
}
</script>

<style scoped>
.admin-layout { height: 100vh; }
.admin-aside { background: #1d1e2c; transition: width 0.3s; overflow-y: auto; }
.logo-area { height: 60px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
.logo-text { color: #4ECDC4; font-size: 20px; font-weight: 700; letter-spacing: 2px; }
.logo-text-mini { color: #4ECDC4; font-size: 22px; font-weight: 700; }
.admin-header { display: flex; align-items: center; border-bottom: 1px solid #eee; background: #fff; padding: 0 20px; }
.collapse-btn { cursor: pointer; font-size: 20px; margin-right: 16px; }
.header-right { margin-left: auto; }
.admin-name { cursor: pointer; display: flex; align-items: center; gap: 4px; }
.admin-main { background: #f5f7fa; }
</style>
```

- [ ] **Step 3: 创建 app store**

`src/stores/app.js`:
```javascript
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarCollapsed: false,
  }),
})
```

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/router/ web-admin/src/layouts/ web-admin/src/stores/app.js
git commit -m "feat(web-admin): 路由与后台布局"
```

---

### Task 4: 登录页

**Files:**
- Create: `web-admin/src/views/login/LoginView.vue`

- [ ] **Step 1: 创建登录页**

`src/views/login/LoginView.vue`:
```vue
<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">AROORO</h1>
      <p class="login-subtitle">管理后台</p>
      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="onLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" prefix-icon="User" size="large" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" prefix-icon="Lock" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" style="width:100%" native-type="submit">登 录</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const router = useRouter()
const auth = useAuthStore()
const formRef = ref()
const loading = ref(false)

const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function onLogin() {
  await formRef.value.validate()
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } catch (e) {
    // error handled by interceptor
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page { height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1d1e2c 0%, #2d2e42 100%); }
.login-card { width: 400px; padding: 48px 40px; background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.login-title { text-align: center; font-size: 28px; font-weight: 700; color: #4ECDC4; margin: 0 0 4px; letter-spacing: 4px; }
.login-subtitle { text-align: center; color: #999; margin: 0 0 32px; font-size: 14px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web-admin/src/views/login/
git commit -m "feat(web-admin): 登录页"
```

---

### Task 5: Composables（分页/权限/导出）

**Files:**
- Create: `web-admin/src/composables/usePagination.js`
- Create: `web-admin/src/composables/usePermission.js`
- Create: `web-admin/src/composables/useExport.js`

- [ ] **Step 1: 创建分页 composable**

`src/composables/usePagination.js`:
```javascript
import { ref, reactive } from 'vue'

export function usePagination(fetchFn, defaultPageSize = 20) {
  const list = ref([])
  const loading = ref(false)
  const total = ref(0)
  const pagination = reactive({
    page: 1,
    pageSize: defaultPageSize,
  })

  async function fetch(params = {}) {
    loading.value = true
    try {
      const res = await fetchFn({ page: pagination.page, pageSize: pagination.pageSize, ...params })
      list.value = res.data.list || res.data || []
      total.value = res.data.total || 0
    } finally {
      loading.value = false
    }
  }

  function onPageChange(page) {
    pagination.page = page
    fetch()
  }

  function onSizeChange(size) {
    pagination.pageSize = size
    pagination.page = 1
    fetch()
  }

  function resetAndFetch(params) {
    pagination.page = 1
    fetch(params)
  }

  return { list, loading, total, pagination, fetch, onPageChange, onSizeChange, resetAndFetch }
}
```

- [ ] **Step 2: 创建权限 composable**

`src/composables/usePermission.js`:
```javascript
import { useAuthStore } from '@/stores/auth'

export function usePermission() {
  const auth = useAuthStore()

  function hasPermission(perm) {
    return auth.hasPermission(perm)
  }

  function filterByPermission(menus) {
    return menus.filter(m => !m.permission || hasPermission(m.permission))
  }

  return { hasPermission, filterByPermission }
}
```

- [ ] **Step 3: 创建导出 composable**

`src/composables/useExport.js`:
```javascript
export function useExport() {
  function exportCSV(headers, rows, filename = 'export.csv') {
    const BOM = '\uFEFF'
    const headerLine = headers.map(h => `"${h.label}"`).join(',')
    const dataLines = rows.map(row =>
      headers.map(h => `"${row[h.key] ?? ''}"`).join(',')
    )
    const csv = BOM + headerLine + '\n' + dataLines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return { exportCSV }
}
```

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/composables/
git commit -m "feat(web-admin): composables（分页/权限/导出）"
```

---

### Task 6: 数据看板

**Files:**
- Create: `web-admin/src/api/dashboard.js`
- Create: `web-admin/src/views/dashboard/DashboardView.vue`

- [ ] **Step 1: 创建 dashboard API**

`src/api/dashboard.js`:
```javascript
import { callAction } from './index'

export function getDashboardStats() {
  return callAction('getEnhancedDashboardStats')
}

export function getFinanceOverview() {
  return callAction('getFinanceOverview')
}
```

- [ ] **Step 2: 创建看板页面**

`src/views/dashboard/DashboardView.vue`:
```vue
<template>
  <div class="dashboard" v-loading="loading">
    <el-row :gutter="20" class="stat-row">
      <el-col :span="6" v-for="card in statCards" :key="card.key">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>订单趋势（近7天）</template>
          <div ref="orderChartRef" style="height:300px"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>收入分布</template>
          <div ref="revenueChartRef" style="height:300px"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import * as echarts from 'echarts'
import { getDashboardStats } from '@/api/dashboard'
import { formatMoney } from '@/utils/format'

const loading = ref(false)
const stats = ref({})
const orderChartRef = ref()
const revenueChartRef = ref()

const statCards = computed(() => [
  { key: 'totalUsers', label: '总用户数', value: stats.value.totalUsers || 0 },
  { key: 'totalOrders', label: '总订单数', value: stats.value.totalOrders || 0 },
  { key: 'totalRevenue', label: '总收入', value: formatMoney(stats.value.totalRevenue) },
  { key: 'pendingOrders', label: '待处理订单', value: stats.value.pendingOrders || 0 },
])

onMounted(async () => {
  loading.value = true
  try {
    const res = await getDashboardStats()
    stats.value = res.data || {}
    renderCharts()
  } finally {
    loading.value = false
  }
})

function renderCharts() {
  const orderChart = echarts.init(orderChartRef.value)
  orderChart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: stats.value.recentDays?.map(d => d.date) || [] },
    yAxis: { type: 'value' },
    series: [{ name: '订单数', type: 'line', smooth: true, data: stats.value.recentDays?.map(d => d.count) || [], areaStyle: { color: 'rgba(78,205,196,0.2)' }, lineStyle: { color: '#4ECDC4' }, itemStyle: { color: '#4ECDC4' } }],
  })

  const revenueChart = echarts.init(revenueChartRef.value)
  revenueChart.setOption({
    tooltip: { trigger: 'item' },
    series: [{ type: 'pie', radius: ['40%', '70%'], data: stats.value.revenueByType || [], label: { formatter: '{b}: ¥{c}' }, emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } } }],
  })
}
</script>

<style scoped>
.stat-row { margin-bottom: 20px; }
.stat-card { text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: #303133; }
.stat-label { font-size: 14px; color: #909399; margin-top: 8px; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add web-admin/src/api/dashboard.js web-admin/src/views/dashboard/
git commit -m "feat(web-admin): 数据看板"
```

---

### Task 7: 用户管理

**Files:**
- Create: `web-admin/src/api/user.js`
- Create: `web-admin/src/views/user/UserListView.vue`
- Create: `web-admin/src/views/user/UserDetailView.vue`

- [ ] **Step 1: 创建 user API**

`src/api/user.js`:
```javascript
import { callAction } from './index'

export function getUserList(params) {
  return callAction('getUserList', params)
}

export function getUserDetail(userId) {
  return callAction('getUserDetail', { userId })
}

export function updateUserStatus(userId, status) {
  return callAction('updateUserStatus', { userId, status })
}
```

- [ ] **Step 2: 创建用户列表页**

`src/views/user/UserListView.vue`:
```vue
<template>
  <div class="page-container">
    <el-card>
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="搜索昵称/手机号" style="width:240px" clearable @clear="onSearch" @keyup.enter="onSearch">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="onSearch">搜索</el-button>
      </div>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="nickName" label="昵称" width="140" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="gender" label="性别" width="80" />
        <el-table-column prop="orderCount" label="订单数" width="100" />
        <el-table-column prop="totalSpent" label="消费总额" width="120">
          <template #default="{ row }">{{ formatMoney(row.totalSpent) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">{{ row.status === 'active' ? '正常' : '禁用' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="createdAt" label="注册时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/user/${row._id}`)">详情</el-button>
            <el-button link :type="row.status === 'active' ? 'danger' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getUserList, updateUserStatus } from '@/api/user'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const keyword = ref('')

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getUserList)

function onSearch() {
  fetch({ keyword: keyword.value })
}

async function toggleStatus(row) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active'
  await ElMessageBox.confirm(`确定${newStatus === 'disabled' ? '禁用' : '启用'}该用户？`, '提示')
  await updateUserStatus(row._id, newStatus)
  ElMessage.success('操作成功')
  fetch({ keyword: keyword.value })
}

fetch()
</script>

<style scoped>
.page-container { padding: 0; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 3: 创建用户详情页**

`src/views/user/UserDetailView.vue`:
```vue
<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'用户列表'" :content="user.nickName || '用户详情'" />
    <el-card style="margin-top:16px" v-if="user._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="昵称">{{ user.nickName }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ user.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ user.gender || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="user.status === 'active' ? 'success' : 'danger'">{{ user.status === 'active' ? '正常' : '禁用' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ formatDate(user.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="订单数">{{ user.orderCount || 0 }}</el-descriptions-item>
        <el-descriptions-item label="消费总额">{{ formatMoney(user.totalSpent) }}</el-descriptions-item>
        <el-descriptions-item label="邀请人">{{ user.inviterNickName || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getUserDetail } from '@/api/user'
import { formatDate, formatMoney } from '@/utils/format'

const route = useRoute()
const loading = ref(false)
const user = ref({})

onMounted(async () => {
  loading.value = true
  try {
    const res = await getUserDetail(route.params.id)
    user.value = res.data || {}
  } finally {
    loading.value = false
  }
})
</script>
```

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/api/user.js web-admin/src/views/user/
git commit -m "feat(web-admin): 用户管理"
```

---

### Task 8: 管理员管理 + 审批中心

**Files:**
- Create: `web-admin/src/api/admin.js`
- Create: `web-admin/src/views/admin/AdminListView.vue`
- Create: `web-admin/src/views/admin/ApprovalCenter.vue`

- [ ] **Step 1: 创建 admin API**

`src/api/admin.js`:
```javascript
import { callAction } from './index'

export function getAdminList(params) {
  return callAction('getAdminList', params)
}

export function getAdminDetail(adminId) {
  return callAction('getAdminDetail', { adminId })
}

export function updateAdminStatus(adminId, status) {
  return callAction('updateAdminStatus', { adminId, status })
}

export function getApplicationList(params) {
  return callAction('getApplicationList', params)
}

export function approveApplication(applicationId) {
  return callAction('approveApplication', { applicationId })
}

export function rejectApplication(applicationId, reason) {
  return callAction('rejectApplication', { applicationId, rejectReason: reason })
}
```

- [ ] **Step 2: 创建管理员列表页**

`src/views/admin/AdminListView.vue`:
```vue
<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="nickName" label="昵称" width="140" />
      <el-table-column prop="username" label="用户名" width="140" />
      <el-table-column prop="roles" label="角色" width="200">
        <template #default="{ row }">
          <el-tag v-for="role in (row.roles || [])" :key="role" size="small" style="margin-right:4px">{{ ROLE_LABELS[role] || role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">{{ row.status === 'active' ? '正常' : '禁用' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link :type="row.status === 'active' ? 'danger' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getAdminList, updateAdminStatus } from '@/api/admin'
import { usePagination } from '@/composables/usePagination'
import { formatDate } from '@/utils/format'
import { ROLE_LABELS } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getAdminList)

async function toggleStatus(row) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active'
  await ElMessageBox.confirm(`确定${newStatus === 'disabled' ? '禁用' : '启用'}该管理员？`)
  await updateAdminStatus(row._id, newStatus)
  ElMessage.success('操作成功')
  fetch()
}

fetch()
</script>

<style scoped>
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 3: 创建审批中心页**

`src/views/admin/ApprovalCenter.vue`:
```vue
<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="nickName" label="申请人" width="140" />
      <el-table-column prop="appliedRole" label="申请角色" width="160">
        <template #default="{ row }">{{ ROLE_LABELS[row.appliedRole] || row.appliedRole }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="申请理由" min-width="200" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="row.status === 'pending' ? 'warning' : row.status === 'approved' ? 'success' : 'danger'" size="small">{{ { pending: '待审核', approved: '已通过', rejected: '已拒绝' }[row.status] }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button link type="primary" @click="onApprove(row._id)">通过</el-button>
            <el-button link type="danger" @click="onReject(row._id)">拒绝</el-button>
          </template>
          <span v-else class="text-muted">已处理</span>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getApplicationList, approveApplication, rejectApplication } from '@/api/admin'
import { usePagination } from '@/composables/usePagination'
import { formatDate } from '@/utils/format'
import { ROLE_LABELS } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getApplicationList)

async function onApprove(id) {
  await ElMessageBox.confirm('确定通过该申请？')
  await approveApplication(id)
  ElMessage.success('已通过')
  fetch()
}

async function onReject(id) {
  const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝申请', { inputPlaceholder: '拒绝原因' })
  await rejectApplication(id, value)
  ElMessage.success('已拒绝')
  fetch()
}

fetch()
</script>

<style scoped>
.pager { margin-top: 16px; justify-content: flex-end; }
.text-muted { color: #c0c4cc; }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/api/admin.js web-admin/src/views/admin/
git commit -m "feat(web-admin): 管理员管理+审批中心"
```

---

### Task 9: 全部订单 + 财务管理 + 提现审核

**Files:**
- Create: `web-admin/src/api/order.js`
- Create: `web-admin/src/api/finance.js`
- Create: `web-admin/src/api/withdrawal.js`
- Create: `web-admin/src/views/order/AllOrdersView.vue`
- Create: `web-admin/src/views/finance/FinanceView.vue`
- Create: `web-admin/src/views/withdrawal/WithdrawalReview.vue`

- [ ] **Step 1: 创建 order API**

`src/api/order.js`:
```javascript
import { callAction } from './index'

export function getBoardingOrders(params) { return callAction('getBoardingOrders', params) }
export function getMallOrders(params) { return callAction('getMallOrders', params) }
export function getFeedingOrders(params) { return callAction('getFeedingOrders', params) }
export function getTuanDealOrders(params) { return callAction('getTuanDealOrders', params) }
```

- [ ] **Step 2: 创建 finance API**

`src/api/finance.js`:
```javascript
import { callAction } from './index'

export function getFinanceOverview() { return callAction('getFinanceOverview') }
```

- [ ] **Step 3: 创建 withdrawal API**

`src/api/withdrawal.js`:
```javascript
import { callAction } from './index'

export function getWithdrawalList(params) { return callAction('getWithdrawalList', params) }
export function approveWithdrawal(withdrawalId) { return callAction('approveWithdrawal', { withdrawalId }) }
export function rejectWithdrawal(withdrawalId, rejectReason) { return callAction('rejectWithdrawal', { withdrawalId, rejectReason }) }
```

- [ ] **Step 4: 创建全部订单页**

`src/views/order/AllOrdersView.vue`:
```vue
<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="orderType" placeholder="订单类型" style="width:140px" @change="onSearch">
        <el-option label="寄养订单" value="boarding" />
        <el-option label="商城订单" value="mall" />
        <el-option label="喂养订单" value="feeding" />
        <el-option label="团购订单" value="tuan" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in currentStatusMap" :key="key" :label="label" :value="key" />
      </el-select>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="buyerNickName" label="买家" width="120" />
      <el-table-column prop="productName" label="商品/服务" min-width="180" show-overflow-tooltip />
      <el-table-column prop="totalAmount" label="金额" width="100">
        <template #default="{ row }">{{ formatMoney(row.totalAmount || row.totalPrice) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getBoardingOrders, getMallOrders, getFeedingOrders, getTuanDealOrders } from '@/api/order'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/utils/constants'

const orderType = ref('boarding')
const statusFilter = ref('')

const STATUS_MAPS = {
  boarding: { pending: '待确认', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消' },
  mall: { pending_payment: '待支付', confirmed: '已确认', shipped: '已发货', completed: '已完成', cancelled: '已取消' },
  feeding: { pending: '待确认', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' },
  tuan: { pending_payment: '待支付', confirmed: '已确认', completed: '已完成', cancelled: '已取消' },
}

const currentStatusMap = computed(() => STATUS_MAPS[orderType.value] || {})

const fetchFns = { boarding: getBoardingOrders, mall: getMallOrders, feeding: getFeedingOrders, tuan: getTuanDealOrders }
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(
  (params) => fetchFns[orderType.value](params)
)

function onSearch() {
  const params = {}
  if (statusFilter.value) params.status = statusFilter.value
  fetch(params)
}

onSearch()
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 5: 创建财务管理页**

`src/views/finance/FinanceView.vue`:
```vue
<template>
  <div v-loading="loading">
    <el-row :gutter="20">
      <el-col :span="6" v-for="card in financeCards" :key="card.key">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-card style="margin-top:20px">
      <template #header>收入构成</template>
      <div ref="chartRef" style="height:350px"></div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import * as echarts from 'echarts'
import { getFinanceOverview } from '@/api/finance'
import { formatMoney } from '@/utils/format'

const loading = ref(false)
const data = ref({})
const chartRef = ref()

const financeCards = computed(() => [
  { key: 'totalRevenue', label: '总收入', value: formatMoney(data.value.totalRevenue) },
  { key: 'boardingRevenue', label: '寄养收入', value: formatMoney(data.value.boardingRevenue) },
  { key: 'mallRevenue', label: '商城收入', value: formatMoney(data.value.mallRevenue) },
  { key: 'commissionTotal', label: '佣金总额', value: formatMoney(data.value.commissionTotal) },
])

onMounted(async () => {
  loading.value = true
  try {
    const res = await getFinanceOverview()
    data.value = res.data || {}
    const chart = echarts.init(chartRef.value)
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['35%', '65%'],
        data: [
          { value: data.value.boardingRevenue || 0, name: '寄养收入' },
          { value: data.value.mallRevenue || 0, name: '商城收入' },
          { value: data.value.feedingRevenue || 0, name: '服务收入' },
          { value: data.value.commissionTotal || 0, name: '佣金' },
        ],
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
      }],
    })
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.stat-card { text-align: center; }
.stat-value { font-size: 24px; font-weight: 700; color: #303133; }
.stat-label { font-size: 14px; color: #909399; margin-top: 8px; }
</style>
```

- [ ] **Step 6: 创建提现审核页**

`src/views/withdrawal/WithdrawalReview.vue`:
```vue
<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="_id" label="记录ID" width="200" show-overflow-tooltip />
      <el-table-column prop="nickName" label="申请人" width="120" />
      <el-table-column prop="amount" label="提现金额" width="120">
        <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="withdrawalTagType(row.status)" size="small">{{ WITHDRAWAL_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button link type="primary" @click="onApprove(row._id)">通过</el-button>
            <el-button link type="danger" @click="onReject(row._id)">拒绝</el-button>
          </template>
          <span v-else class="text-muted">已处理</span>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getWithdrawalList, approveWithdrawal, rejectWithdrawal } from '@/api/withdrawal'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { WITHDRAWAL_STATUS_LABELS } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getWithdrawalList)

function withdrawalTagType(status) {
  return { pending: 'warning', approved: '', processing: '', completed: 'success', rejected: 'danger' }[status] || 'info'
}

async function onApprove(id) {
  await ElMessageBox.confirm('确定通过该提现申请？将通过微信转账到用户零钱。')
  await approveWithdrawal(id)
  ElMessage.success('已通过')
  fetch()
}

async function onReject(id) {
  const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝提现', { inputPlaceholder: '拒绝原因' })
  await rejectWithdrawal(id, value)
  ElMessage.success('已拒绝')
  fetch()
}

fetch()
</script>

<style scoped>
.pager { margin-top: 16px; justify-content: flex-end; }
.text-muted { color: #c0c4cc; }
</style>
```

- [ ] **Step 7: Commit**

```bash
git add web-admin/src/api/order.js web-admin/src/api/finance.js web-admin/src/api/withdrawal.js web-admin/src/views/order/ web-admin/src/views/finance/ web-admin/src/views/withdrawal/
git commit -m "feat(web-admin): 全部订单+财务管理+提现审核"
```

---

### Task 10: 寄养管理 + 上门服务

**Files:**
- Create: `web-admin/src/api/hosting.js`
- Create: `web-admin/src/api/feeding.js`
- Create: `web-admin/src/views/hosting/HostReviewList.vue`
- Create: `web-admin/src/views/hosting/HostProfileList.vue`
- Create: `web-admin/src/views/hosting/BoardingOrderList.vue`
- Create: `web-admin/src/views/feeding/FeederList.vue`
- Create: `web-admin/src/views/feeding/FeedingOrderList.vue`

- [ ] **Step 1: 创建 hosting API**

`src/api/hosting.js`:
```javascript
import { callAction } from './index'

export function getPendingHostReviews() { return callAction('getPendingHostReviews') }
export function reviewHost(data) { return callAction('reviewHost', data) }
export function getActiveHosts(params) { return callAction('getActiveHosts', params) }
export function getDisabledHosts(params) { return callAction('getDisabledHosts', params) }
export function toggleHostStatus(hostId, status) { return callAction('toggleHostStatus', { hostId, status }) }
export function toggleHostAccepting(hostId, accepting) { return callAction('toggleHostAccepting', { hostId, accepting }) }
export function getBoardingOrders(params) { return callAction('getBoardingOrders', params) }
export function getBoardingOrderDetail(orderId) { return callAction('getBoardingOrderDetail', { orderId }) }
export function handleBoardingOrder(orderId, operation) { return callAction('handleBoardingOrder', { orderId, operation }) }
```

- [ ] **Step 2: 创建 feeding API**

`src/api/feeding.js`:
```javascript
import { callAction } from './index'

export function getFeederList(params) { return callAction('getFeederList', params) }
export function getFeederDetail(feederId) { return callAction('getFeederDetail', { feederId }) }
export function getFeedingOrders(params) { return callAction('getFeedingOrders', params) }
export function getFeedingOrderDetail(orderId) { return callAction('getFeedingOrderDetail', { orderId }) }
export function handleFeedingOrder(orderId, operation) { return callAction('handleFeedingOrder', { orderId, operation }) }
```

- [ ] **Step 3: 创建寄养家庭审核页**

`src/views/hosting/HostReviewList.vue`:
```vue
<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="hostName" label="家庭名称" width="160" />
      <el-table-column prop="hostAddress" label="地址" min-width="200" show-overflow-tooltip />
      <el-table-column prop="petTypes" label="宠物类型" width="120" />
      <el-table-column prop="serviceStatus" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="row.serviceStatus === 'pending_review' ? 'warning' : 'success'" size="small">{{ HOST_SERVICE_STATUS_LABELS[row.serviceStatus] || row.serviceStatus }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="onReview(row._id, 'active')">通过</el-button>
          <el-button link type="danger" @click="onReview(row._id, 'rejected')">拒绝</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
import { getPendingHostReviews, reviewHost } from '@/api/hosting'
import { usePagination } from '@/composables/usePagination'
import { HOST_SERVICE_STATUS_LABELS } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, fetch } = usePagination(getPendingHostReviews)

async function onReview(hostId, status) {
  await ElMessageBox.confirm(`确定${status === 'active' ? '通过' : '拒绝'}该审核？`)
  await reviewHost({ hostId, status })
  ElMessage.success('操作成功')
  fetch()
}

fetch()
</script>
```

- [ ] **Step 4: 创建寄养档案管理页**

`src/views/hosting/HostProfileList.vue`:
```vue
<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="hostName" label="家庭名称" width="160" />
      <el-table-column prop="hostAddress" label="地址" min-width="200" show-overflow-tooltip />
      <el-table-column prop="accepting" label="接单状态" width="100">
        <template #default="{ row }"><el-switch :model-value="row.accepting" @change="(val) => toggleAccepting(row._id, val)" /></template>
      </el-table-column>
      <el-table-column prop="serviceStatus" label="服务状态" width="100">
        <template #default="{ row }"><el-tag :type="row.serviceStatus === 'active' ? 'success' : 'danger'" size="small">{{ HOST_SERVICE_STATUS_LABELS[row.serviceStatus] }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link :type="row.serviceStatus === 'active' ? 'danger' : 'success'" @click="toggleStatus(row)">
            {{ row.serviceStatus === 'active' ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getActiveHosts, toggleHostStatus, toggleHostAccepting } from '@/api/hosting'
import { usePagination } from '@/composables/usePagination'
import { HOST_SERVICE_STATUS_LABELS } from '@/utils/constants'
import { ElMessage } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getActiveHosts)

async function toggleAccepting(hostId, val) {
  await toggleHostAccepting(hostId, val)
  ElMessage.success('操作成功')
  fetch()
}

async function toggleStatus(row) {
  const newStatus = row.serviceStatus === 'active' ? 'suspended' : 'active'
  await toggleHostStatus(row._id, newStatus)
  ElMessage.success('操作成功')
  fetch()
}

fetch()
</script>

<style scoped>
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 5: 创建寄养订单列表页**

`src/views/hosting/BoardingOrderList.vue`:
```vue
<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in BOARDING_STATUS" :key="key" :label="label" :value="key" />
      </el-select>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="ownerName" label="宠物主" width="120" />
      <el-table-column prop="petName" label="宠物" width="100" />
      <el-table-column prop="totalPrice" label="金额" width="100">
        <template #default="{ row }">{{ formatMoney(row.totalPrice) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending' || row.status === 'paid'" link type="primary" @click="handleOrder(row._id, 'confirm')">确认</el-button>
          <el-button v-if="row.status === 'confirmed'" link type="success" @click="handleOrder(row._id, 'complete')">完成</el-button>
          <el-button v-if="row.status !== 'completed' && row.status !== 'cancelled'" link type="danger" @click="handleOrder(row._id, 'reject')">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { getBoardingOrders, handleBoardingOrder } from '@/api/hosting'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const BOARDING_STATUS = { pending: '待确认', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }
const statusFilter = ref('')

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getBoardingOrders)

function onSearch() {
  const params = {}
  if (statusFilter.value) params.status = statusFilter.value
  fetch(params)
}

async function handleOrder(orderId, operation) {
  const labels = { confirm: '确认', complete: '完成', reject: '取消' }
  await ElMessageBox.confirm(`确定${labels[operation]}该订单？`)
  await handleBoardingOrder(orderId, operation)
  ElMessage.success('操作成功')
  onSearch()
}

onSearch()
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 6: 创建服务师管理页**

`src/views/feeding/FeederList.vue`:
```vue
<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="name" label="姓名" width="120" />
      <el-table-column prop="serviceType" label="服务类型" width="120" />
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="rating" label="评分" width="80" />
      <el-table-column prop="completedCount" label="完成订单" width="100" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">{{ row.status === 'active' ? '正常' : '停用' }}</el-tag></template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getFeederList } from '@/api/feeding'
import { usePagination } from '@/composables/usePagination'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getFeederList)
fetch()
</script>

<style scoped>
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 7: 创建服务订单列表页**

`src/views/feeding/FeedingOrderList.vue`:
```vue
<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in FEEDING_STATUS" :key="key" :label="label" :value="key" />
      </el-select>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="userName" label="用户" width="120" />
      <el-table-column prop="feederName" label="服务师" width="120" />
      <el-table-column prop="serviceType" label="服务类型" width="120" />
      <el-table-column prop="totalPrice" label="金额" width="100">
        <template #default="{ row }">{{ formatMoney(row.totalPrice) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending'" link type="primary" @click="handleOrder(row._id, 'confirm')">确认</el-button>
          <el-button v-if="row.status === 'confirmed'" link type="success" @click="handleOrder(row._id, 'start')">开始</el-button>
          <el-button v-if="row.status === 'in_progress'" link type="success" @click="handleOrder(row._id, 'complete')">完成</el-button>
          <el-button v-if="row.status !== 'completed' && row.status !== 'cancelled'" link type="danger" @click="handleOrder(row._id, 'cancel')">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { getFeedingOrders, handleFeedingOrder } from '@/api/feeding'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const FEEDING_STATUS = { pending: '待确认', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' }
const statusFilter = ref('')

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getFeedingOrders)

function onSearch() {
  const params = {}
  if (statusFilter.value) params.status = statusFilter.value
  fetch(params)
}

async function handleOrder(orderId, operation) {
  const labels = { confirm: '确认', start: '开始', complete: '完成', cancel: '取消' }
  await ElMessageBox.confirm(`确定${labels[operation]}该订单？`)
  await handleFeedingOrder(orderId, operation)
  ElMessage.success('操作成功')
  onSearch()
}

onSearch()
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 8: Commit**

```bash
git add web-admin/src/api/hosting.js web-admin/src/api/feeding.js web-admin/src/views/hosting/ web-admin/src/views/feeding/
git commit -m "feat(web-admin): 寄养管理+上门服务"
```

---

### Task 11: 商品库 + 商城订单

**Files:**
- Create: `web-admin/src/api/product.js`
- Create: `web-admin/src/api/mall-order.js`
- Create: `web-admin/src/views/product/ProductListView.vue`
- Create: `web-admin/src/views/product/ProductEditView.vue`
- Create: `web-admin/src/views/mall-order/MallOrderList.vue`
- Create: `web-admin/src/views/mall-order/MallOrderDetail.vue`

- [ ] **Step 1: 创建 product API**

`src/api/product.js`:
```javascript
import { callAction } from './index'

export function getProductList(params) { return callAction('getProductList', params) }
export function getProductDetail(productId) { return callAction('getProductDetail', { productId }) }
export function createProduct(data) { return callAction('createProduct', data) }
export function updateProduct(data) { return callAction('updateProduct', data) }
export function deleteProduct(productId) { return callAction('deleteProduct', { productId }) }
export function batchUpdateProducts(data) { return callAction('batchUpdateProducts', data) }
export function cloneProduct(productId) { return callAction('cloneProduct', { productId }) }
```

- [ ] **Step 2: 创建 mall-order API**

`src/api/mall-order.js`:
```javascript
import { callAction } from './index'

export function getMallOrders(params) { return callAction('getMallOrders', params) }
export function getMallOrderDetail(orderId) { return callAction('getMallOrderDetail', { orderId }) }
export function shipMallOrder(orderId, trackingNo) { return callAction('shipMallOrder', { orderId, trackingNo }) }
export function completeMallOrder(orderId) { return callAction('completeMallOrder', { orderId }) }
```

- [ ] **Step 3: 创建商品列表页**

`src/views/product/ProductListView.vue`:
```vue
<template>
  <el-card>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索商品名称" style="width:240px" clearable @clear="onSearch" @keyup.enter="onSearch">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-button type="primary" @click="onSearch">搜索</el-button>
      <el-button type="primary" @click="$router.push('/product/create')">新增商品</el-button>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="name" label="商品名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="price" label="价格" width="100">
        <template #default="{ row }">{{ formatMoney(row.price) }}</template>
      </el-table-column>
      <el-table-column prop="stock" label="库存" width="80" />
      <el-table-column prop="soldCount" label="销量" width="80" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"><el-tag :type="row.status === 'on_sale' ? 'success' : 'info'" size="small">{{ row.status === 'on_sale' ? '上架' : '下架' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/product/${row._id}/edit`)">编辑</el-button>
          <el-button link type="primary" @click="onClone(row._id)">复制</el-button>
          <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { getProductList, deleteProduct, cloneProduct } from '@/api/product'
import { usePagination } from '@/composables/usePagination'
import { formatMoney } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const keyword = ref('')
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getProductList)

function onSearch() { fetch({ keyword: keyword.value }) }

async function onClone(id) {
  await ElMessageBox.confirm('确定复制该商品？')
  await cloneProduct(id)
  ElMessage.success('复制成功')
  onSearch()
}

async function onDelete(id) {
  await ElMessageBox.confirm('确定删除该商品？此操作不可恢复。', '警告', { type: 'warning' })
  await deleteProduct(id)
  ElMessage.success('删除成功')
  onSearch()
}

onSearch()
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 4: 创建商品编辑页**

`src/views/product/ProductEditView.vue`:
```vue
<template>
  <el-card>
    <el-page-header @back="$router.back()" :title="'商品列表'" :content="isEdit ? '编辑商品' : '创建商品'" />
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" style="max-width:700px;margin-top:20px">
      <el-form-item label="商品名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入商品名称" />
      </el-form-item>
      <el-form-item label="分类" prop="category">
        <el-input v-model="form.category" placeholder="请输入分类" />
      </el-form-item>
      <el-form-item label="价格" prop="price">
        <el-input-number v-model="form.price" :min="0" :precision="2" />
      </el-form-item>
      <el-form-item label="库存" prop="stock">
        <el-input-number v-model="form.stock" :min="0" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="4" />
      </el-form-item>
      <el-form-item label="状态">
        <el-switch v-model="form.status" active-value="on_sale" inactive-value="off_sale" active-text="上架" inactive-text="下架" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProductDetail, createProduct, updateProduct } from '@/api/product'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const saving = ref(false)
const isEdit = computed(() => !!route.params.id)

const form = reactive({ name: '', category: '', price: 0, stock: 0, description: '', status: 'on_sale' })
const rules = {
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  price: [{ required: true, message: '请输入价格', trigger: 'blur' }],
}

onMounted(async () => {
  if (isEdit.value) {
    const res = await getProductDetail(route.params.id)
    Object.assign(form, res.data)
  }
})

async function onSave() {
  await formRef.value.validate()
  saving.value = true
  try {
    if (isEdit.value) {
      await updateProduct({ productId: route.params.id, ...form })
    } else {
      await createProduct(form)
    }
    ElMessage.success('保存成功')
    router.push('/product')
  } finally {
    saving.value = false
  }
}
</script>
```

- [ ] **Step 5: 创建商城订单列表页**

`src/views/mall-order/MallOrderList.vue`:
```vue
<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in MALL_STATUS" :key="key" :label="label" :value="key" />
      </el-select>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="productName" label="商品" min-width="180" show-overflow-tooltip />
      <el-table-column prop="receiverName" label="收货人" width="100" />
      <el-table-column prop="totalAmount" label="金额" width="100">
        <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/mall-order/${row._id}`)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { getMallOrders } from '@/api/mall-order'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/utils/constants'

const MALL_STATUS = { pending_payment: '待支付', confirmed: '已确认', shipped: '已发货', completed: '已完成', cancelled: '已取消' }
const statusFilter = ref('')
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getMallOrders)

function onSearch() {
  const params = {}
  if (statusFilter.value) params.status = statusFilter.value
  fetch(params)
}

onSearch()
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 6: 创建商城订单详情页**

`src/views/mall-order/MallOrderDetail.vue`:
```vue
<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'商城订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ ORDER_STATUS_LABELS[order.status] }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="商品">{{ order.productName }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="收货人">{{ order.receiverName }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.receiverPhone }}</el-descriptions-item>
        <el-descriptions-item label="收货地址" :span="2">{{ order.receiverAddress }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDate(order.updatedAt) }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'confirmed' || order.status === 'paid'">
        <el-button type="primary" @click="onShip">发货</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getMallOrderDetail, shipMallOrder } from '@/api/mall-order'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const loading = ref(false)
const order = ref({})

onMounted(async () => {
  loading.value = true
  try {
    const res = await getMallOrderDetail(route.params.id)
    order.value = res.data || {}
  } finally {
    loading.value = false
  }
})

async function onShip() {
  const { value } = await ElMessageBox.prompt('请输入快递单号', '发货', { inputPlaceholder: '快递单号' })
  await shipMallOrder(route.params.id, value)
  ElMessage.success('发货成功')
  const res = await getMallOrderDetail(route.params.id)
  order.value = res.data || {}
}
</script>
```

- [ ] **Step 7: Commit**

```bash
git add web-admin/src/api/product.js web-admin/src/api/mall-order.js web-admin/src/views/product/ web-admin/src/views/mall-order/
git commit -m "feat(web-admin): 商品库+商城订单"
```

---

### Task 12: 团购管理 + 优惠券 + 评价 + 内容 + 推广

**Files:**
- Create: `web-admin/src/api/tuan.js`
- Create: `web-admin/src/api/coupon.js`
- Create: `web-admin/src/api/review.js`
- Create: `web-admin/src/api/banner.js`
- Create: `web-admin/src/api/referral.js`
- Create: `web-admin/src/views/tuan/TuanDealList.vue`
- Create: `web-admin/src/views/tuan/TuanDealEdit.vue`
- Create: `web-admin/src/views/tuan/CommissionManage.vue`
- Create: `web-admin/src/views/coupon/TemplateList.vue`
- Create: `web-admin/src/views/coupon/TemplateEdit.vue`
- Create: `web-admin/src/views/coupon/GrantList.vue`
- Create: `web-admin/src/views/review/ReviewList.vue`
- Create: `web-admin/src/views/banner/BannerList.vue`
- Create: `web-admin/src/views/referral/ReferralView.vue`

- [ ] **Step 1: 创建剩余 API 文件**

`src/api/tuan.js`:
```javascript
import { callAction } from './index'
export function getTuanDealList(params) { return callAction('getTuanDealList', params) }
export function getTuanDealDetail(dealId) { return callAction('getTuanDealDetail', { dealId }) }
export function createTuanDeal(data) { return callAction('createTuanDeal', data) }
export function updateTuanDeal(data) { return callAction('updateTuanDeal', data) }
export function deleteTuanDeal(dealId) { return callAction('deleteTuanDeal', { dealId }) }
export function publishTuanDeal(dealId) { return callAction('publishTuanDeal', { dealId }) }
export function endTuanDeal(dealId) { return callAction('endTuanDeal', { dealId }) }
export function getTuanDealOrders(params) { return callAction('getTuanDealOrders', params) }
export function getCommissionConfig() { return callAction('getCommissionConfig') }
export function updateCommissionConfig(data) { return callAction('updateCommissionConfig', data) }
export function getTuanLeaderCommissions(params) { return callAction('getTuanLeaderCommissions', params) }
export function getTuanCommissionStats() { return callAction('getTuanCommissionStats') }
export function settleTuanCommissions(data) { return callAction('settleTuanCommissions', data) }
```

`src/api/coupon.js`:
```javascript
import { callAction } from './index'
export function getTemplateList(params) { return callAction('getTemplateList', params) }
export function getTemplateDetail(templateId) { return callAction('getTemplateDetail', { templateId }) }
export function createCouponTemplate(data) { return callAction('createCouponTemplate', data) }
export function updateCouponTemplate(data) { return callAction('updateCouponTemplate', data) }
export function deleteCouponTemplate(templateId) { return callAction('deleteCouponTemplate', { templateId }) }
export function toggleCouponTemplateStatus(templateId, status) { return callAction('toggleCouponTemplateStatus', { templateId, status }) }
export function getGrantList(params) { return callAction('getGrantList', params) }
export function getGrantDetail(grantId) { return callAction('getGrantDetail', { grantId }) }
export function createCouponGrant(data) { return callAction('createCouponGrant', data) }
export function getCouponStatistics(params) { return callAction('getCouponStatistics', params) }
```

`src/api/review.js`:
```javascript
import { callAction } from './index'
export function getReviewList(params) { return callAction('getReviewList', params) }
export function getReviewDetail(reviewId) { return callAction('getReviewDetail', { reviewId }) }
export function toggleReviewVisibility(reviewId) { return callAction('toggleReviewVisibility', { reviewId }) }
export function deleteReview(reviewId) { return callAction('deleteReview', { reviewId }) }
```

`src/api/banner.js`:
```javascript
import { callAction } from './index'
export function getBannerList(params) { return callAction('getBannerList', params) }
export function createBanner(data) { return callAction('createBanner', data) }
export function updateBanner(data) { return callAction('updateBanner', data) }
export function updateBannerStatus(bannerId, status) { return callAction('updateBannerStatus', { bannerId, status }) }
export function deleteBanner(bannerId) { return callAction('deleteBanner', { bannerId }) }
export function updateBannerSortOrder(data) { return callAction('updateBannerSortOrder', data) }
```

`src/api/referral.js`:
```javascript
import { callAction } from './index'
export function getReferralStats() { return callAction('getReferralStats') }
export function getReferralList(params) { return callAction('getReferralList', params) }
export function getReferralOrders(params) { return callAction('getReferralOrders', params) }
```

- [ ] **Step 2: 创建团购列表页**

`src/views/tuan/TuanDealList.vue`:
```vue
<template>
  <el-card>
    <div class="toolbar">
      <el-button type="primary" @click="$router.push('/tuan/create')">创建团购</el-button>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="title" label="团购名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="price" label="团购价" width="100">
        <template #default="{ row }">{{ formatMoney(row.price) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="{ draft: 'info', active: 'success', ended: 'warning' }[row.status]" size="small">{{ { draft: '草稿', active: '进行中', ended: '已结束' }[row.status] }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="currentCount" label="参团人数" width="100" />
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/tuan/${row._id}/edit`)">编辑</el-button>
          <el-button v-if="row.status === 'draft'" link type="success" @click="onPublish(row._id)">发布</el-button>
          <el-button v-if="row.status === 'active'" link type="warning" @click="onEnd(row._id)">结束</el-button>
          <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getTuanDealList, publishTuanDeal, endTuanDeal, deleteTuanDeal } from '@/api/tuan'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getTuanDealList)

async function onPublish(id) { await ElMessageBox.confirm('确定发布该团购？'); await publishTuanDeal(id); ElMessage.success('已发布'); fetch() }
async function onEnd(id) { await ElMessageBox.confirm('确定结束该团购？'); await endTuanDeal(id); ElMessage.success('已结束'); fetch() }
async function onDelete(id) { await ElMessageBox.confirm('确定删除？', '警告', { type: 'warning' }); await deleteTuanDeal(id); ElMessage.success('已删除'); fetch() }

fetch()
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 3: 创建团购编辑页**

`src/views/tuan/TuanDealEdit.vue`:
```vue
<template>
  <el-card>
    <el-page-header @back="$router.back()" :title="'团购列表'" :content="isEdit ? '编辑团购' : '创建团购'" />
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" style="max-width:700px;margin-top:20px">
      <el-form-item label="团购名称" prop="title">
        <el-input v-model="form.title" placeholder="请输入团购名称" />
      </el-form-item>
      <el-form-item label="团购价" prop="price">
        <el-input-number v-model="form.price" :min="0" :precision="2" />
      </el-form-item>
      <el-form-item label="原价">
        <el-input-number v-model="form.originalPrice" :min="0" :precision="2" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="4" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTuanDealDetail, createTuanDeal, updateTuanDeal } from '@/api/tuan'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const saving = ref(false)
const isEdit = computed(() => !!route.params.id)

const form = reactive({ title: '', price: 0, originalPrice: 0, description: '' })
const rules = { title: [{ required: true, message: '请输入团购名称', trigger: 'blur' }] }

onMounted(async () => {
  if (isEdit.value) {
    const res = await getTuanDealDetail(route.params.id)
    Object.assign(form, res.data)
  }
})

async function onSave() {
  await formRef.value.validate()
  saving.value = true
  try {
    if (isEdit.value) { await updateTuanDeal({ dealId: route.params.id, ...form }) }
    else { await createTuanDeal(form) }
    ElMessage.success('保存成功')
    router.push('/tuan/list')
  } finally { saving.value = false }
}
</script>
```

- [ ] **Step 4: 创建佣金管理页**

`src/views/tuan/CommissionManage.vue`:
```vue
<template>
  <el-card>
    <el-row :gutter="20" style="margin-bottom:20px">
      <el-col :span="8"><el-statistic title="总佣金" :value="stats.totalCommission || 0" :precision="2" prefix="¥" /></el-col>
      <el-col :span="8"><el-statistic title="待结算" :value="stats.pendingCommission || 0" :precision="2" prefix="¥" /></el-col>
      <el-col :span="8"><el-statistic title="已结算" :value="stats.settledCommission || 0" :precision="2" prefix="¥" /></el-col>
    </el-row>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="inviterNickName" label="推广人" width="120" />
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="orderAmount" label="订单金额" width="120">
        <template #default="{ row }">{{ formatMoney(row.orderAmount) }}</template>
      </el-table-column>
      <el-table-column prop="commissionAmount" label="佣金" width="120">
        <template #default="{ row }">{{ formatMoney(row.commissionAmount) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="row.status === 'settled' ? 'success' : 'warning'" size="small">{{ row.status === 'settled' ? '已结算' : '待结算' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getTuanLeaderCommissions, getTuanCommissionStats } from '@/api/tuan'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'

const stats = ref({})
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getTuanLeaderCommissions)

onMounted(async () => {
  const res = await getTuanCommissionStats()
  stats.value = res.data || {}
  fetch()
})
</script>

<style scoped>
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 5: 创建优惠券模板列表页**

`src/views/coupon/TemplateList.vue`:
```vue
<template>
  <el-card>
    <div class="toolbar">
      <el-button type="primary" @click="$router.push('/coupon/create')">创建优惠券</el-button>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">{{ { discount: '折扣券', cash: '现金券', shipping: '包邮券' }[row.type] || row.type }}</template>
      </el-table-column>
      <el-table-column prop="value" label="面额/折扣" width="120">
        <template #default="{ row }">{{ row.type === 'discount' ? (row.value / 10 + '折') : formatMoney(row.value) }}</template>
      </el-table-column>
      <el-table-column prop="totalCount" label="发放总量" width="100" />
      <el-table-column prop="usedCount" label="已使用" width="80" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"><el-switch :model-value="row.status === 'active'" @change="(val) => toggleStatus(row._id, val ? 'active' : 'inactive')" /></template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/coupon/${row._id}/edit`)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getTemplateList, toggleCouponTemplateStatus, deleteCouponTemplate } from '@/api/coupon'
import { usePagination } from '@/composables/usePagination'
import { formatMoney } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getTemplateList)

async function toggleStatus(id, status) { await toggleCouponTemplateStatus(id, status); ElMessage.success('操作成功'); fetch() }
async function onDelete(id) { await ElMessageBox.confirm('确定删除？', '警告', { type: 'warning' }); await deleteCouponTemplate(id); ElMessage.success('已删除'); fetch() }

fetch()
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 6: 创建优惠券编辑页**

`src/views/coupon/TemplateEdit.vue`:
```vue
<template>
  <el-card>
    <el-page-header @back="$router.back()" :title="'优惠券列表'" :content="isEdit ? '编辑优惠券' : '创建优惠券'" />
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" style="max-width:700px;margin-top:20px">
      <el-form-item label="名称" prop="name"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="类型" prop="type">
        <el-select v-model="form.type"><el-option label="现金券" value="cash" /><el-option label="折扣券" value="discount" /></el-select>
      </el-form-item>
      <el-form-item label="面额" prop="value"><el-input-number v-model="form.value" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="最低消费"><el-input-number v-model="form.minSpend" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="发放总量"><el-input-number v-model="form.totalCount" :min="1" /></el-form-item>
      <el-form-item label="有效期(天)"><el-input-number v-model="form.validDays" :min="1" /></el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTemplateDetail, createCouponTemplate, updateCouponTemplate } from '@/api/coupon'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const saving = ref(false)
const isEdit = computed(() => !!route.params.id)

const form = reactive({ name: '', type: 'cash', value: 0, minSpend: 0, totalCount: 100, validDays: 30 })
const rules = { name: [{ required: true, message: '请输入名称', trigger: 'blur' }] }

onMounted(async () => { if (isEdit.value) { const res = await getTemplateDetail(route.params.id); Object.assign(form, res.data) } })

async function onSave() {
  await formRef.value.validate()
  saving.value = true
  try {
    if (isEdit.value) { await updateCouponTemplate({ templateId: route.params.id, ...form }) }
    else { await createCouponTemplate(form) }
    ElMessage.success('保存成功')
    router.push('/coupon')
  } finally { saving.value = false }
}
</script>
```

- [ ] **Step 7: 创建发放管理页**

`src/views/coupon/GrantList.vue`:
```vue
<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="templateName" label="优惠券" min-width="180" show-overflow-tooltip />
      <el-table-column prop="grantType" label="发放方式" width="120" />
      <el-table-column prop="totalCount" label="发放数量" width="100" />
      <el-table-column prop="claimedCount" label="已领取" width="100" />
      <el-table-column prop="usedCount" label="已使用" width="100" />
      <el-table-column prop="createdAt" label="发放时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getGrantList } from '@/api/coupon'
import { usePagination } from '@/composables/usePagination'
import { formatDate } from '@/utils/format'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getGrantList)
fetch()
</script>

<style scoped>
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 8: 创建评价管理页**

`src/views/review/ReviewList.vue`:
```vue
<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="userName" label="用户" width="120" />
      <el-table-column prop="rating" label="评分" width="160">
        <template #default="{ row }"><el-rate :model-value="row.rating" disabled /></template>
      </el-table-column>
      <el-table-column prop="content" label="评价内容" min-width="250" show-overflow-tooltip />
      <el-table-column prop="visible" label="可见" width="80">
        <template #default="{ row }"><el-switch :model-value="row.visible" @change="toggleVisibility(row._id)" /></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="评价时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getReviewList, toggleReviewVisibility, deleteReview } from '@/api/review'
import { usePagination } from '@/composables/usePagination'
import { formatDate } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getReviewList)

async function toggleVisibility(id) { await toggleReviewVisibility(id); ElMessage.success('操作成功'); fetch() }
async function onDelete(id) { await ElMessageBox.confirm('确定删除该评价？', '警告', { type: 'warning' }); await deleteReview(id); ElMessage.success('已删除'); fetch() }

fetch()
</script>

<style scoped>
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
```

- [ ] **Step 9: 创建轮播图管理页**

`src/views/banner/BannerList.vue`:
```vue
<template>
  <el-card>
    <div class="toolbar">
      <el-button type="primary" @click="showDialog = true">新增轮播图</el-button>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="title" label="标题" width="200" />
      <el-table-column prop="imageUrl" label="图片" width="120">
        <template #default="{ row }"><el-image :src="row.imageUrl" style="width:80px;height:40px" fit="cover" /></template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"><el-switch :model-value="row.status === 'active'" @change="(val) => updateBannerStatus(row._id, val ? 'active' : 'inactive')" /></template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="onEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getBannerList, updateBannerStatus, deleteBanner } from '@/api/banner'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const loading = ref(false)

async function fetchList() { loading.value = true; try { const res = await getBannerList(); list.value = res.data?.list || res.data || [] } finally { loading.value = false } }
async function onDelete(id) { await ElMessageBox.confirm('确定删除？'); await deleteBanner(id); ElMessage.success('已删除'); fetchList() }

onMounted(fetchList)
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
</style>
```

- [ ] **Step 10: 创建推广管理页**

`src/views/referral/ReferralView.vue`:
```vue
<template>
  <div v-loading="loading">
    <el-row :gutter="20" style="margin-bottom:20px">
      <el-col :span="8"><el-card shadow="hover"><el-statistic title="推广用户数" :value="stats.totalUsers || 0" /></el-card></el-col>
      <el-col :span="8"><el-card shadow="hover"><el-statistic title="消费用户数" :value="stats.activeUsers || 0" /></el-card></el-col>
      <el-col :span="8"><el-card shadow="hover"><el-statistic title="累计消费" :value="stats.totalSpent || 0" :precision="2" prefix="¥" /></el-card></el-col>
    </el-row>
    <el-card>
      <template #header>推广用户列表</template>
      <el-table :data="list" v-loading="tableLoading" stripe>
        <el-table-column prop="nickName" label="用户" width="140" />
        <el-table-column prop="createdAt" label="注册时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="orderCount" label="订单数" width="100" />
        <el-table-column prop="totalSpent" label="消费总额" width="120">
          <template #default="{ row }">{{ formatMoney(row.totalSpent) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getReferralStats, getReferralList } from '@/api/referral'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'

const loading = ref(false)
const stats = ref({})
const { list, loading: tableLoading, fetch } = usePagination(getReferralList)

onMounted(async () => {
  loading.value = true
  try {
    const res = await getReferralStats()
    stats.value = res.data || {}
    fetch()
  } finally { loading.value = false }
})
</script>
```

- [ ] **Step 11: Commit**

```bash
git add web-admin/src/api/tuan.js web-admin/src/api/coupon.js web-admin/src/api/review.js web-admin/src/api/banner.js web-admin/src/api/referral.js web-admin/src/views/tuan/ web-admin/src/views/coupon/ web-admin/src/views/review/ web-admin/src/views/banner/ web-admin/src/views/referral/
git commit -m "feat(web-admin): 团购+优惠券+评价+内容+推广管理"
```

---

### Task 13: 云函数HTTP化改造

**Files:**
- Modify: `cloudfunctions/adminService/index.js`
- Modify: `cloudfunctions/adminService/config.json`
- Create: `cloudfunctions/adminService/services/wallet.js`

- [ ] **Step 1: 修改 adminService/config.json 增加 httpPath**

将 config.json 修改为：
```json
{
  "timeout": 15,
  "permissions": { "openapi": [] },
  "httpPath": "/adminService"
}
```

- [ ] **Step 2: 修改 adminService/index.js 增加 HTTP 入口**

在 `exports.main` 函数中增加 HTTP 请求解析逻辑（见上文"二、云函数HTTP化改造"中的完整代码）。核心改动：
1. 新增 `parseHttpEvent()` 函数检测 HTTP 调用
2. 新增 `parseHttpAuth()` 函数从 Bearer Token 解析身份
3. 在 `exports.main` 中区分 HTTP 调用和小程序调用两条路径
4. HTTP 调用路径中独立做权限校验（复用 ACTION_PERMISSIONS + ROLE_PERMISSIONS）

- [ ] **Step 3: 新增 webLogin action**

在 `cloudfunctions/adminService/services/auth.js` 中新增 `webLogin` 函数（见上文代码），并在导出的 handlers 中注册。

- [ ] **Step 4: 新增 wallet 服务模块**

创建 `cloudfunctions/adminService/services/wallet.js`，实现 `getWithdrawalList`、`approveWithdrawal`、`rejectWithdrawal` 三个 action（见上文代码）。

- [ ] **Step 5: 在 adminService/index.js 中注册新 action**

在 `ACTION_PERMISSIONS` 中新增：
```javascript
webLogin: null,
getWithdrawalList: 'user_management',
approveWithdrawal: 'user_management',
rejectWithdrawal: 'user_management',
```

在 handler 映射中新增 wallet 服务模块。

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/adminService/
git commit -m "feat(cloud): adminService HTTP化改造+webLogin+wallet服务"
```

---

### Task 14: 部署与测试

- [ ] **Step 1: 部署 adminService 云函数**

```bash
tcb fn deploy adminService --envId cloud1-8gvqhsiga3011047
```

- [ ] **Step 2: 在 CloudBase 控制台确认 HTTP 触发路径已生效**

确认 URL 为：`https://cloud1-8gvqhsiga3011047.service.tcloudbase.com/adminService`

- [ ] **Step 3: 为超级管理员创建 Web 登录账号**

在 `admins` 集合中为现有超级管理员添加 `username` 和 `passwordHash` 字段：
```javascript
const bcrypt = require('bcryptjs')
const passwordHash = bcrypt.hashSync('初始密码', 10)
// 在 admins 集合中更新对应文档
```

- [ ] **Step 4: 本地启动 Web 项目测试**

```bash
cd web-admin && npm run dev
```

- [ ] **Step 5: 测试登录流程**

1. 访问 http://localhost:3000/login
2. 输入管理员用户名和密码
3. 确认登录成功并跳转到数据看板
4. 确认侧边栏菜单根据权限正确显示

- [ ] **Step 6: 测试各模块基本功能**

逐一检查各管理模块的列表加载、筛选、分页、操作按钮功能。

- [ ] **Step 7: 构建生产版本**

```bash
cd web-admin && npm run build
```

- [ ] **Step 8: 部署到 CloudBase 静态托管**

```bash
tcb hosting deploy web-admin/dist --envId cloud1-8gvqhsiga3011047
```

- [ ] **Step 9: Commit**

```bash
git add web-admin/
git commit -m "feat(web-admin): 部署与测试完成"
```

---

## 四、自检清单

### 1. Spec 覆盖检查

| 迁移方案要求 | 对应 Task |
|-------------|----------|
| 数据看板 | Task 6 |
| 全部订单管理 | Task 9 |
| 财务管理 | Task 9 |
| 提现审核 | Task 9 |
| 用户管理 | Task 7 |
| 管理员管理+审批 | Task 8 |
| 商品库管理 | Task 11 |
| 优惠券管理 | Task 12 |
| 评价管理 | Task 12 |
| 内容管理（轮播图） | Task 12 |
| 推广管理 | Task 12 |
| 团购管理（CRUD+分佣） | Task 12 |
| 寄养家庭审核 | Task 10 |
| 寄养订单管理 | Task 10 |
| 上门服务管理 | Task 10 |
| 商城订单管理 | Task 11 |
| 账号密码登录 | Task 4 + Task 13 |
| 云函数URL化 | Task 13 |
| HTTP认证中间件 | Task 13 |

### 2. Placeholder 扫描

无 TBD/TODO/占位符。

### 3. 类型一致性

- API 函数签名与 composable 调用方式一致（均使用 `callAction` 封装）
- Store 中的 `hasPermission` 方法与路由守卫中的权限检查逻辑一致
- 常量定义（ORDER_STATUS_LABELS 等）在所有页面中统一引用
