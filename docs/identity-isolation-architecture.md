# 身份隔离架构设计方案

## 1. 问题分析

当前身份管理实现存在以下问题：

1. **数据存储未隔离**：所有身份信息存储在同一个globalData中，没有完全隔离
2. **IM用户账号未隔离**：所有身份共享同一个IM用户账号，无法区分不同身份
3. **代码使用未隔离**：代码在运行时没有严格区分当前身份的上下文
4. **数据存储未隔离**：所有身份共享同一个存储空间，没有独立的存储区域

## 2. 设计目标

实现一个账号下两个身份完全隔离，包括：

1. **身份上下文隔离**：为每个身份创建独立的上下文，存储该身份的所有相关信息
2. **IM用户账号隔离**：为每个身份创建独立的IM用户账号
3. **数据存储隔离**：为每个身份创建独立的存储空间
4. **代码使用隔离**：确保代码在运行时只使用当前身份的上下文

## 3. 架构设计

### 3.1 身份上下文管理

#### 3.1.1 数据结构

```javascript
// 身份上下文结构
const identityContext = {
  // 身份基本信息
  roleType: 'owner', // 'owner' 或 'host'
  roleId: 'role_123', // 身份唯一标识
  profile: {}, // 身份详细信息
  
  // IM用户信息
  imUserInfo: {
    userID: 'owner_123', // 身份专属的IM用户ID
    userSig: 'sig_123', // 身份专属的IM用户签名
    isLoggedIn: false // IM登录状态
  },
  
  // 数据存储信息
  storageInfo: {
    prefix: 'owner_', // 存储前缀
    keys: {} // 存储键值映射
  },
  
  // 其他上下文信息
  metadata: {} // 其他身份相关的元数据
}
```

#### 3.1.2 上下文管理模块

创建 `IdentityContextManager` 模块，用于管理不同身份的上下文：

- 存储和管理所有身份的上下文
- 提供切换身份的方法
- 提供获取当前身份上下文的方法
- 提供获取特定身份上下文的方法

### 3.2 IM用户账号隔离

#### 3.2.1 设计方案

为每个身份创建独立的IM用户账号：

- 宠物主人身份：使用 `owner_{openid}` 作为IM用户ID
- 寄养家庭身份：使用 `host_{openid}` 作为IM用户ID

#### 3.2.2 登录流程

1. 用户登录小程序
2. 初始化身份管理系统，获取所有身份信息
3. 为每个身份生成独立的IM用户ID和userSig
4. 切换到默认身份，登录该身份的IM账号
5. 身份切换时，退出当前IM账号，登录新身份的IM账号

### 3.3 数据存储隔离

#### 3.3.1 设计方案

为每个身份创建独立的存储空间：

- **本地存储隔离**：使用不同的前缀存储不同身份的数据
  - 宠物主人：`owner_{key}`
  - 寄养家庭：`host_{key}`

- **云存储隔离**：为每个身份创建独立的存储目录
  - 宠物主人：`owner/{openid}/`
  - 寄养家庭：`host/{openid}/`

#### 3.3.2 存储访问接口

创建统一的存储访问接口，自动根据当前身份选择对应的存储前缀：

- `setStorage(key, value)`：根据当前身份存储数据
- `getStorage(key)`：根据当前身份获取数据
- `removeStorage(key)`：根据当前身份删除数据

### 3.4 代码使用隔离

#### 3.4.1 设计方案

实现代码使用隔离，确保代码在运行时只使用当前身份的上下文：

- **身份感知组件**：修改组件，使其能够感知当前身份
- **身份感知API**：修改API调用，使其能够根据当前身份选择对应的参数
- **身份感知路由**：修改路由系统，使其能够根据当前身份选择对应的页面

#### 3.4.2 实现方式

- 使用 `IdentityContextManager` 获取当前身份上下文
- 在代码执行前检查当前身份
- 根据当前身份选择对应的代码路径

## 4. 实现方案

### 4.1 身份上下文管理模块

创建 `utils/identityContextManager.js` 文件：

```javascript
// 身份上下文管理器
class IdentityContextManager {
  constructor() {
    this.contexts = {}; // 存储所有身份的上下文
    this.currentRoleType = null; // 当前身份类型
  }
  
  // 添加身份上下文
  addContext(roleType, context) {
    this.contexts[roleType] = context;
  }
  
  // 获取当前身份上下文
  getCurrentContext() {
    return this.contexts[this.currentRoleType];
  }
  
  // 获取特定身份上下文
  getContext(roleType) {
    return this.contexts[roleType];
  }
  
  // 切换身份
  switchContext(roleType) {
    if (this.contexts[roleType]) {
      this.currentRoleType = roleType;
      return true;
    }
    return false;
  }
  
  // 初始化身份上下文
  initContexts(roles) {
    roles.forEach(role => {
      const context = {
        roleType: role.roleType,
        roleId: role._id,
        profile: role.profile,
        imUserInfo: {},
        storageInfo: {
          prefix: `${role.roleType}_`,
          keys: {}
        },
        metadata: {}
      };
      this.addContext(role.roleType, context);
    });
  }
}

module.exports = IdentityContextManager;
```

### 4.2 IM用户账号隔离

修改登录流程，为每个身份创建独立的IM用户账号：

```javascript
// 为每个身份生成IM用户账号
async generateIMAccountsForRoles(roles, openid) {
  const accounts = [];
  
  for (const role of roles) {
    const imUserID = `${role.roleType}_${openid}`;
    const userSig = await this.generateUserSig(imUserID);
    
    accounts.push({
      roleType: role.roleType,
      userID: imUserID,
      userSig: userSig
    });
  }
  
  return accounts;
}

// 登录特定身份的IM账号
async loginIMForRole(roleType) {
  const context = this.identityContextManager.getContext(roleType);
  if (!context) return false;
  
  const { userID, userSig } = context.imUserInfo;
  if (!userID || !userSig) return false;
  
  try {
    await wx.$TUIKit.login({ userID, userSig });
    context.imUserInfo.isLoggedIn = true;
    return true;
  } catch (error) {
    console.error(`登录${roleType}身份的IM账号失败:`, error);
    return false;
  }
}
```

### 4.3 数据存储隔离

创建 `utils/storageManager.js` 文件：

```javascript
// 存储管理器
class StorageManager {
  constructor(identityContextManager) {
    this.identityContextManager = identityContextManager;
  }
  
  // 根据当前身份存储数据
  setStorage(key, value) {
    const context = this.identityContextManager.getCurrentContext();
    if (!context) return false;
    
    const storageKey = `${context.storageInfo.prefix}${key}`;
    try {
      wx.setStorageSync(storageKey, value);
      return true;
    } catch (error) {
      console.error('存储数据失败:', error);
      return false;
    }
  }
  
  // 根据当前身份获取数据
  getStorage(key) {
    const context = this.identityContextManager.getCurrentContext();
    if (!context) return null;
    
    const storageKey = `${context.storageInfo.prefix}${key}`;
    try {
      return wx.getStorageSync(storageKey);
    } catch (error) {
      console.error('获取数据失败:', error);
      return null;
    }
  }
  
  // 根据当前身份删除数据
  removeStorage(key) {
    const context = this.identityContextManager.getCurrentContext();
    if (!context) return false;
    
    const storageKey = `${context.storageInfo.prefix}${key}`;
    try {
      wx.removeStorageSync(storageKey);
      return true;
    } catch (error) {
      console.error('删除数据失败:', error);
      return false;
    }
  }
  
  // 清除当前身份的所有存储数据
  clearStorage() {
    const context = this.identityContextManager.getCurrentContext();
    if (!context) return false;
    
    try {
      const keys = wx.getStorageInfoSync().keys;
      const prefix = context.storageInfo.prefix;
      
      keys.forEach(key => {
        if (key.startsWith(prefix)) {
          wx.removeStorageSync(key);
        }
      });
      
      return true;
    } catch (error) {
      console.error('清除存储数据失败:', error);
      return false;
    }
  }
}

module.exports = StorageManager;
```

### 4.4 身份切换流程

修改身份切换流程，确保切换时完全切换到目标身份的上下文：

```javascript
// 切换身份
async switchRole(targetRoleType) {
  try {
    // 1. 退出当前身份的IM账号
    const currentContext = this.identityContextManager.getCurrentContext();
    if (currentContext && currentContext.imUserInfo.isLoggedIn) {
      await wx.$TUIKit.logout();
      currentContext.imUserInfo.isLoggedIn = false;
    }
    
    // 2. 调用云函数切换身份
    const res = await wx.cloud.callFunction({
      name: 'switchRole',
      data: { targetRoleType }
    });
    
    if (res.result.code === 1) {
      // 3. 切换身份上下文
      this.identityContextManager.switchContext(targetRoleType);
      
      // 4. 登录目标身份的IM账号
      const targetContext = this.identityContextManager.getCurrentContext();
      if (targetContext && targetContext.imUserInfo.userID && targetContext.imUserInfo.userSig) {
        await this.loginIMForRole(targetRoleType);
      }
      
      // 5. 更新全局状态
      this.globalData.currentRole = res.result.data.currentRole;
      this.globalData.currentProfile = res.result.data.currentProfile;
      this.globalData.userRole = targetRoleType;
      
      console.log('身份切换成功:', targetRoleType);
      return { success: true, message: '切换成功' };
    } else {
      console.error('身份切换失败:', res.result.message);
      return { success: false, message: res.result.message };
    }
  } catch (error) {
    console.error('切换身份失败:', error);
    return { success: false, message: '切换失败' };
  }
}
```

## 5. 集成方案

### 5.1 小程序初始化

修改 `app.js`，集成身份隔离架构：

```javascript
// app.js
App({
  onLaunch() {
    // 初始化身份上下文管理器
    this.identityContextManager = new IdentityContextManager();
    
    // 初始化存储管理器
    this.storageManager = new StorageManager(this.identityContextManager);
    
    // 初始化其他模块
    this.initIMService();
    this.initIdentitySystem();
  },
  
  // 其他方法...
});
```

### 5.2 登录流程

修改登录流程，为每个身份创建独立的IM用户账号：

```javascript
// 登录流程
async callLoginCloudFunction() {
  try {
    // 1. 调用登录云函数
    const cloudRes = await wx.cloud.callFunction({
      name: 'login',
      data: { code: loginCode }
    });
    
    if (cloudRes.result.code === 1) {
      const userInfo = cloudRes.result.data.userInfo;
      const roles = cloudRes.result.data.roles;
      
      // 2. 初始化身份上下文
      this.identityContextManager.initContexts(roles);
      
      // 3. 为每个身份生成IM用户账号
      const imAccounts = await this.generateIMAccountsForRoles(roles, userInfo.openid);
      
      // 4. 更新身份上下文的IM用户信息
      imAccounts.forEach(account => {
        const context = this.identityContextManager.getContext(account.roleType);
        if (context) {
          context.imUserInfo = {
            userID: account.userID,
            userSig: account.userSig,
            isLoggedIn: false
          };
        }
      });
      
      // 5. 切换到默认身份
      const defaultRoleType = roles[0].roleType;
      await this.switchRole(defaultRoleType);
      
      return { success: true, userInfo };
    } else {
      return { success: false, message: cloudRes.result.message };
    }
  } catch (error) {
    console.error('登录失败:', error);
    return { success: false, message: '登录失败' };
  }
}
```

## 6. 测试方案

### 6.1 功能测试

1. **身份上下文隔离测试**：验证不同身份的上下文是否完全隔离
2. **IM用户账号隔离测试**：验证不同身份是否使用独立的IM用户账号
3. **数据存储隔离测试**：验证不同身份的数据是否存储在独立的空间
4. **代码使用隔离测试**：验证代码是否只使用当前身份的上下文

### 6.2 集成测试

1. **登录流程测试**：测试登录时是否为每个身份创建独立的IM用户账号
2. **身份切换测试**：测试身份切换时是否完全切换到目标身份的上下文
3. **数据存储测试**：测试不同身份的数据是否正确存储和获取
4. **IM功能测试**：测试不同身份的IM功能是否正常

## 7. 总结

本设计方案通过以下方式实现身份隔离：

1. **身份上下文管理**：为每个身份创建独立的上下文，存储该身份的所有相关信息
2. **IM用户账号隔离**：为每个身份创建独立的IM用户账号，使用不同的用户ID
3. **数据存储隔离**：为每个身份创建独立的存储空间，使用不同的存储前缀
4. **代码使用隔离**：确保代码在运行时只使用当前身份的上下文

通过这种设计，实现了一个账号下两个身份完全隔离，每个身份都有自己独立的IM用户账号、存储空间和代码上下文，确保了不同身份之间的数据和代码使用完全隔离。
