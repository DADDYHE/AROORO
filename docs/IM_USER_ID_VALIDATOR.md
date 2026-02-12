# IM UserID 验证和规范化解决方案

## 概述

本解决方案提供了一套完整的 IM userID 验证和规范化机制，用于处理不符合腾讯云 IM 服务规范的 ID，防止因 ID 格式错误导致的消息发送失败。

## 问题背景

### IM UserID 规范要求

腾讯云 IM 对 userID 有以下严格要求：

- **格式**：`{roleType}_{identifier}`
  - `roleType`: `owner`、`host`、`guest`
  - `identifier`: 通常是 openid
- **最大长度**：32 字节
- **不允许字符**：`@`、`+`、`-`、`=`、`:`、空格

### 常见问题

1. **使用 MongoDB `_id` 作为 userID**
   - 错误示例：`owner_00329sc5ml4lkwcwf72rubru`
   - 正确示例：`owner_oNIhl17JEstp_WtKcSq-EUKa93qk`

2. **格式不匹配**
   - 缺少 `roleType` 前缀
   - 使用特殊字符（如 `@`、`-` 等）
   - 长度超过限制

3. **导致的问题**
   - 消息发送失败（错误码 20003）
   - 用户登录失败（错误码 70013）
   - 无法正常建立会话

## 解决方案架构

### 1. 核心工具类：`imUserIdValidator.js`

提供以下核心功能：

- `validateUserID(userID)` - 验证 userID 格式
- `normalizeUserID(identifier, roleType)` - 规范化 userID
- `generateUserIDFromUserInfo(userInfo)` - 从用户信息生成 userID
- `validateAndFixUserID(userID, options)` - 验证并自动修复 userID
- `showUserIDError(validationResult)` - 显示错误提示

### 2. 多层拦截机制

```
┌─────────────────────────────────────────────────────────┐
│  1. 会话列表页面：验证并过滤无效会话                     │
│     └─ 修复可自动修复的会话，过滤无法修复的              │
├─────────────────────────────────────────────────────────┤
│  2. 聊天页面：验证接收者 ID 格式                         │
│     └─ 自动修复接收者 ID，显示警告                      │
├─────────────────────────────────────────────────────────┤
│  3. 消息发送前：验证接收方 ID 格式                       │
│     └─ 拦截无效请求，防止消息发送失败                   │
└─────────────────────────────────────────────────────────┘
```

## 使用方法

### 基础使用

```javascript
const ImUserIdValidator = require('../../utils/imUserIdValidator')

// 1. 验证 userID
const validation = ImUserIdValidator.validateUserID('owner_oNIhl17JEstp_WtKcSq-EUKa93qk')
if (!validation.valid) {
  console.error('验证失败:', validation.error)
  return
}

// 2. 规范化 userID
const normalized = ImUserIdValidator.normalizeUserID('oNIhl17JEstp_WtKcSq-EUKa93qk', 'owner')
// 结果: 'owner_oNIhl17JEstp_WtKcSq-EUKa93qk'

// 3. 从用户信息生成 userID
const userID = ImUserIdValidator.generateUserIDFromUserInfo({
  openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
  role: 'owner'
})

// 4. 验证并自动修复
const result = ImUserIdValidator.validateAndFixUserID('00329sc5ml4lkwcwf72rubru')
if (result.valid) {
  console.log('修复后的 userID:', result.userID)
} else {
  console.error('无法修复:', result.error)
}

// 5. 显示错误提示
ImUserIdValidator.showUserIDError(validation)
```

### 在页面中使用

#### 示例 1：聊天页面

```javascript
const ImUserIdValidator = require('../../utils/imUserIdValidator')

Page({
  onLoad(options) {
    const rawReceiverId = options.recipientId

    // 验证并规范化接收者 ID
    const validation = ImUserIdValidator.validateUserID(rawReceiverId)
    if (!validation.valid) {
      const fixResult = ImUserIdValidator.validateAndFixUserID(rawReceiverId)
      if (fixResult.valid && fixResult.fixed) {
        console.log('自动修复:', fixResult.userID)
        this.setData({ receiverId: fixResult.userID })
      } else {
        wx.showToast({ title: '接收者信息错误', icon: 'none' })
        return
      }
    }
  }
})
```

#### 示例 2：消息发送前验证

```javascript
const ImUserIdValidator = require('../../utils/imUserIdValidator')

function sendMessage(to, text) {
  // 验证接收方 userID
  const validation = ImUserIdValidator.validateUserID(to)
  if (!validation.valid) {
    // 尝试自动修复
    const fixResult = ImUserIdValidator.validateAndFixUserID(to)
    if (fixResult.valid && fixResult.fixed) {
      to = fixResult.userID
    } else {
      ImUserIdValidator.showUserIDError(validation)
      return
    }
  }

  // 继续发送消息...
}
```

## 已集成功能

### 1. 消息发送拦截

**文件**：`TUI-Messages/TUIChat/components/MessageInput/index.js`

**功能**：在发送消息前验证接收方 userID 格式
- 自动修复可修复的 ID
- 拦截无法修复的请求
- 显示清晰的错误提示

### 2. 聊天页面处理

**文件**：`subpackages/other/messages/chat/chat.js`

**功能**：在页面加载时规范化接收者 ID
- 从 URL 参数获取 `recipientId`
- 验证并自动修复格式
- 更新 `conversationID`

### 3. 会话列表过滤

**文件**：`pages/messages/index.js`

**功能**：加载会话列表时验证每个会话的 userID
- 修复可自动修复的会话
- 过滤掉无法修复的无效会话

## 错误处理

### 常见错误及解决方案

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `userID 不能为空` | 未获取到用户信息 | 检查登录状态 |
| `userID 长度超过限制` | openid 过长 | 联系客服处理 |
| `userID 包含非法字符` | 包含特殊字符 | 使用 openid 重新生成 |
| `userID 格式不正确` | 格式不符合规范 | 使用 `normalizeUserID` 处理 |
| `无效的角色类型` | roleType 错误 | 检查用户角色设置 |

### 自动修复规则

工具类可以自动修复以下情况：

1. **MongoDB `_id` 格式**
   - 检测到 24 字符的 `_id` 格式
   - 提示需要使用 openid

2. **缺少 roleType 前缀**
   - 自动添加默认 roleType（owner）

3. **包含可转换的特殊字符**
   - `@`、`+`、`-`、`=`、`:`、空格 → 转换为 `_`

4. **长度超限**
   - 自动截断为最大允许长度

## 最佳实践

### 1. 统一生成 userID

```javascript
// 在登录时生成并保存标准的 userID
const userInfo = {
  openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
  role: 'owner'
}

const imUserID = ImUserIdValidator.generateUserIDFromUserInfo(userInfo)
app.globalData.userInfo.userID = imUserID
```

### 2. 在每个关键点验证

```javascript
// 从数据库获取用户信息后
// 从 URL 参数接收 ID 后
// 发送消息前
// 跳转聊天页面前
```

### 3. 提供友好的错误提示

```javascript
try {
  const userID = ImUserIdValidator.normalizeUserID(...)
} catch (error) {
  wx.showModal({
    title: '提示',
    content: '用户信息格式错误，请重新登录',
    showCancel: false
  })
}
```

## 测试用例

```javascript
// 测试验证
console.log(ImUserIdValidator.validateUserID('owner_oNIhl17JEstp_WtKcSq-EUKa93qk'))
// { valid: true }

console.log(ImUserIdValidator.validateUserID('00329sc5ml4lkwcwf72rubru'))
// { valid: false, error: '...' }

// 测试规范化
console.log(ImUserIdValidator.normalizeUserID('oNIhl17JEstp_WtKcSq-EUKa93qk', 'owner'))
// 'owner_oNIhl17JEstp_WtKcSq-EUKa93qk'

// 测试自动修复
console.log(ImUserIdValidator.validateAndFixUserID('00329sc5ml4lkwcwf72rubru'))
// { valid: false, error: '检测到 MongoDB _id 格式...', suggestion: '...' }
```

## 注意事项

1. **优先使用 openid**：不要使用 MongoDB `_id` 作为 IM userID
2. **实时验证**：在用户输入或获取 ID 后立即验证
3. **自动修复有限**：MongoDB `_id` 格式无法自动修复，必须使用 openid
4. **日志记录**：所有验证失败都应记录日志，便于排查问题
5. **用户体验**：提供清晰的错误提示，避免用户困惑

## 版本历史

- **v1.0** (2025-02-02)
  - 初始版本
  - 实现核心验证和规范化功能
  - 集成到消息发送、聊天页面、会话列表
