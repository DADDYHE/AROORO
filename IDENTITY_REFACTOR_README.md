# 身份管理器重构方案

## 概述

本次重构旨在实现集中式身份信息管理，解决现有系统中身份数据来源分散、状态不一致的问题。

## 问题分析

### 现有问题

1. **数据来源分散**
   - 身份数据存储在多个地方：`app.globalData`、`wx.getStorageSync()`、各个页面的 `data`
   - 不同模块从不同来源获取数据，导致状态不一致

2. **角色优先级混乱**
   - `IdentityManager` 从多个来源（globalUserRole、userInfoRole、storageRole、identityContextRole）按优先级获取角色
   - 优先级配置不当导致角色切换后状态未更新

3. **缺少自动同步机制**
   - 身份变更后需要手动更新各个页面
   - 容易遗漏导致状态不一致

4. **缺少权限控制**
   - 没有统一的权限检查机制
   - 容易出现越权访问

5. **缺少访问日志**
   - 无法追踪身份相关的操作
   - 问题排查困难

## 重构方案

### 核心设计原则

1. **唯一权威数据源**
   - `CentralIdentityManager` 作为系统内唯一身份数据源
   - 禁止从其他渠道获取或存储身份数据

2. **自动同步机制**
   - 身份变更时自动触发事件
   - 所有监听事件的页面自动更新

3. **权限控制**
   - 统一的权限检查接口
   - 基于角色的访问控制

4. **访问日志**
   - 记录所有身份相关操作
   - 支持问题排查和审计

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                  CentralIdentityManager                   │
│              (集中式身份管理器 - 唯一数据源)            │
├─────────────────────────────────────────────────────────────┤
│  - 身份数据存储 (Identity Store)                       │
│  - 权限管理器 (Permission Manager)                      │
│  - 访问日志 (Access Logger)                             │
│  - 事件系统 (Event System)                               │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │
                           │ 标准API接口
                           │
┌──────────────────────────┼───────────────────────────────┐
│                         │                               │
│  ┌──────────────────────┼──────────────────────┐       │
│  │                      │                       │       │
│  │    Page Enhancer     │   Access Middleware   │       │
│  │  (页面身份增强器)     │    (访问拦截中间件)     │       │
│  │                      │                       │       │
│  │  - 自动同步身份      │  - 检测违规访问       │       │
│  │  - 自动更新页面      │  - 生成迁移建议       │       │
│  │  - 事件监听        │  - 代码扫描工具       │       │
│  └──────────────────────┼──────────────────────┘       │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │
                          │
                  ┌───────┴────────┐
                  │                │
          ┌───────┴─────┐   ┌─────┴──────┐
          │   Pages     │   │  Modules   │
          │             │   │            │
          │  home       │   │  auth      │
          │  profile    │   │  message   │
          │  booking    │   │  booking   │
          │  ...        │   │  ...       │
          └─────────────┘   └────────────┘
```

## 模块说明

### 1. CentralIdentityManager (核心管理器)

**文件位置**：`utils/CentralIdentityManager.js`

**核心功能**：
- 身份数据存储和管理
- 角色切换
- 登录/退出登录
- 权限检查
- 访问日志记录
- 事件系统

**核心API**：
```javascript
// 获取身份信息
getCurrentRole()         // 获取当前角色
getCurrentIdentity()     // 获取当前身份信息
getIdentity(role)        // 获取指定角色的身份信息

// 操作身份
login(data)             // 登录
logout()                // 退出登录
switchRole(role)        // 切换角色

// 检查状态
isLoggedIn()            // 检查是否登录
isLoginExpired()        // 检查登录是否过期

// 权限检查
hasPermission(permission)         // 检查单个权限
checkPermissions(permissionList)   // 批量检查权限

// 事件监听
on(eventName, callback)   // 注册事件监听
off(eventName, callback)  // 移除事件监听
```

### 2. identityPageEnhancer (页面身份增强器)

**文件位置**：`utils/identityPageEnhancer.js`

**核心功能**：
- 自动同步身份状态到页面
- 自动更新页面数据
- 自动设置事件监听
- 提供便捷的身份操作方法

**使用方式**：
```javascript
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')

Page(enhanceWithIdentity({
  data: {
    // 页面数据会自动包含身份信息
  },
  onLoad(options) {
    // 自动同步身份状态
  }
}))
```

### 3. identityAccessMiddleware (访问拦截中间件)

**文件位置**：`utils/identityAccessMiddleware.js`

**核心功能**：
- 检测违规访问（直接访问本地存储、globalData等）
- 提供代码扫描工具
- 生成迁移建议
- 开发环境警告

**违规访问模式**：
- `wx.getStorageSync('userRole')` → 应使用 `centralIdentityManager.getCurrentRole()`
- `wx.getStorageSync('userInfo')` → 应使用 `centralIdentityManager.getCurrentIdentity()`
- `app.globalData.userRole` → 应使用 `centralIdentityManager.getCurrentRole()`
- `wx.setStorageSync('userRole', role)` → 应使用 `centralIdentityManager.switchRole(role)`

### 4. migrate-identity-manager (迁移脚本)

**文件位置**：`scripts/migrate-identity-manager.js`

**核心功能**：
- 扫描项目文件，检测违规访问
- 自动生成迁移代码
- 支持模拟运行和实际迁移
- 生成详细的迁移报告

**使用方式**：
```bash
# 扫描违规访问
node scripts/migrate-identity-manager.js scan ./pages

# 模拟迁移
node scripts/migrate-identity-manager.js migrate ./pages --dry-run

# 实际迁移
node scripts/migrate-identity-manager.js migrate ./pages
```

## 迁移步骤

### 第一阶段：初始化和配置

1. **在 app.js 中初始化管理器**
```javascript
const { centralIdentityManager } = require('./utils/CentralIdentityManager')

App({
  onLaunch() {
    centralIdentityManager.init({
      enableAutoSync: true
    })
  }
})
```

2. **扫描项目，检测违规访问**
```bash
node scripts/migrate-identity-manager.js scan ./
```

### 第二阶段：页面迁移

1. **使用身份增强器包装页面**

示例 - home/index.js：
```javascript
// 修改前
const app = getApp()
Page({
  onLoad() {
    const userRole = app.globalData.userRole
    const userInfo = app.globalData.userInfo
    // ...
  }
})

// 修改后
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')
Page(enhanceWithIdentity({
  data: {
    // 页面数据自动包含身份信息
  },
  onLoad(options) {
    console.log('当前角色:', this.data.userRole)
    console.log('用户信息:', this.data.userInfo)
  }
}))
```

2. **使用迁移脚本自动迁移**
```bash
node scripts/migrate-identity-manager.js migrate ./pages --dry-run
```

### 第三阶段：模块迁移

1. **更新 LoginManager.js**

修改登录流程，使用 `centralIdentityManager.login()`：
```javascript
const { centralIdentityManager, ROLE_TYPES } = require('../utils/CentralIdentityManager')

// 登录成功后
centralIdentityManager.login({
  role: userRole,
  userInfo: userInfo,
  token: token,
  expiryTime: expiryTime
})
```

2. **更新 RoleManager.js**

使用 `centralIdentityManager.switchRole()`：
```javascript
const { centralIdentityManager, ROLE_TYPES } = require('../utils/CentralIdentityManager')

// 切换角色
centralIdentityManager.switchRole(ROLE_TYPES.HOST)
```

### 第四阶段：验证和优化

1. **验证身份一致性**
   - 切换角色后，检查所有页面是否同步更新
   - 检查登录/退出登录是否正常

2. **验证权限控制**
   - 检查权限检查是否正确
   - 测试无权限访问是否被拦截

3. **性能优化**
   - 检查访问日志，优化频繁调用
   - 调整自动同步间隔

## 测试计划

### 单元测试

- [ ] 测试角色切换
- [ ] 测试登录/退出登录
- [ ] 测试权限检查
- [ ] 测试事件系统
- [ ] 测试数据持久化

### 集成测试

- [ ] 测试页面身份同步
- [ ] 测试跨页面角色切换
- [ ] 测试登录状态保持
- [ ] 测试权限控制

### 兼容性测试

- [ ] 测试与现有代码的兼容性
- [ ] 测试迁移脚本的准确性
- [ ] 测试回滚方案

## 注意事项

### 禁止操作

❌ **禁止直接访问本地存储**
```javascript
// ❌ 错误
const role = wx.getStorageSync('userRole')
```

❌ **禁止直接访问 globalData**
```javascript
// ❌ 错误
const app = getApp()
const role = app.globalData.userRole
```

❌ **禁止绕过权限检查**
```javascript
// ❌ 错误
if (userRole === 'host') {
  doSomething()
}
```

### 推荐操作

✅ **使用身份管理器API**
```javascript
// ✅ 正确
const role = centralIdentityManager.getCurrentRole()
```

✅ **使用身份增强器**
```javascript
// ✅ 正确
Page(enhanceWithIdentity({
  data: { ... },
  onLoad(options) { ... }
}))
```

✅ **检查权限**
```javascript
// ✅ 正确
if (centralIdentityManager.hasPermission(PERMISSIONS.MANAGE_HOST_PROFILE)) {
  doSomething()
}
```

## 参考文档

- [集中式身份管理器使用指南](./docs/identity-management-guide.md)
- [CentralIdentityManager 源码](./utils/CentralIdentityManager.js)
- [页面身份增强器源码](./utils/identityPageEnhancer.js)
- [访问拦截中间件源码](./utils/identityAccessMiddleware.js)

## 后续优化建议

1. **性能优化**
   - 考虑使用缓存减少频繁访问
   - 优化事件触发机制，避免不必要的更新

2. **功能扩展**
   - 支持多设备同时登录
   - 支持身份关联和授权
   - 支持角色继承和组合

3. **监控和告警**
   - 添加性能监控
   - 异常访问告警
   - 统计分析

4. **文档完善**
   - 添加更多示例代码
   - 完善最佳实践文档
   - 提供故障排查指南
