# CentralIdentityManager 快速参考

## 核心概念

CentralIdentityManager 是系统中唯一的身份数据源，所有身份信息必须通过它获取。

## 快速开始

### 1. 在页面中使用（推荐）

```javascript
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')

Page(enhanceWithIdentity({
  onLoad() {
    // identityEnhancer 会自动添加以下数据：
    console.log('当前角色:', this.data.userRole)
    console.log('当前资料:', this.data.userProfile)
    console.log('登录状态:', this.data.isLoggedIn)
    console.log('用户信息:', this.data.userInfo)
  }
}))
```

### 2. 直接使用 CentralIdentityManager

```javascript
const { centralIdentityManager } = require('../../utils/CentralIdentityManager')

// 获取当前角色
const role = centralIdentityManager.getCurrentRole()

// 获取当前身份
const identity = centralIdentityManager.getCurrentIdentity()

// 检查登录状态
const isLoggedIn = centralIdentityManager.isLoggedIn()

// 获取指定角色的资料
const hostProfile = centralIdentityManager.getProfile('host')
const ownerProfile = centralIdentityManager.getProfile('owner')

// 切换角色
await centralIdentityManager.switchRole('host')

// 设置登录状态
centralIdentityManager.setLoginStatus(true)

// 设置角色
centralIdentityManager.setRole('owner')

// 设置用户信息
centralIdentityManager.setUserInfo(userInfo)
```

## API 参考

### 获取身份信息

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `getCurrentRole()` | `'owner' \| 'host'` | 获取当前角色 |
| `getCurrentIdentity()` | `Identity` | 获取当前身份信息 |
| `isLoggedIn()` | `boolean` | 检查是否已登录 |
| `getUserInfo()` | `UserInfo` | 获取用户信息 |
| `getProfile(roleType)` | `Profile` | 获取指定角色的资料 |

### 角色切换

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `switchRole(roleType)` | `'owner' \| 'host'` | `Promise<Result>` | 切换到指定角色 |
| `setRole(roleType)` | `'owner' \| 'host'` | `void` | 设置当前角色（无事件） |

### 登录状态

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `setLoginStatus(isLoggedIn)` | `boolean` | `void` | 设置登录状态 |
| `login(userInfo, userSig)` | `UserInfo, string` | `Promise<void>` | 登录 |
| `logout()` | - | `Promise<void>` | 退出登录 |

### 设置数据

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `setUserInfo(userInfo)` | `UserInfo` | `void` | 设置用户信息 |
| `setRole(roleType)` | `'owner' \| 'host'` | `void` | 设置当前角色 |
| `setToken(token)` | `string` | `void` | 设置 token |
| `setUserSig(userSig)` | `string` | `void` | 设置 UserSig |

## 事件系统

### 监听事件

```javascript
const app = getApp()

// 监听角色变更
app.on('central:roleChanged', (event) => {
  console.log('角色已变更为:', event.roleType)
})

// 监听身份更新
app.on('central:identityUpdated', (event) => {
  console.log('身份信息已更新')
})

// 监听登录状态变更
app.on('central:loginStateChanged', (event) => {
  console.log('登录状态:', event.isLoggedIn)
})

// 监听权限更新
app.on('central:permissionUpdated', (event) => {
  console.log('权限已更新')
})
```

### 移除事件监听

```javascript
app.off('central:roleChanged')
app.off('central:identityUpdated')
```

## 云函数集成

### 登录云函数

```javascript
// 首次登录
const res = await wx.cloud.callFunction({
  name: 'login',
  data: {}
})

// 刷新 UserSig
const res = await wx.cloud.callFunction({
  name: 'login',
  data: {
    refreshUserSig: true,
    openid: userOpenid,
    roleType: 'host',
    imUserID: 'hst_xxxxx'
  }
})

// 选择身份（集成 CentralIdentityManager）
const res = await wx.cloud.callFunction({
  name: 'login',
  data: {
    selectRole: true,
    openid: userOpenid,
    roleType: 'host'  // 或 'owner'
  }
})
```

## 页面迁移示例

### 旧代码（使用 IdentityManager）

```javascript
const IdentityManager = require('../../utils/identityManager')

Page({
  data: {
    userRole: 'owner'
  },

  onLoad() {
    const identity = IdentityManager.getCurrentIdentity()
    this.setData({
      userRole: identity.role
    })
  }
})
```

### 新代码（使用 enhanceWithIdentity）

```javascript
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')

Page(enhanceWithIdentity({
  onLoad() {
    // this.data.userRole 已自动设置
    console.log('当前角色:', this.data.userRole)
  }
}))
```

## 常见问题

### Q1: 为什么我需要使用 enhanceWithIdentity？

A: `enhanceWithIdentity` 会自动管理身份状态的同步，无需手动监听事件和更新数据。

### Q2: 如何在非页面文件中使用 CentralIdentityManager？

A: 直接导入并使用：
```javascript
const { centralIdentityManager } = require('./utils/CentralIdentityManager')
const role = centralIdentityManager.getCurrentRole()
```

### Q3: 身份切换后，页面没有自动更新怎么办？

A: 确保使用了 `enhanceWithIdentity` 或正确监听了 `central:roleChanged` 事件。

### Q4: 如何获取所有可用角色？

A: 页面中使用 `this.data.availableRoles`（enhanceWithIdentity 自动添加），或直接调用 `centralIdentityManager.getAvailableRoles()`。

## 文档链接

- 详细使用指南：`docs/identity-management-guide.md`
- 架构设计：`docs/identity-architecture.md`
- 迁移完成报告：`MIGRATION_COMPLETE_REPORT.md`
