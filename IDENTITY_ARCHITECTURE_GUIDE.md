# 身份管理系统架构指南

## 1. 架构概述

### 1.1 核心原则
- **单一数据源**：CentralIdentityManager 作为系统内唯一权威的身份数据源
- **集中管理**：所有身份数据必须通过 CentralIdentityManager 获取和存储
- **事件驱动**：身份变更时自动同步所有相关页面
- **权限控制**：提供完整的访问日志和权限控制机制

### 1.2 架构图

```
┌─────────────────────────────────────────────────────┐
│                   应用层                          │
├─────────────────────────────────────────────────────┤
│  │  │              │                              │
│  ▼  ▼              ▼                              │
│┌─────────────────────────────────────────────────┐ │
││               身份管理层                      │ │
│├─────────────────────────────────────────────────┤ │
││  ┌─────────────────┐  ┌──────────────────┐    │ │
││  │   LoginManager  │  │  UserSigManager  │    │ │
││  └─────────────────┘  └──────────────────┘    │ │
││                  │               │            │ │
││                  └───────┬───────┘            │ │
││                          ▼                    │ │
││             ┌───────────────────┐             │ │
││             │   UserManager    │             │ │
││             └───────────────────┘             │ │
││                  │                            │ │
││                  ▼                            │ │
││    ┌─────────────────────────────────┐        │ │
││    │ CentralIdentityManager (核心)   │        │ │
││    └─────────────────────────────────┘        │ │
│└───────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│                   存储层                          │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐          │
│  │   本地存储      │  │   云存储        │          │
│  └─────────────────┘  └─────────────────┘          │
└─────────────────────────────────────────────────────┘
```

## 2. 核心组件

### 2.1 CentralIdentityManager
- **位置**：`utils/CentralIdentityManager.js`
- **作用**：系统内唯一权威的身份数据源
- **核心功能**：
  - 身份管理：创建、更新、删除身份
  - 角色管理：切换角色、管理角色权限
  - 登录/登出：处理登录和登出流程
  - 事件管理：触发身份相关事件
  - 权限控制：检查和管理权限
  - 存储管理：管理本地存储

### 2.2 LoginManager
- **位置**：`src/modules/auth/LoginManager.js`
- **作用**：统一的登录流程管理器
- **核心功能**：
  - 微信小程序登录流程
  - 身份选择逻辑
  - 事件触发和状态管理
  - 性能监控

### 2.3 UserManager
- **位置**：`src/modules/auth/UserManager.js`
- **作用**：用户信息管理器
- **核心功能**：
  - 用户信息管理
  - 角色管理
  - 身份信息管理

### 2.4 UserSigManager
- **位置**：`src/modules/auth/UserSigManager.js`
- **作用**：UserSig 管理器
- **核心功能**：
  - UserSig 生成和管理
  - UserSig 缓存和过期处理
  - UserSig 刷新

## 3. 使用指南

### 3.1 初始化身份管理系统

```javascript
// 在 app.js 中初始化
const { centralIdentityManager } = require('./utils/CentralIdentityManager');

// 初始化身份管理器
centralIdentityManager.init();

// 将 centralIdentityManager 作为 loginStateManager 使用，保持向后兼容
this.globalData.loginStateManager = centralIdentityManager;
```

### 3.2 使用 CentralIdentityManager

#### 3.2.1 获取身份管理器实例

```javascript
const { centralIdentityManager } = require('./utils/CentralIdentityManager');
```

#### 3.2.2 登录

```javascript
const loginData = {
  role: 'owner', // 角色类型
  userInfo: {
    _id: 'user_123',
    openid: 'openid_123',
    nickName: '测试用户',
    avatarUrl: 'https://example.com/avatar.jpg'
  },
  token: 'your_token',
  expiryTime: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期
};

const loginResult = centralIdentityManager.login(loginData);
console.log('登录结果:', loginResult);
```

#### 3.2.3 登出

```javascript
const logoutResult = centralIdentityManager.logout();
console.log('登出结果:', logoutResult);
```

#### 3.2.4 切换角色

```javascript
const switchResult = centralIdentityManager.switchRole('host');
console.log('切换角色结果:', switchResult);
```

#### 3.2.5 检查登录状态

```javascript
const isLoggedIn = centralIdentityManager.isLoggedIn();
console.log('登录状态:', isLoggedIn);

const isExpired = centralIdentityManager.isLoginExpired();
console.log('登录是否过期:', isExpired);
```

#### 3.2.6 获取身份信息

```javascript
// 获取当前角色
const currentRole = centralIdentityManager.getCurrentRole();
console.log('当前角色:', currentRole);

// 获取身份上下文
const ownerContext = centralIdentityManager.getContext('owner');
console.log('宠物主人身份上下文:', ownerContext);

const hostContext = centralIdentityManager.getContext('host');
console.log('寄养家庭身份上下文:', hostContext);
```

#### 3.2.7 更新身份信息

```javascript
// 批量更新身份
const identities = [
  {
    roleType: 'owner',
    profile: {
      name: '宠物主人',
      avatarUrl: 'https://example.com/owner.jpg'
    },
    openid: 'openid_123'
  },
  {
    roleType: 'host',
    profile: {
      name: '寄养家庭',
      avatarUrl: 'https://example.com/host.jpg'
    },
    openid: 'openid_123'
  }
];

const updateResult = centralIdentityManager.batchUpdateIdentities(identities);
console.log('批量更新身份结果:', updateResult);
```

#### 3.2.8 权限管理

```javascript
// 检查权限
const hasPermission = centralIdentityManager.hasPermission('viewMessages');
console.log('是否有查看消息权限:', hasPermission);

// 批量检查权限
const permissions = centralIdentityManager.checkPermissions(['viewMessages', 'sendMessages']);
console.log('权限检查结果:', permissions);
```

#### 3.2.9 事件监听

```javascript
// 监听角色变更事件
centralIdentityManager.on('central:roleChanged', (data) => {
  console.log('角色变更:', data);
});

// 监听登录状态变更事件
centralIdentityManager.on('central:loginStateChanged', (data) => {
  console.log('登录状态变更:', data);
});

// 监听身份更新事件
centralIdentityManager.on('central:identityUpdated', (data) => {
  console.log('身份更新:', data);
});
```

### 3.3 使用 LoginManager

#### 3.3.1 获取登录管理器实例

```javascript
import { getLoginManager } from './src/modules/auth/LoginManager';

const loginManager = getLoginManager(appInstance);
```

#### 3.3.2 登录

```javascript
const loginResult = await loginManager.login({
  type: 'normal', // 登录类型
  skipIdentityCheck: false // 是否跳过身份检查
});
console.log('登录结果:', loginResult);
```

#### 3.3.3 登出

```javascript
const logoutResult = await loginManager.logout(true); // true 表示显示确认对话框
console.log('登出结果:', logoutResult);
```

#### 3.3.4 检查登录状态

```javascript
const isValid = loginManager.checkLoginStatusValid();
console.log('登录状态是否有效:', isValid);

const isLoggedIn = loginManager.isLoggedIn();
console.log('是否已登录:', isLoggedIn);
```

#### 3.3.5 获取身份信息

```javascript
const identityInfo = loginManager.getIdentityInfo();
console.log('身份信息:', identityInfo);
```

### 3.4 使用 UserManager

#### 3.4.1 获取用户管理器实例

```javascript
import { getUserManager } from './src/modules/auth/UserManager';

const userManager = getUserManager();
```

#### 3.4.2 获取用户信息

```javascript
const userInfo = userManager.getUserInfo();
console.log('用户信息:', userInfo);

const userRole = userManager.getUserRole();
console.log('用户角色:', userRole);

const ownerInfo = userManager.getOwnerInfo();
console.log('宠物主人信息:', ownerInfo);

const hostInfo = userManager.getHostInfo();
console.log('寄养家庭信息:', hostInfo);
```

#### 3.4.3 更新用户信息

```javascript
const userInfo = {
  nickName: '新昵称',
  avatarUrl: 'https://example.com/new-avatar.jpg'
};

const updateResult = userManager.updateUserInfo(userInfo);
console.log('更新用户信息结果:', updateResult);
```

### 3.5 使用 UserSigManager

#### 3.5.1 获取 UserSig 管理器实例

```javascript
import { getUserSigManager } from './src/modules/auth/UserSigManager';

const userSigManager = getUserSigManager();
```

#### 3.5.2 获取 UserSig

```javascript
const userSig = userSigManager.getUserSig('owner', 'openid_123');
console.log('UserSig:', userSig);
```

#### 3.5.3 刷新 UserSig

```javascript
const newUserSig = await userSigManager.refreshUserSig('owner', 'openid_123', 'im_user_id');
console.log('新的 UserSig:', newUserSig);
```

#### 3.5.4 检查并刷新即将过期的 UserSig

```javascript
const refreshResult = await userSigManager.checkAndRefreshUserSig('openid_123');
console.log('刷新 UserSig 结果:', refreshResult);
```

#### 3.5.5 清除 UserSig 缓存

```javascript
// 清除所有 UserSig 缓存
userSigManager.clearUserSigCache();

// 清除指定角色的 UserSig 缓存
userSigManager.clearUserSigCache('owner');
```

## 4. 标准登录模块

### 4.1 初始化标准登录模块

```javascript
import AuthModule from './src/modules/auth/index.js';

// 初始化登录模块
AuthModule.init(appInstance);

// 将登录模块添加到全局数据
this.globalData.loginManager = AuthModule;
```

### 4.2 使用标准登录模块

```javascript
// 登录
const loginResult = await this.globalData.loginManager.login();

// 登出
const logoutResult = await this.globalData.loginManager.logout();

// 检查登录状态
const isLoggedIn = this.globalData.loginManager.isLoggedIn();

// 获取用户信息
const userInfo = this.globalData.loginManager.getUserInfo();

// 获取用户角色
const userRole = this.globalData.loginManager.getUserRole();

// 切换角色
const switchResult = await this.globalData.loginManager.switchRole('host');

// 刷新 UserSig
const newUserSig = await this.globalData.loginManager.refreshUserSig('owner', 'openid_123');
```

## 5. 常见问题和解决方案

### 5.1 登录失败

**问题**：登录失败，返回错误信息

**解决方案**：
1. 检查网络连接
2. 检查云函数是否正常运行
3. 检查用户权限
4. 查看控制台错误信息

### 5.2 UserSig 过期

**问题**：UserSig 过期，导致 IM 登录失败

**解决方案**：
1. 调用 `userSigManager.refreshUserSig()` 刷新 UserSig
2. 检查 `userSigManager.checkAndRefreshUserSig()` 是否正常工作
3. 确保云函数能正确生成 UserSig

### 5.3 身份切换失败

**问题**：身份切换失败，返回错误信息

**解决方案**：
1. 检查目标身份是否存在
2. 检查用户权限
3. 查看控制台错误信息

### 5.4 本地存储错误

**问题**：本地存储错误，导致身份数据丢失

**解决方案**：
1. 检查本地存储容量
2. 检查存储权限
3. 调用 `centralIdentityManager.fixIdentityData()` 修复身份数据

## 6. 迁移指南

### 6.1 从旧架构迁移到新架构

#### 6.1.1 移除旧的依赖

1. 删除 `utils/LoginStateManager.js`
2. 删除 `utils/storageManager.js`
3. 删除 `src/modules/auth/StorageManager.js`

#### 6.1.2 更新导入语句

```javascript
// 旧代码
const { loginStateManager } = require('./utils/LoginStateManager');
const { storageManager } = require('./utils/storageManager');

// 新代码
const { centralIdentityManager } = require('./utils/CentralIdentityManager');
```

#### 6.1.3 更新方法调用

```javascript
// 旧代码
const userInfo = loginStateManager.getUserInfo();
const userRole = loginStateManager.getCurrentRole();

// 新代码
const userInfo = centralIdentityManager.getUserInfo();
const userRole = centralIdentityManager.getCurrentRole();
```

#### 6.1.4 更新存储操作

```javascript
// 旧代码
storageManager.set('key', value);
const value = storageManager.get('key');

// 新代码
centralIdentityManager.set('key', value);
const value = centralIdentityManager.get('key');
```

### 6.2 向后兼容性

新架构提供了向后兼容的接口，确保旧代码能正常运行：

```javascript
// 将 centralIdentityManager 作为 loginStateManager 使用
this.globalData.loginStateManager = centralIdentityManager;

// 旧代码仍然可以正常工作
const userInfo = this.globalData.loginStateManager.getUserInfo();
const userRole = this.globalData.loginStateManager.getCurrentRole();
```

## 7. 最佳实践

### 7.1 代码结构

- **集中管理**：所有身份相关操作都通过 CentralIdentityManager 进行
- **事件驱动**：使用事件监听处理身份变更，而不是轮询
- **权限检查**：在执行敏感操作前检查用户权限
- **错误处理**：妥善处理身份管理相关的错误

### 7.2 性能优化

- **缓存策略**：合理使用 UserSig 缓存，减少网络请求
- **批量操作**：使用批量更新方法减少存储操作
- **事件节流**：对频繁触发的事件使用节流处理
- **延迟加载**：非关键身份信息延迟加载

### 7.3 安全最佳实践

- **UserSig 管理**：确保 UserSig 在后端生成，不在前端暴露密钥
- **权限控制**：严格执行权限检查，防止未授权访问
- **数据加密**：敏感身份数据加密存储
- **访问日志**：记录所有身份相关操作的访问日志

### 7.4 调试技巧

- **日志查看**：查看 CentralIdentityManager 的访问日志
- **事件监听**：监听身份相关事件，了解身份变更流程
- **数据验证**：使用 `centralIdentityManager.validateIdentityData()` 验证身份数据
- **数据修复**：使用 `centralIdentityManager.fixIdentityData()` 修复身份数据

## 8. 总结

新的身份管理架构提供了以下优势：

1. **集中管理**：所有身份数据通过 CentralIdentityManager 集中管理，确保数据一致性
2. **事件驱动**：身份变更时自动同步所有相关页面，减少手动同步
3. **权限控制**：提供完整的权限控制机制，确保数据安全
4. **向后兼容**：保持向后兼容，确保旧代码能正常运行
5. **性能优化**：优化 UserSig 管理和存储操作，提高性能
6. **错误处理**：提供完整的错误处理机制，提高系统稳定性

通过使用新的身份管理架构，您可以构建更加稳定、安全、高效的身份管理系统，为用户提供更好的体验。
