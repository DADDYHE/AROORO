# 原有身份管理模块迁移策略

## 当前架构分析

### 现有身份管理模块

项目当前使用以下身份管理模块：

1. **identityContextManager.js** - 身份上下文管理器
   - 管理不同身份（owner/host）的上下文
   - 实现身份隔离
   - 存储每个身份的 profile、imUserInfo、permissions、storageInfo 等

2. **IdentityManager.js** - 统一身份管理工具
   - 从多个来源获取角色信息
   - 角色优先级配置
   - 提供统一的身份获取接口

3. **roleManager.js** - 角色管理器
   - 管理用户角色信息
   - 提供角色相关的 API

### 使用情况统计

- **IdentityManager** 被以下文件使用：
  - `pages/index/index.js`
  - `pages/profile/index.js`
  - `pages/messages/index.js`
  - `subpackages/profile/edit/index.js`
  - `subpackages/profile/settings/index.js`

- **identityContextManager** 被以下文件使用：
  - `app.js` (在 `onLaunch` 和 `switchRole` 中)
  - `utils/IdentityManager.js` (作为角色来源之一)
  - `utils/storageManager.js`

## 迁移方案

### 方案一：渐进式迁移（推荐）

#### 阶段 1：保持兼容，逐步替换

**步骤 1.1：不删除原有模块，而是增强它们**

保留 `IdentityManager.js` 和 `identityContextManager.js`，但将其内部逻辑改为委托给 `CentralIdentityManager`：

```javascript
// utils/IdentityManager.js
const { centralIdentityManager } = require('./CentralIdentityManager')

class IdentityManager {
  static getCurrentIdentity() {
    // 内部调用 CentralIdentityManager
    return centralIdentityManager.getCurrentIdentity()
  }

  static getCurrentRole() {
    return centralIdentityManager.getCurrentRole()
  }

  // 保持其他现有 API 的兼容性
  static init() {
    centralIdentityManager.init()
  }

  static getCurrentProfile(roleType) {
    return centralIdentityManager.getProfile(roleType)
  }
}
```

**步骤 1.2：逐步迁移页面**

优先级顺序：
1. 先迁移核心页面（index, profile）
2. 再迁移子包页面（subpackages）
3. 最后迁移测试文件

**步骤 1.3：测试验证**

每个页面迁移完成后，进行以下测试：
- 身份切换功能
- 页面显示一致性
- 数据同步正确性

#### 阶段 2：全面迁移

**步骤 2.1：替换所有页面的导入**

将所有页面的导入从：
```javascript
const IdentityManager = require('../../utils/identityManager')
```

替换为：
```javascript
const { centralIdentityManager } = require('../../utils/CentralIdentityManager')
```

或者使用页面增强器：
```javascript
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')
```

**步骤 2.2：更新方法调用**

将所有方法调用更新为新 API：

| 旧 API | 新 API |
|--------|--------|
| `IdentityManager.getCurrentIdentity()` | `centralIdentityManager.getCurrentIdentity()` |
| `IdentityManager.getCurrentRole()` | `centralIdentityManager.getCurrentRole()` |
| `IdentityManager.getCurrentProfile('owner')` | `centralIdentityManager.getProfile('owner')` |
| `app.globalData.currentRole` | `centralIdentityManager.getCurrentRole()` |

**步骤 2.3：移除旧模块依赖**

删除以下文件：
- `utils/IdentityManager.js`
- `utils/roleManager.js` (如果不需要)
- `utils/identityManager.js` (注意：不是 IdentityManager.js)

**保留以下文件（因为它们仍然有用）：**
- `utils/identityContextManager.js` - 可以作为 CentralIdentityManager 的内部实现

### 方案二：一次性迁移（激进）

#### 适用场景

- 项目处于早期开发阶段
- 页面数量较少（< 10 个）
- 可以接受较大的代码变更

#### 执行步骤

1. **备份当前代码**
   ```bash
   git add .
   git commit -m "备份：迁移到新的身份管理器之前"
   ```

2. **删除旧模块**
   ```bash
   rm utils/IdentityManager.js
   rm utils/roleManager.js
   ```

3. **全局替换**
   - 使用编辑器的全局查找替换功能
   - 将所有 `IdentityManager.` 替换为 `centralIdentityManager.`

4. **测试所有页面**
   - 测试核心功能
   - 测试身份切换
   - 测试页面跳转

## 推荐方案总结

**推荐使用方案一（渐进式迁移）**，原因如下：

### 优点

1. **风险低** - 逐步迁移，每次只改一个页面，出现问题容易定位
2. **兼容性好** - 保留旧模块作为兼容层，新旧代码可以共存
3. **测试简单** - 每个阶段都可以独立测试验证
4. **可回滚** - 如果遇到问题，可以快速回滚到上一个稳定状态

### 缺点

1. **周期长** - 需要多个阶段完成迁移
2. **代码冗余** - 迁移期间会有新旧代码共存的情况

## 迁移检查清单

### 阶段 1 检查点

- [ ] `IdentityManager.js` 内部委托给 `CentralIdentityManager`
- [ ] 核心页面迁移完成
- [ ] 所有测试用例通过
- [ ] 身份切换功能正常

### 阶段 2 检查点

- [ ] 所有页面的导入已更新
- [ ] 所有方法调用已更新
- [ ] 移除了对旧模块的依赖
- [ ] 移除了未使用的旧模块文件

### 最终验证

- [ ] 所有页面显示正确的身份信息
- [ ] 身份切换后所有页面同步更新
- [ ] 本地存储和缓存正常工作
- [ ] IM 登录和消息功能正常
- [ ] 没有 linter 错误
- [ ] 没有运行时错误

## 回滚计划

如果在迁移过程中遇到严重问题，可以执行以下回滚操作：

```bash
# 回滚到迁移前的状态
git checkout <迁移前的commit>

# 或者恢复特定文件
git checkout <迁移前的commit> -- utils/IdentityManager.js
git checkout <迁移前的commit> -- pages/index/index.js
```

## 注意事项

1. **不要直接删除 `identityContextManager.js`**
   - 它在 `app.js` 中被大量使用
   - 可以考虑将其重构为 `CentralIdentityManager` 的内部实现

2. **测试用例文件可以保留**
   - 它们用于验证身份管理逻辑
   - 后续可以更新为使用新的 API

3. **文档文件需要更新**
   - `IDENTITY_REFACTOR_SUMMARY.md`
   - `IDENTITY_REFACTOR_README.md`
   - `docs/identity-*.md`

4. **全局变量需要清理**
   - `app.globalData.userRole`
   - `app.globalData.ownerInfo`
   - `app.globalData.hostInfo`
   - 这些应该改为通过 `CentralIdentityManager` 访问

## 时间估算

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 阶段 1.1 | 增强 IdentityManager.js | 2 小时 |
| 阶段 1.2 | 迁移核心页面（3-5 个） | 4-6 小时 |
| 阶段 1.3 | 测试验证 | 2-3 小时 |
| 阶段 2.1 | 替换所有导入 | 1-2 小时 |
| 阶段 2.2 | 更新方法调用 | 2-3 小时 |
| 阶段 2.3 | 移除旧模块 | 1 小时 |
| 最终验证 | 全面测试 | 2-3 小时 |
| **总计** | | **14-20 小时** |
