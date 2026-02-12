# IM身份切换问题修复报告

## 问题描述

用户切换身份（如从 owner 切换到 host）时，IM SDK 无法正确切换到新角色的账号，导致以下错误：

```
code:2024 message:用户未登录 | getConversationList | 接口调用时机不合理，请等待 SDK 处于 ready 状态后再调用（监听 TencentCloudChat.EVENT.SDK_READY 事件）
```

**根本原因：**

1. **错误的 IM 用户 ID 使用**：
   - `switchIMAccount` 函数使用 `userInfo.userID || generateId(targetRoleType, openid)`
   - `userInfo.userID` 可能是之前缓存的 owner 角色的 ID
   - 切换到 host 角色时，应该使用 host 角色的 ID，而不是 owner 角色的 ID

2. **过早调用 API**：
   - 消息页面在 `onShow` 时直接调用 `loadConversations()`
   - 此时 IM SDK 可能还未完成身份切换和登录
   - 需要等待 SDK_READY 事件后再调用 API

## 修复方案

### 修复 1：确保每次切换身份都生成新角色的 IM ID

**文件**: `app.js` (第 1406-1411 行)

**修改前**:
```javascript
const openid = userInfo.openid

// 优先使用云函数返回的标准化userID，只有在没有时才生成新的ID
let imUserID = userInfo.userID || generateId(targetRoleType, openid)
console.log('[switchIMAccount] 使用的IM用户ID:', imUserID)
console.log('[switchIMAccount] ID长度:', imUserID.length)
```

**修改后**:
```javascript
const openid = userInfo.openid

// 为目标角色生成IM用户ID（每次切换身份都生成新角色的ID，不使用缓存的ID）
let imUserID = generateId(targetRoleType, openid)
console.log('[switchIMAccount] 为目标角色生成IM用户ID:', targetRoleType, '->', imUserID)
console.log('[switchIMAccount] ID长度:', imUserID.length)
```

**说明**: 每次切换身份时，都为新的目标角色生成对应的 IM 用户 ID，不使用缓存的旧角色 ID。

---

### 修复 2：等待 IM SDK ready 后再加载会话列表

**文件**: `pages/messages/index.js`

#### 2.1 修改 `onShow` 方法 (第 37-58 行)

**修改前**:
```javascript
async onShow() {
  console.log('消息页面onShow触发');
  
  // 检查登录状态
  const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
  this.setData({
    isLoggedIn: !!userInfo && !!userInfo._id
  });
  
  // 只有已登录用户才初始化IM服务和加载会话列表
  if (this.data.isLoggedIn) {
    console.log('用户已登录，开始初始化IM服务和加载会话列表');
    await this.initIMIfNeeded();
    // 强制加载会话列表，确保重新编译后能正确显示
    console.log('强制加载会话列表...');
    await this.loadConversations(false, true); // 强制加载，忽略重复加载检查
  } else {
    console.log('用户未登录，跳过IM服务初始化和会话列表加载');
  }
},
```

**修改后**:
```javascript
async onShow() {
  console.log('消息页面onShow触发');
  
  // 检查登录状态
  const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
  this.setData({
    isLoggedIn: !!userInfo && !!userInfo._id
  });
  
  // 只有已登录用户才初始化IM服务和加载会话列表
  if (this.data.isLoggedIn) {
    console.log('用户已登录，开始初始化IM服务和等待IM ready');
    await this.initIMIfNeeded();
    // 等待IM SDK ready后再加载会话列表
    this.waitForIMReadyAndLoadConversations();
  } else {
    console.log('用户未登录，跳过IM服务初始化和会话列表加载');
  }
},
```

#### 2.2 新增 `waitForIMReadyAndLoadConversations` 方法 (第 60-81 行)

```javascript
/**
 * 等待IM SDK ready后加载会话列表
 */
waitForIMReadyAndLoadConversations() {
  const imManager = require('../../utils/imSingleton');
  
  // 检查IM SDK是否已ready且已登录
  if (imManager.isReady() && imManager.isLoggedIn()) {
    console.log('IM SDK已ready且已登录，直接加载会话列表');
    this.loadConversations(false, true); // 强制加载
  } else {
    console.log('IM SDK未ready或未登录，等待ready事件...');
    // 监听SDK_READY事件
    const onReady = () => {
      console.log('收到SDK_READY事件，开始加载会话列表');
      this.loadConversations(false, true); // 强制加载
      // 移除事件监听
      imManager.offReady(onReady);
    };
    imManager.onReady(onReady);
  }
},
```

**说明**: 在调用 IM SDK API 之前，先检查 SDK 是否已 ready 且用户已登录。如果未 ready，则监听 SDK_READY 事件，等待 ready 后再调用。

---

### 修复 3：添加 SDK_READY 事件监听的便捷方法

**文件**: `utils/imSingleton.js` (第 760-780 行)

**新增方法**:
```javascript
/**
 * 监听SDK_READY事件
 * @param {Function} handler 处理函数
 */
onReady(handler) {
  this.on('SDK_READY', handler)
}

/**
 * 移除SDK_READY事件监听
 * @param {Function} handler 处理函数
 */
offReady(handler) {
  this.off('SDK_READY', handler)
}
```

**说明**: 为 SDK_READY 事件提供便捷的监听和移除方法，方便页面组件使用。

---

## 技术细节

### IM 用户 ID 生成规则

使用 `generateId(roleType, openid)` 函数生成 IM 用户 ID：

- **格式**: `{roleType}_{openidHash}{timestamp}{random}`
- **示例**: 
  - owner: `own_abc1234xyz1234randomchars12345678`
  - host: `hst_abc1234xyz1234randomchars12345678`
- **长度**: 固定 30 字节
- **字符集**: 只包含字母、数字和下划线

**不同角色 = 不同 IM 账号**

- owner 角色和 host 角色使用完全不同的 IM 账号
- 切换身份时，需要先退出当前账号，再登录新角色的账号
- 这样可以确保不同角色的消息完全隔离

### SDK 状态机

```
UNINITIALIZED → INITIALIZING → READY → LOGGING_IN → LOGGED_IN
                                        ↓
                                        ERROR / NOT_LOGGED_IN / DISCONNECTED
```

**关键状态说明**:
- `READY`: SDK 已初始化并就绪，可以接受 API 调用
- `LOGGED_IN`: 用户已登录，可以正常使用 IM 功能
- `ERROR`: 发生错误，需要检查错误信息
- `DISCONNECTED`: 网络断开，等待重连

**SDK_READY 事件**:
- 在 SDK 完成初始化后触发
- 此时 SDK 处于 READY 状态
- 可以安全地调用 API（如 getConversationList）

---

## 测试验证

### 测试场景 1：切换身份后加载会话列表

**步骤**:
1. 以 owner 身份登录
2. 进入消息页面，查看会话列表（应该正常显示）
3. 切换到 host 身份
4. 再次进入消息页面

**预期结果**:
- ✅ 无 "用户未登录" 错误
- ✅ 显示 host 角色的会话列表
- ✅ IM SDK 正确切换到 host 账号

### 测试场景 2：身份切换过程中的日志

**预期日志**:
```
APP switchRole - 切换IM用户账号: host
[switchIMAccount] 为目标角色生成IM用户ID: host -> hst_abc1234...
[switchIMAccount] 退出当前账号: host
[IMSingleton] 开始登出
[IMSingleton] 状态变更: uninitialized -> ready
[switchIMAccount] 开始登录IM账号: hst_abc1234...
[IMSingleton] SDK_READY事件触发
[IMSingleton] 状态变更: ready -> logged_in
[switchIMAccount] IM账号登录成功: hst_abc1234...
消息页面onShow触发
IM SDK已ready且已登录，直接加载会话列表
```

### 测试场景 3：网络断开重连

**步骤**:
1. 打开消息页面
2. 断开网络
3. 重新连接网络

**预期结果**:
- ✅ 网络断开时显示提示
- ✅ 网络恢复后自动重连
- ✅ 会话列表自动刷新

---

## 相关文件清单

| 文件 | 修改类型 | 说明 |
|-----|---------|------|
| `app.js` | 修改 | 修复 switchIMAccount 函数中的 IM ID 生成逻辑 |
| `pages/messages/index.js` | 修改 | 添加等待 SDK ready 的逻辑 |
| `utils/imSingleton.js` | 新增 | 添加 onReady/offReady 便捷方法 |

---

## 总结

通过以上三处修复：

1. ✅ **解决了身份切换时 IM 账号混淆的问题**
   - 每次切换身份都生成新角色的 IM ID
   - 不再使用缓存的旧角色 ID

2. ✅ **解决了 API 调用时机不正确的问题**
   - 等待 SDK ready 后再调用 API
   - 避免了 "用户未登录" 和 "SDK 未就绪" 错误

3. ✅ **提供了更清晰的 SDK 事件监听接口**
   - onReady/offReady 方法方便使用
   - 更好的代码可读性和维护性

---

## 后续建议

1. **监控日志**: 持续监控身份切换和登录流程的日志
2. **单元测试**: 为 identityManager 和 imSingleton 添加单元测试
3. **错误处理**: 完善各种边界情况的错误处理
4. **性能优化**: 考虑添加身份切换的防抖机制，避免快速切换导致的异常
