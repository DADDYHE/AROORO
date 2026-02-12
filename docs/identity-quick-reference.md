# 身份管理器快速参考卡片

## 一句话说明
**CentralIdentityManager 是系统内唯一权威的身份数据源，所有页面必须通过它获取和操作身份数据。**

## 核心原则
1. ✅ **必须使用**：`centralIdentityManager` 的标准接口
2. ❌ **禁止使用**：直接访问 `wx.getStorageSync('userRole')` 或 `app.globalData.userRole`
3. 🔄 **自动同步**：身份变更时，所有监听页面自动更新
4. 🔐 **权限控制**：所有功能必须检查权限

## 快速开始

### 1️⃣ 初始化（app.js）
```javascript
const { centralIdentityManager } = require('./utils/CentralIdentityManager')

App({
  onLaunch() {
    centralIdentityManager.init()
  }
})
```

### 2️⃣ 页面使用
```javascript
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')

Page(enhanceWithIdentity({
  onLoad(options) {
    console.log('当前角色:', this.data.userRole)
    console.log('用户信息:', this.data.userInfo)
  }
}))
```

## 常用 API

### 获取身份信息
```javascript
const role = centralIdentityManager.getCurrentRole()
const identity = centralIdentityManager.getCurrentIdentity()
const isLoggedIn = centralIdentityManager.isLoggedIn()
```

### 操作身份
```javascript
centralIdentityManager.login({ role, userInfo })
centralIdentityManager.switchRole(ROLE_TYPES.HOST)
centralIdentityManager.logout()
```

### 权限检查
```javascript
const hasPermission = centralIdentityManager.hasPermission(PERMISSIONS.BOOK_SERVICES)
const permissions = centralIdentityManager.checkPermissions([
  PERMISSIONS.VIEW_OWN_PROFILE,
  PERMISSIONS.EDIT_OWN_PROFILE
])
```

## 迁移对照表

| 旧代码 ❌ | 新代码 ✅ |
|---------|---------|
| `wx.getStorageSync('userRole')` | `centralIdentityManager.getCurrentRole()` |
| `wx.getStorageSync('userInfo')` | `centralIdentityManager.getCurrentIdentity()` |
| `wx.getStorageSync('hostInfo')` | `centralIdentityManager.getIdentity(ROLE_TYPES.HOST)` |
| `wx.getStorageSync('ownerInfo')` | `centralIdentityManager.getIdentity(ROLE_TYPES.OWNER)` |
| `app.globalData.userRole` | `centralIdentityManager.getCurrentRole()` |
| `wx.setStorageSync('userRole', role)` | `centralIdentityManager.switchRole(role)` |
| `app.globalData.userRole = role` | `centralIdentityManager.switchRole(role)` |

## 权限列表

### 基础权限
- `PERMISSIONS.VIEW_OWN_PROFILE` - 查看个人资料
- `PERMISSIONS.EDIT_OWN_PROFILE` - 编辑个人资料
- `PERMISSIONS.VIEW_MESSAGES` - 查看消息
- `PERMISSIONS.SEND_MESSAGES` - 发送消息

### 宠物主人权限
- `PERMISSIONS.BOOK_SERVICES` - 预订服务
- `PERMISSIONS.VIEW_HOST_PROFILES` - 查看寄养家庭资料
- `PERMISSIONS.CREATE_PET_PROFILES` - 创建宠物资料
- `PERMISSIONS.VIEW_PET_PROFILES` - 查看宠物资料
- `PERMISSIONS.EDIT_PET_PROFILES` - 编辑宠物资料

### 寄养家庭权限
- `PERMISSIONS.MANAGE_HOST_PROFILE` - 管理寄养家庭资料
- `PERMISSIONS.ACCEPT_BOOKINGS` - 接受预订
- `PERMISSIONS.VIEW_BOOKINGS` - 查看预订
- `PERMISSIONS.MANAGE_BOOKINGS` - 管理预订

## 事件类型

- `IDENTITY_EVENTS.ROLE_CHANGED` - 角色变更
- `IDENTITY_EVENTS.IDENTITY_UPDATED` - 身份更新
- `IDENTITY_EVENTS.LOGIN_STATE_CHANGED` - 登录状态变更
- `IDENTITY_EVENTS.PERMISSION_UPDATED` - 权限更新

## 角色类型

- `ROLE_TYPES.OWNER` - 宠物主人
- `ROLE_TYPES.HOST` - 寄养家庭
- `ROLE_TYPES.GUEST` - 访客

## 迁移命令

```bash
# 扫描违规访问
node scripts/migrate-identity-manager.js scan ./

# 模拟迁移
node scripts/migrate-identity-manager.js migrate ./pages --dry-run

# 实际迁移
node scripts/migrate-identity-manager.js migrate ./pages
```

## 相关文档

- 📖 [完整使用指南](./identity-management-guide.md)
- 🏗️ [重构方案总览](../IDENTITY_REFACTOR_README.md)
- 📋 [重构完成总结](../IDENTITY_REFACTOR_SUMMARY.md)
- 💻 [示例代码](../examples/identity-example-page.js)
- 🔧 [访问中间件](../utils/identityAccessMiddleware.js)
