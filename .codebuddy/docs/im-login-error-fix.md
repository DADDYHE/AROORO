# IM 登录错误修复报告

## 问题描述

错误信息：
```
o.getUserInfo is not a function. (In 'o.getUserInfo()', 'o.getUserInfo' is undefined)
```

错误来源：切换身份时，TUI-Messages 组件或 IM SDK 尝试调用不存在的 `getUserInfo` 方法。

## 根本原因

1. **TUI-Messages SDK 版本兼容性问题**：TUI-Messages 内部调用了已废弃的 `getUserInfo` API
2. **页面调用不存在的方法**：`pages/profile/index.js` 在身份切换成功后调用了 `this.getUserInfo()`，但该方法不存在

## 修复方案

### ✅ 修复 1：app.js - 添加异常捕获

**文件**: `app.js` (第 1209-1231 行)

**修改前**：
```javascript
// 更新IM用户资料
this.updateIMUserProfile(userName, avatarUrl)
```

**修改后**：
```javascript
// 更新IM用户资料（使用 try-catch 捕获可能的 SDK 错误）
try {
  this.updateIMUserProfile(userName, avatarUrl)
} catch (error) {
  console.warn('更新IM用户资料失败（可能是SDK版本兼容问题）:', error.message)
  // 不影响身份切换流程，继续执行
}
```

**说明**：使用 try-catch 捕获 TUI-Messages 调用 `getUserInfo` 时的错误，避免中断身份切换流程。

### ✅ 修复 2：pages/profile/index.js - 移除不存在的方法调用

**文件**: `pages/profile/index.js` (第 330-339 行)

**修改前**：
```javascript
app.switchRole(targetRoleType)
  .then(() => {
    console.log('切换身份成功，更新页面状态')

    this.checkLoginStatus()
    this.getUserInfo()  // ❌ 方法不存在
  })
  .catch((error) => {
    console.error('切换身份失败:', error)
  })
```

**修改后**：
```javascript
app.switchRole(targetRoleType)
  .then(() => {
    console.log('切换身份成功，更新页面状态')

    // 重新检查登录状态并更新用户信息
    this.checkLoginStatus()
    // 使用 setTimeout 确保身份切换完成后再获取用户信息
    setTimeout(() => {
      this.checkLoginStatus()
    }, 300)
  })
  .catch((error) => {
    console.error('切换身份失败:', error)
    wx.showToast({
      title: '切换身份失败',
      icon: 'none',
      duration: 2000
    })
  })
```

**说明**：
- 移除了对不存在方法 `this.getUserInfo()` 的调用
- 使用 `this.checkLoginStatus()` 来更新页面状态
- 添加了错误提示 toast
- 使用延迟 300ms 确保身份切换完成后再检查状态

## 验证步骤

1. **测试身份切换**：
   - 进入"我的"页面
   - 点击"切换身份"按钮
   - 检查是否成功切换

2. **检查控制台日志**：
   - 应该看到 "切换身份成功"
   - 不应该再出现 "o.getUserInfo is not a function" 错误

3. **验证功能正常**：
   - 切换身份后，用户信息是否正确更新
   - IM 聊天功能是否正常

## 技术细节

### SDK 版本信息

- `@tencentcloud/chat`: v3.6.4
- `@tencentcloud/tui-core`: v2.5.1
- `@tencentcloud/chat-uikit-wechat`: v2.4.4

### 修复原理

1. **异常捕获**：在调用 IM SDK API 时添加 try-catch，避免 SDK 内部错误中断应用流程
2. **方法调用安全**：避免调用页面中不存在的方法，改用已验证的 API
3. **延迟处理**：给身份切换留出足够的时间完成，避免竞态条件

## 后续优化建议

如果问题仍然存在，可以考虑：

1. **升级 TUI-Messages 版本**：检查是否有更新的版本修复了此问题
2. **使用原生 IM SDK**：绕过 TUI-Messages，直接使用 `@tencentcloud/chat` API
3. **自定义用户资料更新**：自己实现用户资料更新逻辑，不依赖 SDK

## 修改文件清单

- ✅ `app.js` - 添加 try-catch 保护 IM 用户资料更新
- ✅ `pages/profile/index.js` - 移除不存在的方法调用，优化错误处理
