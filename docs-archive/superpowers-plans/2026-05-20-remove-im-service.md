# 移除 IM 服务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完全移除项目中所有腾讯云 IM（即时通信）相关代码、文件、依赖和配置，使项目不再依赖 IM 服务。

**Architecture:** 分层清理——先删除独立的 IM 专用文件/目录（TUIKit、IMSingleton、IMManager 等），再修改引用了 IM 的业务文件（app.js、AuthService、custom-tab-bar 等），最后清理云函数中的 IM 代码和 npm 依赖。每个 Task 聚焦一个模块，确保删除后项目不会因缺少引用而报错。

**Tech Stack:** 微信小程序、云函数（Node.js）、腾讯云 IM SDK（@tencentcloud/chat、tim-upload-plugin、tim-profanity-filter-plugin、tls-sig-api-v2）

---

## 影响范围总览

### 需要删除的文件/目录

| 路径 | 说明 |
|---|---|
| `TUIKit/` | 用户端 TUIKit 组件目录（约 100+ 文件） |
| `admin/TUIKit/` | 管理端 TUIKit 组件目录（约 120+ 文件） |
| `services/IMSingleton.js` | IM SDK 单例管理器 |
| `services/IMManager.js` | IM 管理器 |
| `services/IMCredentials.js` | IM 凭证管理 |
| `services/im/` | IM 子模块目录（state-manager、degradation、event-emitter、constants） |
| `config/im.js` | IM 配置文件 |

### 需要修改的文件

| 路径 | 修改内容 |
|---|---|
| `app.js` | 移除 IM 初始化、懒加载注册、ensureIMServiceInitialized、updateIMUserProfile |
| `app.json` | 移除 `pages/chat/index` 页面注册；`pages/messages/index` 保留但改造 |
| `package.json` | 移除 @tencentcloud/chat、tim-upload-plugin、tim-profanity-filter-plugin 依赖 |
| `services/AuthService.js` | 移除所有 IM 登录/凭证/同步逻辑 |
| `config/storageKeys.js` | 移除 IM_USER_SIG、IM_USER_SIG_EXPIRY、IM_SDK_APP_ID |
| `config/env.js` | 移除 imSdkAppId 配置 |
| `custom-tab-bar/index.js` | 移除 IM 未读消息计数和事件监听 |
| `pages/messages/index.js` | 重写为非 IM 的消息/通知页面 |
| `pages/messages/index.wxml` | 重写模板 |
| `pages/messages/index.wxss` | 重写样式 |
| `pages/messages/index.json` | 移除 TUIKit 组件引用 |
| `pages/chat/index.js` | 删除或重写（IM 聊天页面不再需要） |
| `pages/chat/index.wxml` | 删除或重写 |
| `pages/chat/index.wxss` | 删除或重写 |
| `pages/chat/index.json` | 删除或重写 |
| `subpackages/booking/host-detail.js` | 移除联系房东（IM 聊天）功能 |
| `utils/appStartupOptimizer.js` | 移除 IM 相关缓存清理和 imUserId 恢复 |
| `cloudfunctions/common/config.js` | 移除 IM_SDK_APP_ID、IM_SECRET_KEY、IM_EXPIRE_TIME |
| `cloudfunctions/userService/auth.js` | 移除 generateUserSig、_requestIMREST、importIMAccount、genUserSig |
| `cloudfunctions/userService/index.js` | 移除 IM 相关导入和 genUserSig handler |
| `cloudfunctions/userService/package.json` | 移除 tls-sig-api-v2 依赖 |
| `cloudfunctions/adminService/services/auth.js` | 移除 _requestIMREST、importIMAccount、generateAdminUserSig、refreshUserSig |
| `cloudfunctions/adminService/package.json` | 移除 tls-sig-api-v2 依赖 |
| `admin/app.js` | 移除 IM 初始化逻辑 |
| `admin/custom-tab-bar/index.js` | 移除 IM 事件监听 |
| `admin/pages/message/` | 移除 IM 消息页面 |
| `admin/services/IMCredentials.js` | 删除 |

---

### Task 1: 删除用户端 IM 专用文件和目录

**Files:**
- Delete: `TUIKit/` 目录（整个目录）
- Delete: `services/IMSingleton.js`
- Delete: `services/IMManager.js`
- Delete: `services/IMCredentials.js`
- Delete: `services/im/` 目录（state-manager.js、degradation.js、event-emitter.js、constants.js）
- Delete: `config/im.js`

- [ ] **Step 1: 删除 TUIKit 目录**

```bash
rm -rf TUIKit/
```

- [ ] **Step 2: 删除 IM 服务文件**

```bash
rm -f services/IMSingleton.js services/IMManager.js services/IMCredentials.js
rm -rf services/im/
rm -f config/im.js
```

- [ ] **Step 3: 验证文件已删除**

```bash
ls TUIKit/ services/IMSingleton.js services/IMManager.js services/IMCredentials.js services/im/ config/im.js 2>&1
```

Expected: 全部显示 "No such file or directory"

---

### Task 2: 清理 app.js 中的 IM 代码

**Files:**
- Modify: `app.js`

- [ ] **Step 1: 移除 IM 相关导入**

删除以下行：
```js
const imCredentials = require('./services/IMCredentials');  // 第3行
const TencentCloudChat = require('@tencentcloud/chat')       // 第9行
wx.TencentCloudChat = TencentCloudChat                       // 第10行
let imManager = null                                          // 第13行
```

- [ ] **Step 2: 移除 globalData 中的 IM 字段**

从 globalData 中删除：
```js
imUserId: null,      // 第30行
imManager: null,     // 第31行
imInitialized: false, // 第34行
```

- [ ] **Step 3: 移除 _executeBackgroundStartup 中的 IM 配置获取**

删除整个 "从云函数获取 IM SDK AppID" 的 try-catch 块（约第122-140行），以及会话恢复中的 `imCredentials.clear()` 调用和 `this.globalData.imUserId = null` 赋值。

- [ ] **Step 4: 移除 _registerLazyModules 方法**

删除整个 `_registerLazyModules()` 方法（约第190-199行）。

- [ ] **Step 5: 移除 ensureIMServiceInitialized 方法**

删除整个 `ensureIMServiceInitialized()` 方法（约第202-213行）。

- [ ] **Step 6: 移除 updateIMUserProfile 方法**

删除整个 `updateIMUserProfile()` 方法（约第259-285行）。

- [ ] **Step 7: 移除 onLaunch 中 _registerLazyModules 调用**

从 `onLaunch` 方法中删除 `this._registerLazyModules();` 调用（约第59行）。

---

### Task 3: 清理 AuthService 中的 IM 代码

**Files:**
- Modify: `services/AuthService.js`

- [ ] **Step 1: 移除 IM 相关导入**

删除：
```js
const imCredentials = require('./IMCredentials')  // 第26行
```

从 storageKeys 导入中移除 `IM_USER_SIG, IM_USER_SIG_EXPIRY, IM_SDK_APP_ID`。

删除常量：
```js
const IM_USERSIG_EXPIRY_MS = 24 * 3600 * 1000  // 第30行
```

- [ ] **Step 2: 移除 tryRestoreSession 中的 IM 凭证恢复逻辑**

删除整个 IM 凭证恢复部分（约第119-176行），包括 `_fetchIMCredentials`、`_applyIMCredentials`、`_autoLoginIM` 调用。保留核心的会话恢复逻辑（检查 isLogout、loginExpiry、cachedUserInfo）。

- [ ] **Step 3: 移除 _autoLoginIM 方法**

删除整个 `_autoLoginIM()` 方法（约第186-198行）。

- [ ] **Step 4: 移除 _applyIMCredentials 方法**

删除整个 `_applyIMCredentials()` 方法（约第200-202行）。

- [ ] **Step 5: 移除 loginToIM 方法**

删除整个 `loginToIM()` 方法（约第434-494行）。

- [ ] **Step 6: 移除 _syncUserProfileToIM 方法**

删除整个 `_syncUserProfileToIM()` 方法（约第496-530行）。

- [ ] **Step 7: 移除 refreshUserSig 方法**

删除整个 `refreshUserSig()` 方法（约第532-570行）。

- [ ] **Step 8: 移除 _fetchIMCredentials 方法**

删除整个 `_fetchIMCredentials()` 方法（约第407-432行）。

- [ ] **Step 9: 修改 _doLogin 方法**

移除 `const imResult = await this.loginToIM()` 调用和后续的 imResult 判断逻辑，简化为直接返回登录成功。

- [ ] **Step 10: 修改 _applyToGlobal 方法**

移除 `this._applyIMCredentials(data.imUserId, data.userSig)` 调用和 `app.globalData.imUserId = data.imUserId` 赋值。

- [ ] **Step 11: 修改 _persistLoginState 方法**

移除 IM 凭证持久化部分（约第381-388行），移除 userSig 相关的 Storage 操作。

- [ ] **Step 12: 修改 logout 方法**

移除 IM 登出逻辑（约第616-621行），移除 `wx.removeStorageSync(IM_USER_SIG)` 和 `wx.removeStorageSync(IM_SDK_APP_ID)`，移除 `imCredentials.clear()` 和 `app.globalData.imUserId = null`。

---

### Task 4: 清理 config 文件中的 IM 配置

**Files:**
- Modify: `config/storageKeys.js`
- Modify: `config/env.js`

- [ ] **Step 1: 修改 storageKeys.js**

从 `STORAGE_KEYS.AUTH` 中删除：
```js
IM_USER_SIG: 'central:imUserSig',
IM_USER_SIG_EXPIRY: 'central:imUserSigExpiry',
IM_SDK_APP_ID: 'central:imSdkAppId',
```

- [ ] **Step 2: 修改 env.js**

从三个环境配置中删除 `imSdkAppId` 字段，删除 `config.imSdkAppId = envSecrets.imSdkAppId || config.imSdkAppId` 行。

---

### Task 5: 清理 custom-tab-bar 中的 IM 代码

**Files:**
- Modify: `custom-tab-bar/index.js`

- [ ] **Step 1: 移除 IM 事件监听和未读消息计数**

删除 data 中的 IM 相关字段：`_boundOnIMLoginSuccess`、`_boundOnConversationListUpdated`、`_listenersRegistered`、`unreadCount`。

- [ ] **Step 2: 移除 attached 中的 IM 监听器注册**

删除 `app.on('imLoginSuccess', ...)` 和 `wx.$TUIKit.on(wx.TencentCloudChat.EVENT.CONVERSATION_LIST_UPDATED, ...)` 注册。

- [ ] **Step 3: 移除 detached 中的 IM 监听器注销**

删除 `app.off('imLoginSuccess', ...)` 和 `wx.$TUIKit.off(...)` 注销。

- [ ] **Step 4: 移除 IM 相关方法**

删除 `updateUnreadCount()`、`_waitForSDKReadyAndUpdate()`、`onConversationListUpdated()`、`onIMLoginSuccess()` 方法。

- [ ] **Step 5: 移除 attached 中的 IM 状态检查**

删除 `const imManager = wx.$IMManager;` 及其后续的 IM 登录状态检查逻辑。

---

### Task 6: 重写 messages 页面（移除 IM 依赖）

**Files:**
- Modify: `pages/messages/index.js`
- Modify: `pages/messages/index.wxml`
- Modify: `pages/messages/index.wxss`
- Modify: `pages/messages/index.json`

- [ ] **Step 1: 重写 index.js**

移除所有 IM 相关导入和逻辑，改为简单的通知/消息占位页面：

```js
const tabBarSyncBehavior = require('../../behaviors/tabBarSync');

Page({
  behaviors: [tabBarSyncBehavior],
  data: {
    statusBarHeight: 20
  },
  onLoad() {
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight || 20 });
  },
  onShow() {
    this._syncTabBar()
  },
})
```

- [ ] **Step 2: 重写 index.wxml**

```xml
<view class="message-container" style="padding-top: {{statusBarHeight + 44}}px;">
  <view class="empty-state">
    <view class="empty-icon">📭</view>
    <view class="empty-text">暂无消息</view>
  </view>
</view>
```

- [ ] **Step 3: 重写 index.wxss**

```css
page { height: 100vh; }
.message-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.empty-state { text-align: center; }
.empty-icon { font-size: 64rpx; margin-bottom: 20rpx; }
.empty-text { color: #999; font-size: 28rpx; }
```

- [ ] **Step 4: 修改 index.json**

移除 TUIKit 组件引用：
```json
{
  "navigationBarTitleText": "消息"
}
```

---

### Task 7: 处理 chat 页面

**Files:**
- Modify: `app.json` — 移除 `pages/chat/index` 页面注册
- Modify: `pages/chat/index.js` — 重写为空页面或跳转页
- Modify: `pages/chat/index.wxml` — 重写
- Modify: `pages/chat/index.json` — 移除 TUIChat 组件引用
- Modify: `pages/chat/index.wxss` — 简化

- [ ] **Step 1: 从 app.json 移除 chat 页面**

从 `pages` 数组中删除 `"pages/chat/index"`。

- [ ] **Step 2: 重写 chat/index.js**

```js
Page({
  onLoad() {
    wx.showToast({ title: '聊天功能已下线', icon: 'none' })
    setTimeout(() => wx.navigateBack({ delta: 1 }), 1500)
  }
})
```

- [ ] **Step 3: 重写 chat/index.wxml**

```xml
<view class="chat-page"></view>
```

- [ ] **Step 4: 修改 chat/index.json**

```json
{
  "navigationBarTitleText": "聊天"
}
```

- [ ] **Step 5: 简化 chat/index.wxss**

```css
.chat-page { width: 100%; height: 100%; }
```

---

### Task 8: 清理 subpackages/booking/host-detail.js 中的 IM 引用

**Files:**
- Modify: `subpackages/booking/host-detail.js`

- [ ] **Step 1: 移除联系房东的 IM 聊天功能**

将 `contactHost()` 方法中的 IM 聊天逻辑替换为客服电话或提示：

```js
contactHost() {
  const app = getApp()
  const authService = app.globalData.authService
  if (!authService || !authService.isLoggedIn()) {
    wx.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  wx.showToast({ title: '聊天功能暂未开放', icon: 'none' })
},
```

- [ ] **Step 2: 移除 imUserId 数据传递**

从 host 对象构建中移除 `imUserId: hostData.imUserId || ''` 行。

---

### Task 9: 清理 appStartupOptimizer 中的 IM 引用

**Files:**
- Modify: `utils/appStartupOptimizer.js`

- [ ] **Step 1: 移除 IM 缓存清理**

删除 `_initializeMinimalCoreModules` 中的 IM Storage 清理：
```js
wx.removeStorageSync(authKeys.IM_USER_SIG)
wx.removeStorageSync(authKeys.IM_USER_SIG_EXPIRY)
wx.removeStorageSync(authKeys.IM_SDK_APP_ID)
```

- [ ] **Step 2: 移除 imUserId 恢复**

删除 `app.globalData.imUserId = cachedUserInfo.imUserId || null` 行。

---

### Task 10: 清理云函数中的 IM 代码

**Files:**
- Modify: `cloudfunctions/common/config.js`
- Modify: `cloudfunctions/userService/auth.js`
- Modify: `cloudfunctions/userService/index.js`
- Modify: `cloudfunctions/userService/package.json`
- Modify: `cloudfunctions/adminService/services/auth.js`
- Modify: `cloudfunctions/adminService/package.json`

- [ ] **Step 1: 修改 cloudfunctions/common/config.js**

删除：
```js
const IM_SDK_APP_ID = parseInt(process.env.IM_SDK_APP_ID, 10) || 0
const IM_SECRET_KEY = process.env.IM_SECRET_KEY || ''
const IM_EXPIRE_TIME = 7 * 24 * 3600
```

从 module.exports 中删除 `IM_SDK_APP_ID`、`IM_SECRET_KEY`、`IM_EXPIRE_TIME`。

- [ ] **Step 2: 修改 cloudfunctions/userService/auth.js**

- 删除 `const https = require('https')`
- 删除 `const TLSSigAPIv2 = require('tls-sig-api-v2')`
- 删除 `const { IM_SDK_APP_ID, IM_EXPIRE_TIME } = require('./common/config')` 中的 IM_SDK_APP_ID 和 IM_EXPIRE_TIME
- 删除 `generateUserSig()` 函数
- 删除 `_requestIMREST()` 函数
- 删除 `importIMAccount()` 函数
- 修改 `login()` 函数：移除 `userSig` 生成和 `importIMAccount` 调用，移除返回数据中的 `userSig` 字段
- 修改 `getIdentity()` 函数：移除 `userSig` 生成和返回
- 删除 `genUserSig()` 函数
- 修改 `getConfig()` 函数：移除 `imSdkAppId` 返回

- [ ] **Step 3: 修改 cloudfunctions/userService/index.js**

- 删除 `const { IM_SDK_APP_ID, IM_EXPIRE_TIME } = require('./common/config')`
- 删除 `const TLSSigAPIv2 = require('tls-sig-api-v2')`
- 从 handlers 中删除 `genUserSig: authHandlers.genUserSig`

- [ ] **Step 4: 修改 cloudfunctions/userService/package.json**

移除 `"tls-sig-api-v2": "^1.0.0"` 依赖。

- [ ] **Step 5: 修改 cloudfunctions/adminService/services/auth.js**

- 删除 `const https = require('https')`
- 删除 `const TLSSigAPIv2 = require('tls-sig-api-v2')`
- 修改 config 导入，移除 `IM_SDK_APP_ID, IM_EXPIRE_TIME, IM_SECRET_KEY`
- 删除 `_requestIMREST()` 函数
- 删除 `importIMAccount()` 函数
- 删除 `generateAdminUserSig()` 函数
- 修改 `checkAuth()`：移除 `generateAdminUserSig`、`importIMAccount` 调用，移除返回数据中的 `userSig` 和 `imUserId`
- 修改 `login()`：同上
- 删除 `refreshUserSig()` 函数
- 修改 `getConfig()`：移除 `imSdkAppId` 返回

- [ ] **Step 6: 修改 cloudfunctions/adminService/package.json**

移除 `"tls-sig-api-v2": "^1.0.2"` 依赖。

---

### Task 11: 清理 admin 目录中的 IM 代码

**Files:**
- Delete: `admin/TUIKit/` 目录
- Delete: `admin/services/IMCredentials.js`
- Modify: `admin/app.js`
- Modify: `admin/custom-tab-bar/index.js`
- Modify: `admin/pages/message/` 相关文件

- [ ] **Step 1: 删除 admin/TUIKit 目录**

```bash
rm -rf admin/TUIKit/
```

- [ ] **Step 2: 删除 admin/services/IMCredentials.js**

```bash
rm -f admin/services/IMCredentials.js
```

- [ ] **Step 3: 修改 admin/app.js**

移除所有 IM 初始化逻辑（TencentCloudChat 导入、IM 登录、imLoginSuccess 事件触发等）。

- [ ] **Step 4: 修改 admin/custom-tab-bar/index.js**

移除 `imLoginSuccess` 事件监听和注销。

- [ ] **Step 5: 修改 admin/pages/message/ 页面**

移除 IM 相关逻辑，改为占位页面。

---

### Task 12: 清理 package.json 中的 IM 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 移除 IM 相关 npm 依赖**

从 `dependencies` 中删除：
```json
"@tencentcloud/chat": "^3.6.6",
"tim-upload-plugin": "^1.3.0",
"tim-profanity-filter-plugin": "^1.1.0"
```

- [ ] **Step 2: 删除 node_modules 中对应的包**

```bash
rm -rf node_modules/@tencentcloud node_modules/tim-upload-plugin node_modules/tim-profanity-filter-plugin
```

---

### Task 13: 清理云函数中的 IM 残留引用

**Files:**
- Modify: `cloudfunctions/activityService/index.js` — 移除 `creatorIMUserId` 查询
- Modify: `cloudfunctions/utilityService/index.js` — 移除 `imUserId` 生成逻辑
- Modify: `cloudfunctions/orderService/orders.js` — 移除 `hostIMUserId` 赋值

- [ ] **Step 1: 修改 activityService/index.js**

移除获取 `creatorIMUserId` 的数据库查询（约第272-283行）。

- [ ] **Step 2: 修改 utilityService/index.js**

移除 `imUserId` 生成和更新逻辑（约第89-99行）。

- [ ] **Step 3: 修改 orderService/orders.js**

移除 `hostIMUserId` 赋值（约第84行和第120行）。

---

### Task 14: 最终验证

- [ ] **Step 1: 全局搜索 IM 残留引用**

```bash
grep -rn "TencentCloudChat\|IMSingleton\|IMManager\|IMCredentials\|\$TUIKit\|\$IMState\|\$IMManager\|account_import\|importIMAccount\|tls-sig-api-v2\|tim-upload-plugin\|tim-profanity-filter\|@tencentcloud/chat" --include="*.js" --include="*.json" .
```

Expected: 无匹配结果（或仅 miniprogram_npm 中的残留，需清理）

- [ ] **Step 2: 清理 miniprogram_npm 中的 IM 包**

```bash
rm -rf miniprogram_npm/@tencentcloud miniprogram_npm/tim-upload-plugin miniprogram_npm/tim-profanity-filter-plugin
```

- [ ] **Step 3: 验证项目结构完整性**

确认 app.json 中所有注册的页面文件都存在，没有引用已删除的组件。

- [ ] **Step 4: 提交代码**

```bash
git add -A
git commit -m "refactor: 移除全部 IM（即时通信）服务相关代码和依赖"
```
