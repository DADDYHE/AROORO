# 身份选择与权限控制集成方案

## 概述

本文档描述了微信授权登录流程中身份选择表单与身份管理器的集成方案，实现了严格的数据访问权限控制，确保用户只能查看和操作当前登录身份对应的数据。

---

## 架构设计

### 1. 核心组件

| 组件 | 描述 | 文件路径 |
|------|------|----------|
| IdentityManager | 统一身份管理工具，管理用户身份状态 | `utils/identityManager.js` |
| PermissionManager | 权限管理工具，定义各角色的权限配置 | `utils/permissionManager.js` |
| DataAccessController | 数据访问控制工具，执行严格的访问权限检查 | `utils/dataAccessController.js` |
| RoleManager | 角色切换工具，处理角色切换和通知 | `utils/roleManager.js` |

### 2. 登录流程

```
用户点击"完成登录"
    ↓
获取用户可用的身份列表（调用 getUserIdentity 云函数）
    ↓
验证每个身份的有效性
    ↓
┌─────────────────┬─────────────────┐
│   多个身份      │    单一身份     │
│  (owner + host) │   (owner/host)  │
└────────┬────────┴────────┬────────┘
         │                 │
         ↓                 ↓
   显示身份选择弹窗   直接完成登录
         │                 │
         └────────┬────────┘
                  ↓
         权限预验证
                  ↓
         调用登录云函数
                  ↓
         登录成功处理
                  ↓
      同步身份状态
                  ↓
      加载角色特定数据
```

---

## 实现细节

### 1. 身份选择表单（pages/profile/index.js）

#### 1.1 数据字段

```javascript
data: {
  showRoleSelection: false,      // 身份选择弹窗显示状态
  availableRoles: [],            // 可用的身份列表
  selectedRole: null,            // 用户选择的身份
  tempUserInfo: null,            // 临时保存的用户信息（微信返回）
  roleSwitchCallbackId: null     // 角色切换回调ID
}
```

#### 1.2 核心方法

##### onSubmitLogin()
- 验证头像和昵称
- 调用 `getUserIdentity` 云函数获取用户身份列表
- 验证每个身份的有效性
- 根据身份数量决定是否显示选择弹窗

##### onRoleSelect(e)
- 验证角色类型的有效性
- 检查所选身份是否在可用身份列表中
- 更新选中的角色

##### onConfirmRoleSelection()
- 验证是否已选择身份
- 隐藏身份选择弹窗
- 调用 `completeLogin` 完成登录

##### completeLogin(roleType)
- 验证角色类型有效性
- 检查基本访问权限
- 使用身份管理器预设置角色
- 验证所选身份的 profile 权限
- 检查角色特定的权限（宠物主人/寄养家庭）
- 调用微信登录流程

##### handleLoginSuccess(userInfo, avatarUrl, token, userSig)
- 确保用户信息包含角色字段
- 验证角色类型的有效性
- 处理临时头像上传
- 使用身份管理器同步身份状态
- 验证身份对应的权限
- 检查数据访问权限
- 保存用户信息到本地存储
- 注册角色切换回调

##### _registerRoleSwitchCallback()
- 使用 RoleManager 注册角色切换回调
- 更新页面数据
- 验证新角色的权限
- 重新加载角色特定数据

##### _loadRoleSpecificData(role)
- 根据角色加载不同的数据
- `owner`: 加载宠物主人数据
- `host`: 加载寄养家庭数据

### 2. 数据访问控制（utils/dataAccessController.js）

#### 2.1 核心方法

##### checkAccess(dataType, action, data)
检查数据访问权限，返回权限检查结果。

**参数:**
- `dataType`: 数据类型 (`pet`, `order`, `message`, `profile`, `host`, `owner`)
- `action`: 操作类型 (`view`, `create`, `edit`, `delete`, `list`)
- `data`: 数据对象（用于验证所有权）

**返回:**
```javascript
{
  allowed: boolean,  // 是否有权限
  reason: string     // 拒绝原因（如果没有权限）
}
```

**示例:**
```javascript
// 检查是否有权限查看特定宠物
const result = dataAccessController.checkAccess('pet', 'view', petData)
if (result.allowed) {
  // 显示宠物信息
} else {
  console.error('无权访问:', result.reason)
}
```

##### filterData(dataType, action, dataList)
过滤数据列表，只返回当前角色有权访问的数据。

**参数:**
- `dataType`: 数据类型
- `action`: 操作类型
- `dataList`: 数据列表

**返回:**
过滤后的数据列表。

**示例:**
```javascript
// 过滤宠物列表，只返回当前用户拥有的宠物
const filteredPets = dataAccessController.filterData('pet', 'list', allPets)
```

##### checkAccessBatch(requests)
批量检查访问权限。

**参数:**
- `requests`: 请求列表，每个元素格式为 `{ dataType, action, data }`

**返回:**
权限检查结果列表。

---

## 权限配置

### 宠物主人（owner）权限

| 资源 | 操作 | 权限 |
|------|------|------|
| basic | view, edit | ✅ |
| pet | view, add, edit, delete, list | ✅ |
| order | view, create, cancel, list | ✅ |
| message | send, receive, list | ✅ |
| profile | view, edit | ✅ |
| host | view, list, favorite | ✅ |

### 寄养家庭（host）权限

| 资源 | 操作 | 权限 |
|------|------|------|
| basic | view, edit | ✅ |
| pet | view, list | ✅ |
| order | view, accept, reject, complete, list | ✅ |
| message | send, receive, list | ✅ |
| profile | view, edit | ✅ |
| host | manage | ✅ |

---

## 数据隔离机制

### 1. 所有权验证

对于涉及具体数据对象的操作，系统会验证数据的所有权：

#### 宠物数据
```javascript
if (data.ownerId !== userInfo._id) {
  return { allowed: false, reason: '宠物不属于当前用户' }
}
```

#### 订单数据
```javascript
// 宠物主人身份
if (role === 'owner' && data.ownerId !== userInfo._id) {
  return { allowed: false, reason: '订单不属于当前用户' }
}

// 寄养家庭身份
if (role === 'host' && data.hostId !== userInfo._id) {
  return { allowed: false, reason: '订单不属于当前寄养家庭' }
}
```

#### 消息数据
```javascript
if (data.from !== userInfo._id && data.to !== userInfo._id) {
  return { allowed: false, reason: '用户不是消息参与者' }
}
```

#### 个人资料数据
```javascript
if (data.userId !== userInfo._id) {
  return { allowed: false, reason: '个人资料不属于当前用户' }
}
```

### 2. 身份特定数据访问

#### 宠物主人身份
- ✅ 可以访问自己的宠物列表
- ✅ 可以创建和管理自己的订单
- ✅ 可以查看寄养家庭信息（仅查看）
- ❌ 不能访问其他宠物主人的数据
- ❌ 不能修改寄养家庭的服务信息

#### 寄养家庭身份
- ✅ 可以查看宠物列表（仅查看）
- ✅ 可以管理自己收到的订单
- ✅ 可以管理自己的寄养服务
- ❌ 不能创建订单
- ❌ 不能修改宠物信息

---

## 安全机制

### 1. 多层权限验证

```
登录前验证
    ↓
身份有效性验证
    ↓
权限配置验证
    ↓
数据访问权限验证
    ↓
所有权验证
```

### 2. 访问日志记录

所有数据访问操作都会被记录，包括：
- 时间戳
- 访问结果（允许/拒绝）
- 数据类型和操作
- 当前角色
- 拒绝原因（如果有）

### 3. 实时权限更新

通过角色切换回调，当用户切换身份时：
1. 验证新角色的权限
2. 清除旧角色的数据
3. 加载新角色的数据

---

## 使用示例

### 1. 在页面中使用数据访问控制

```javascript
const { dataAccessController } = require('../../utils/dataAccessController')

// 检查是否有权限添加宠物
const addResult = dataAccessController.checkAccess('pet', 'create')
if (!addResult.allowed) {
  wx.showToast({ title: addResult.reason, icon: 'none' })
  return
}

// 过滤宠物列表
const allPets = await fetchAllPets()
const myPets = dataAccessController.filterData('pet', 'list', allPets)
```

### 2. 在云函数中使用数据访问控制

```javascript
// 调用云函数时传递当前角色和用户ID
wx.cloud.callFunction({
  name: 'updatePet',
  data: {
    petId: pet._id,
    updates: updates,
    role: IdentityManager.getCurrentRole(),
    userId: IdentityManager.getCurrentUserInfo()._id
  }
})
```

### 3. 监听角色切换事件

```javascript
// 使用 RoleManager 注册回调
const callbackId = RoleManager.registerRoleChangeCallback((newRole) => {
  console.log('角色已切换到:', newRole)

  // 验证新角色的权限
  const hasPermission = permissionManager.checkPermission(newRole, 'pet', 'list')
  if (!hasPermission) {
    console.warn('新角色没有宠物列表访问权限')
    return
  }

  // 重新加载数据
  loadRoleSpecificData(newRole)
})

// 页面卸载时移除回调
onUnload() {
  if (this.roleSwitchCallbackId) {
    RoleManager.removeRoleChangeCallback(this.roleSwitchCallbackId)
  }
}
```

---

## 最佳实践

1. **始终使用 DataAccessController 检查数据访问权限**
2. **在 UI 层根据权限显示/隐藏功能**
3. **在数据层过滤不符合权限的数据**
4. **记录所有重要的访问操作**
5. **定期审查访问日志，发现异常访问行为**

---

## 注意事项

1. **权限检查不能仅依赖前端**，后端也必须进行权限验证
2. **避免缓存权限检查结果**，因为角色可能切换
3. **对敏感操作进行二次确认**，如删除数据
4. **及时清理不再需要的角色切换回调**

---

## 总结

通过将身份选择表单与身份管理器、权限管理器和数据访问控制器的无缝集成，我们实现了：

✅ 严格的身份访问控制
✅ 完整的数据隔离机制
✅ 实时的权限验证
✅ 详细的访问日志记录
✅ 清晰的系统架构

确保用户只能查看和操作当前登录身份对应的数据，防止任何形式的越权访问。
