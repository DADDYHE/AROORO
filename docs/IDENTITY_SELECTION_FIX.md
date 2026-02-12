# 身份选择弹窗修复

## 问题描述

用户拥有多个身份（host 和 owner），登录时没有弹出身份选择弹窗。

## 根本原因

`callLoginCloudFunction` 调用登录云函数后，直接调用 `handleLoginSuccess`，**没有检查用户是否有多个身份**。

从登录云函数的返回数据可以看到：
```javascript
{
  "code": 0,
  "data": {
    "roles": [
      {
        "roleType": "host",
        ...
      },
      {
        "roleType": "owner",
        ...
      }
    ],
    "userInfo": {
      "role": "host",  // 只有一个角色
      ...
    }
  }
}
```

代码直接使用了 `userInfo.role`（只有一个值），而没有检查 `data.roles` 数组，导致身份选择弹窗没有触发。

## 修复方案

### 1. 在 `callLoginCloudFunction` 中添加多身份检查

在调用 `handleLoginSuccess` 之前，检查 `cloudRes.result.data.roles`：

```javascript
// 检查用户是否有多个身份
const roles = cloudRes.result.data && cloudRes.result.data.roles
if (roles && roles.length > 0) {
  // 获取有效身份
  const validRoles = roles.filter(role => ['owner', 'host'].includes(role.roleType))
  const hasHostRole = validRoles.some(role => role.roleType === 'host')
  const hasOwnerRole = validRoles.some(role => role.roleType === 'owner')

  if (hasHostRole && hasOwnerRole) {
    // 同时拥有两种身份，显示身份选择弹窗
    this.setData({
      availableRoles: validRoles,
      showRoleSelection: true,
      tempLoginInfo: {
        userInfo: resultUserInfo,
        avatarUrl: userInfo.avatarUrl,
        token: token,
        userSig: userSig
      }
    })
    wx.hideLoading()
    return
  }
}
```

### 2. 添加 `tempLoginInfo` 数据字段

用于临时保存登录信息，供身份选择后使用：

```javascript
data: {
  // ... 其他字段
  tempLoginInfo: null, // 临时保存的登录信息（用于身份选择）
}
```

### 3. 修改 `onConfirmRoleSelection` 支持两种场景

区分从登录流程触发的身份选择和从身份管理页面触发的身份切换：

```javascript
async onConfirmRoleSelection() {
  const { selectedRole, tempLoginInfo } = this.data

  if (tempLoginInfo) {
    // 从登录流程触发，直接使用临时登录信息完成登录
    const { userInfo, avatarUrl, token, userSig } = tempLoginInfo
    userInfo.role = selectedRole
    await this.handleLoginSuccess(userInfo, avatarUrl, token, userSig)
  } else {
    // 从身份管理页面触发，调用完整登录流程
    await this.completeLogin(selectedRole)
  }
}
```

## 修复后的流程

1. 用户输入昵称并点击登录
2. 调用 `callLoginCloudFunction` → 登录云函数
3. 检查返回的 `data.roles` 数组
4. 如果有多个身份 → 显示身份选择弹窗
5. 用户选择身份后 → 调用 `handleLoginSuccess` 完成登录
6. 如果只有一个身份 → 直接调用 `handleLoginSuccess` 完成登录

## 测试步骤

1. 确保用户同时拥有 host 和 owner 两个身份
2. 登录应用，输入昵称
3. 点击登录按钮
4. 应该弹出身份选择弹窗
5. 选择身份后完成登录

## 相关文件

- `pages/profile/index.js` - 主要修复文件
