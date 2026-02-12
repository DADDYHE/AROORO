# 集中式身份管理器使用指南

## 概述

集中式身份管理器（CentralIdentityManager）是系统内唯一权威的身份数据源。所有页面和模块必须通过此管理器获取和操作身份数据。

## 核心原则

### 1. 唯一数据源原则
- ✅ **必须使用**：`centralIdentityManager` 的标准接口
- ❌ **禁止使用**：直接访问 `wx.getStorageSync('userRole')`
- ❌ **禁止使用**：直接访问 `app.globalData.userRole`
- ❌ **禁止使用**：直接访问 `app.globalData.userInfo`

### 2. 自动同步原则
- 身份信息变更时，管理器自动触发事件
- 所有监听该事件的页面会自动更新
- 禁止手动更新其他页面的身份信息

### 3. 权限控制原则
- 所有权限检查必须通过 `hasPermission()` 方法
- 禁止绕过权限检查直接访问功能

### 4. 日志记录原则
- 所有身份访问自动记录日志
- 生产环境可配置日志级别
- 日志用于问题排查和审计

## 快速开始

### 1. 初始化管理器

在 `app.js` 中初始化：

```javascript
const { centralIdentityManager } = require('./utils/CentralIdentityManager')

App({
  onLaunch() {
    // 初始化身份管理器
    centralIdentityManager.init({
      enableAutoSync: true  // 启用自动同步
    })
  }
})
```

### 2. 页面中使用身份增强

使用 `enhanceWithIdentity` 包装页面配置：

```javascript
const { enhanceWithIdentity, ROLE_TYPES } = require('../../utils/identityPageEnhancer')

Page(enhanceWithIdentity({
  data: {
    // 页面数据会自动包含：
    // - isLoggedIn: 是否登录
    // - userRole: 当前角色
    // - currentRole: 当前角色
    // - userInfo: 用户信息
    // - hostProfile/ownerProfile: 角色特定的配置信息
  },

  onLoad(options) {
    // 页面加载时自动同步身份状态
    console.log('当前角色:', this.data.userRole)
    console.log('用户信息:', this.data.userInfo)
  },

  // 自定义身份变更回调
  onIdentityChanged(data) {
    console.log('身份已变更:', data)
    // 执行自定义逻辑
  }
}))
```

## 核心API

### 获取身份信息

#### 获取当前角色
```javascript
const currentRole = centralIdentityManager.getCurrentRole()
console.log('当前角色:', currentRole) // 'owner' 或 'host'
```

#### 获取当前身份信息
```javascript
const identity = centralIdentityManager.getCurrentIdentity()
console.log('身份信息:', identity)
// 返回格式:
// {
//   role: 'owner',
//   _id: 'owner_...',
//   openid: 'o...',
//   avatarUrl: '...',
//   nickName: '...',
//   commonData: { ... }
// }
```

#### 获取指定角色的身份信息
```javascript
const hostIdentity = centralIdentityManager.getIdentity(ROLE_TYPES.HOST)
const ownerIdentity = centralIdentityManager.getIdentity(ROLE_TYPES.OWNER)
```

### 检查登录状态

#### 检查是否登录
```javascript
const isLoggedIn = centralIdentityManager.isLoggedIn()
console.log('是否登录:', isLoggedIn)
```

#### 检查登录是否过期
```javascript
const isExpired = centralIdentityManager.isLoginExpired()
console.log('登录是否过期:', isExpired)
```

### 操作身份

#### 登录
```javascript
const success = centralIdentityManager.login({
  role: ROLE_TYPES.HOST,
  userInfo: {
    _id: 'host_123',
    openid: 'o...',
    avatarUrl: '...',
    nickName: '...'
  },
  token: '...',
  expiryTime: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天后过期
})

if (success) {
  console.log('登录成功')
}
```

#### 切换角色
```javascript
const success = centralIdentityManager.switchRole(ROLE_TYPES.OWNER)
if (success) {
  console.log('角色切换成功')
}
```

#### 退出登录
```javascript
const success = centralIdentityManager.logout()
if (success) {
  console.log('退出登录成功')
}
```

### 权限检查

#### 检查单个权限
```javascript
const { PERMISSIONS } = require('./utils/CentralIdentityManager')

const canBook = centralIdentityManager.hasPermission(PERMISSIONS.BOOK_SERVICES)
console.log('可以预订服务:', canBook)
```

#### 批量检查权限
```javascript
const permissions = centralIdentityManager.checkPermissions([
  PERMISSIONS.BOOK_SERVICES,
  PERMISSIONS.VIEW_HOST_PROFILES,
  PERMISSIONS.CREATE_PET_PROFILES
])

console.log('权限检查结果:', permissions)
// 返回格式:
// {
//   bookServices: true,
//   viewHostProfiles: true,
//   createPetProfiles: true
// }
```

### 事件监听

#### 监听角色变更
```javascript
const { IDENTITY_EVENTS } = require('./utils/CentralIdentityManager')

centralIdentityManager.on(IDENTITY_EVENTS.ROLE_CHANGED, (data) => {
  console.log('角色已变更:', data)
  // data: { previousRole, currentRole, timestamp }
})
```

#### 监听身份更新
```javascript
centralIdentityManager.on(IDENTITY_EVENTS.IDENTITY_UPDATED, (data) => {
  console.log('身份已更新:', data)
  // data: { role, identity, timestamp }
})
```

#### 监听登录状态变更
```javascript
centralIdentityManager.on(IDENTITY_EVENTS.LOGIN_STATE_CHANGED, (data) => {
  console.log('登录状态已变更:', data)
  // data: { isLoggedIn, role, previousRole, timestamp }
})
```

#### 移除事件监听
```javascript
centralIdentityManager.off(IDENTITY_EVENTS.ROLE_CHANGED, callback)
```

### 日志和调试

#### 获取访问日志
```javascript
const logs = centralIdentityManager.getAccessLogs({
  startTime: Date.now() - 24 * 60 * 60 * 1000, // 最近24小时
  operation: 'login',
  role: ROLE_TYPES.HOST
})

console.log('访问日志:', logs)
```

#### 清除访问日志
```javascript
centralIdentityManager.clearAccessLogs()
```

## 迁移指南

### 从旧代码迁移

#### ❌ 错误写法
```javascript
// 旧代码 - 直接从本地存储获取
const userRole = wx.getStorageSync('userRole')
const userInfo = wx.getStorageSync('userInfo')
const hostInfo = wx.getStorageSync('hostInfo')
```

#### ✅ 正确写法
```javascript
// 新代码 - 使用身份管理器
const { centralIdentityManager, ROLE_TYPES } = require('../../utils/CentralIdentityManager')

const userRole = centralIdentityManager.getCurrentRole()
const userInfo = centralIdentityManager.getCurrentIdentity()
const hostInfo = centralIdentityManager.getIdentity(ROLE_TYPES.HOST)
```

### 使用迁移脚本

```bash
# 扫描项目，检测违规访问
node scripts/migrate-identity-manager.js scan ./pages

# 模拟迁移（不实际修改文件）
node scripts/migrate-identity-manager.js migrate ./pages --dry-run

# 实际迁移文件
node scripts/migrate-identity-manager.js migrate ./pages
```

## 常见问题

### Q1: 为什么页面数据中没有及时更新身份信息？

A: 确保页面使用了 `enhanceWithIdentity` 包装，或者手动监听了身份变更事件：

```javascript
centralIdentityManager.on(IDENTITY_EVENTS.IDENTITY_UPDATED, (data) => {
  this._syncIdentityToPage()
})
```

### Q2: 如何在多个身份之间切换？

A: 使用 `switchRole()` 方法切换角色，管理器会自动触发事件更新所有页面：

```javascript
centralIdentityManager.switchRole(ROLE_TYPES.HOST)
```

### Q3: 权限检查失败怎么办？

A: 检查当前角色是否有该权限，或者是否正确配置了权限：

```javascript
const hasPermission = centralIdentityManager.hasPermission(PERMISSIONS.BOOK_SERVICES)
if (!hasPermission) {
  wx.showToast({ title: '无权限', icon: 'none' })
  return
}
```

### Q4: 如何调试身份管理器？

A: 使用访问日志查看所有身份相关的操作：

```javascript
const logs = centralIdentityManager.getAccessLogs()
console.table(logs)
```

## 最佳实践

### 1. 始终使用身份增强器
```javascript
Page(enhanceWithIdentity({
  data: { ... },
  onLoad(options) { ... }
}))
```

### 2. 避免直接访问 globalData
```javascript
// ❌ 错误
const app = getApp()
const role = app.globalData.userRole

// ✅ 正确
const role = centralIdentityManager.getCurrentRole()
```

### 3. 使用事件驱动更新
```javascript
// ❌ 错误 - 手动更新其他页面
somePage.setData({ userRole: newRole })

// ✅ 正确 - 让管理器自动同步
centralIdentityManager.switchRole(newRole)
```

### 4. 统一权限检查
```javascript
// ❌ 错误 - 绕过权限检查
if (userRole === 'host') {
  // 直接执行操作
}

// ✅ 正确 - 检查权限
if (centralIdentityManager.hasPermission(PERMISSIONS.MANAGE_HOST_PROFILE)) {
  // 执行操作
}
```

## 附录

### 角色类型
- `ROLE_TYPES.OWNER` - 宠物主人
- `ROLE_TYPES.HOST` - 寄养家庭
- `ROLE_TYPES.GUEST` - 访客

### 权限列表
**基础权限：**
- `VIEW_OWN_PROFILE` - 查看个人资料
- `EDIT_OWN_PROFILE` - 编辑个人资料
- `VIEW_MESSAGES` - 查看消息
- `SEND_MESSAGES` - 发送消息

**宠物主人权限：**
- `BOOK_SERVICES` - 预订服务
- `VIEW_HOST_PROFILES` - 查看寄养家庭资料
- `CREATE_PET_PROFILES` - 创建宠物资料
- `VIEW_PET_PROFILES` - 查看宠物资料
- `EDIT_PET_PROFILES` - 编辑宠物资料

**寄养家庭权限：**
- `MANAGE_HOST_PROFILE` - 管理寄养家庭资料
- `ACCEPT_BOOKINGS` - 接受预订
- `VIEW_BOOKINGS` - 查看预订
- `MANAGE_BOOKINGS` - 管理预订

### 事件类型
- `IDENTITY_EVENTS.ROLE_CHANGED` - 角色变更
- `IDENTITY_EVENTS.IDENTITY_UPDATED` - 身份更新
- `IDENTITY_EVENTS.LOGIN_STATE_CHANGED` - 登录状态变更
- `IDENTITY_EVENTS.PERMISSION_UPDATED` - 权限更新

## 参考文档
- [微信小程序官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [身份管理器源码](../utils/CentralIdentityManager.js)
- [页面身份增强器源码](../utils/identityPageEnhancer.js)
- [访问中间件源码](../utils/identityAccessMiddleware.js)
