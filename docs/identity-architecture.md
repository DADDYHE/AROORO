# 集中式身份管理器 - 架构设计文档

## 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CentralIdentityManager                       │
│                    (集中式身份管理器 - 唯一数据源)               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Identity Store (身份存储)                  │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  currentRole: 'owner' | 'host' | 'guest'           │   │
│  │  isLoggedIn: boolean                                    │   │
│  │  identities: {                                         │   │
│  │    owner: { _id, openid, avatarUrl, nickName, ... }   │   │
│  │    host: { _id, openid, avatarUrl, hostName, ... }    │   │
│  │    guest: { ... }                                      │   │
│  │  }                                                     │   │
│  │  commonData: {                                         │   │
│  │    openid, userId, token, loginTime, expiryTime         │   │
│  │  }                                                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Permission Manager (权限管理器)              │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  getDefaultPermissions(role)                          │   │
│  │  hasPermission(permission, role)                      │   │
│  │  checkPermissions(permissionList, role)                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │               Access Logger (访问日志)                     │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  log(operation, details)                             │   │
│  │  getLogs(filters)                                     │   │
│  │  clearLogs()                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                Event System (事件系统)                   │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  Events:                                              │   │
│  │    - ROLE_CHANGED                                      │   │
│  │    - IDENTITY_UPDATED                                  │   │
│  │    - LOGIN_STATE_CHANGED                               │   │
│  │    - PERMISSION_UPDATED                                 │   │
│  │                                                       │   │
│  │  Methods:                                             │   │
│  │    - on(eventName, callback)                           │   │
│  │    - off(eventName, callback)                          │   │
│  │    - _emitEvent(eventName, data)                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │             Public API (公开接口)                        │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  // 获取身份信息                                      │   │
│  │  getCurrentRole()                                     │   │
│  │  getCurrentIdentity()                                  │   │
│  │  getIdentity(role)                                     │   │
│  │  getAllIdentities()                                    │   │
│  │                                                       │   │
│  │  // 操作身份                                           │   │
│  │  login(data)                                          │   │
│  │  logout()                                             │   │
│  │  switchRole(role)                                      │   │
│  │                                                       │   │
│  │  // 检查状态                                           │   │
│  │  isLoggedIn()                                         │   │
│  │  isLoginExpired()                                      │   │
│  │                                                       │   │
│  │  // 权限检查                                           │   │
│  │  hasPermission(permission)                              │   │
│  │  checkPermissions(permissionList)                       │   │
│  │                                                       │   │
│  │  // 数据管理                                           │   │
│  │  exportData()                                         │   │
│  │  importData(data)                                      │   │
│  │  getAccessLogs(filters)                                │   │
│  │  clearAccessLogs()                                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               ▲
                               │
                        标准API接口
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        │                      │                      │
┌───────┴───────┐  ┌─────────┴────────┐  ┌─────┴────────┐
│                │  │                  │  │                │
│ Page Enhancer   │  │ Access Middleware │  │ Migration Tool │
│ (页面身份增强器)  │  (访问拦截中间件)    │  (迁移工具)       │
│                │  │                  │  │                │
│ - 自动同步身份  │  │ - 检测违规访问     │  │ - 代码扫描      │
│ - 自动更新页面  │  │ - 生成迁移建议     │  │ - 自动迁移      │
│ - 事件监听      │  │ - 开发环境警告     │  │ - 生成报告      │
└────────┬───────┘  └────────┬─────────┘  └─────┬────────┘
         │                     │                   │
         │                     │                   │
         ▼                     ▼                   ▼
    ┌───────────────────────────────────────────────────────┐
    │                  Application Pages                 │
    ├───────────────────────────────────────────────────────┤
    │                                                     │
    │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
    │  │   Home   │  │  Profile │  │   Booking   │   │
    │  │  (首页)  │  │ (个人中心)│  │   (预订)    │   │
    │  └──────────┘  └──────────┘  └──────────────┘   │
    │                                                     │
    │  使用 enhanceWithIdentity 包装                         │
    │  自动同步身份状态到页面                               │
    │  自动监听身份变更事件                                 │
    │                                                     │
    └───────────────────────────────────────────────────────┘
```

## 数据流程图

### 登录流程

```
┌─────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  用户   │      │ LoginManager.js  │      │CentralIdentityMgr    │
│  操作   │──────►│ (登录模块)       │──────►│ (身份管理器)         │
└─────────┘      └──────────────────┘      └─────────────────────┘
                        │                              │
                        │  login({ role, userInfo })     │
                        │                              │
                        │                              ├─ 1. 保存身份数据
                        │                              ├─ 2. 设置当前角色
                        │                              ├─ 3. 更新登录状态
                        │                              ├─ 4. 保存到本地存储
                        │                              └─ 5. 触发事件
                        │                              │
                        │              触发事件            │
                        │◄───────────────────────────────┤
                        │  IDENTITY_UPDATED            │
                        │  LOGIN_STATE_CHANGED         │
                        │                              │
                        ▼                              ▼
              ┌──────────────────┐              ┌─────────────────────┐
              │   所有页面       │              │   其他监听者        │
              │  自动更新       │              │  (如 IM 模块)       │
              └──────────────────┘              └─────────────────────┘
```

### 角色切换流程

```
┌─────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  用户   │      │  Profile/Role   │      │CentralIdentityMgr    │
│  操作   │──────►│   Manager       │──────►│ (身份管理器)         │
└─────────┘      │ (页面/模块)      │      └─────────────────────┘
                 └──────────────────┘              │
                           │                      │
                           │ switchRole(role)      │
                           │                      │
                           │                      ├─ 1. 验证目标角色
                           │                      ├─ 2. 切换当前角色
                           │                      ├─ 3. 保存到本地存储
                           │                      └─ 4. 触发事件
                           │                      │
                           │      触发事件         │
                           │◄──────────────────────┤
                           │  ROLE_CHANGED         │
                           │  IDENTITY_UPDATED    │
                           │                      │
                           ▼                      ▼
                 ┌──────────────────┐      ┌─────────────────────┐
                 │   所有页面       │      │   其他监听者        │
                 │  自动更新角色    │      │  (如权限系统)       │
                 └──────────────────┘      └─────────────────────┘
```

### 权限检查流程

```
┌─────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  用户   │      │   Page/Module   │      │CentralIdentityMgr    │
│  操作   │──────►│   (页面/模块)    │──────►│ (身份管理器)         │
└─────────┘      └──────────────────┘      └─────────────────────┘
                           │                      │
                           │ hasPermission()     │
                           │                      │
                           │                      ├─ 1. 获取当前角色
                           │                      ├─ 2. 获取角色权限
                           │                      ├─ 3. 检查权限
                           │                      ├─ 4. 记录访问日志
                           │                      └─ 5. 返回结果
                           │                      │
                           │      返回结果         │
                           │◄──────────────────────┤
                           │  true/false          │
                           │                      │
                           ▼                      ▼
                 ┌──────────────────┐      ┌─────────────────────┐
                 │  执行/拒绝操作   │      │   Access Logger     │
                 └──────────────────┘      │   (访问日志)         │
                                          └─────────────────────┘
```

## 关键特性

### 1. 单一数据源
- 所有身份数据存储在 `CentralIdentityManager` 中
- 禁止从其他渠道（本地存储、globalData等）获取身份数据
- 确保数据一致性

### 2. 自动同步
- 身份变更时自动触发事件
- 所有监听事件的页面自动更新
- 无需手动同步

### 3. 权限控制
- 基于角色的权限系统
- 统一的权限检查接口
- 支持单个和批量检查

### 4. 访问日志
- 记录所有身份相关操作
- 支持按时间、操作、角色等过滤
- 用于问题排查和审计

### 5. 事件驱动
- 支持多种事件类型
- 页面可以监听和响应事件
- 支持自定义回调

## 存储结构

### Identity Store
```javascript
{
  currentRole: 'owner' | 'host' | 'guest',
  defaultRole: 'owner',
  isLoggedIn: boolean,
  identities: {
    owner: {
      _id: string,
      openid: string,
      avatarUrl: string,
      nickName: string,
      role: 'owner',
      updatedAt: number,
      // ... 其他字段
    },
    host: {
      _id: string,
      openid: string,
      avatarUrl: string,
      hostName: string,
      phone: string,
      address: string,
      role: 'host',
      updatedAt: number,
      // ... 其他字段
    },
    guest: { ... }
  },
  commonData: {
    openid: string,
    userId: string,
    token: string,
    loginTime: number,
    expiryTime: number
  }
}
```

### Access Log
```javascript
{
  timestamp: number,
  operation: string,
  role: string,
  page: string,
  // ... 其他详细信息
}
```

## 扩展点

### 1. 自定义权限
```javascript
// 可以扩展 PermissionManager 添加自定义权限
class CustomPermissionManager extends PermissionManager {
  getDefaultPermissions(role) {
    const permissions = super.getDefaultPermissions(role)
    // 添加自定义权限
    return permissions
  }
}
```

### 2. 自定义事件
```javascript
// 添加自定义事件类型
const CUSTOM_EVENTS = {
  CUSTOM_EVENT: 'custom:event'
}

// 监听自定义事件
centralIdentityManager.on(CUSTOM_EVENTS.CUSTOM_EVENT, callback)
```

### 3. 自定义存储策略
```javascript
// 可以覆盖 _saveToStorage 和 _loadFromStorage
// 实现自定义的持久化策略
```

## 性能考虑

### 1. 自动同步
- 默认每 30 秒同步一次
- 可配置同步间隔
- 仅在数据变更时触发事件

### 2. 访问日志
- 最多保留 500 条日志
- 自动清理过期日志
- 可配置日志级别

### 3. 事件优化
- 批量触发事件
- 避免频繁更新
- 使用事件去重

## 安全考虑

### 1. 数据隔离
- 不同角色的数据完全隔离
- 禁止跨角色访问

### 2. 权限控制
- 所有功能必须检查权限
- 禁止绕过权限检查

### 3. 访问审计
- 记录所有身份相关操作
- 支持事后追溯

## 最佳实践

### 1. 始终使用标准接口
- ✅ 使用 `centralIdentityManager.getCurrentRole()`
- ❌ 使用 `wx.getStorageSync('userRole')`

### 2. 使用页面增强器
- ✅ 使用 `enhanceWithIdentity` 包装页面
- ❌ 手动同步身份状态

### 3. 检查权限
- ✅ 使用 `hasPermission()` 检查权限
- ❌ 直接访问功能

### 4. 监听事件
- ✅ 监听身份变更事件
- ❌ 手动更新其他页面

## 相关文档

- [完整使用指南](./identity-management-guide.md)
- [快速参考卡片](./identity-quick-reference.md)
- [重构完成总结](../IDENTITY_REFACTOR_SUMMARY.md)
