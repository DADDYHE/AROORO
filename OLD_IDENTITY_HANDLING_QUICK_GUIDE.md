# 旧身份管理模块处理 - 快速指南

## 问题回答

**原来身份管理模块怎么处理的？**

### 答案：采用渐进式迁移策略

#### 1. 保留现有模块作为兼容层

**暂时保留的模块：**
- ✅ `utils/identityContextManager.js` - 保留（被 app.js 大量使用）
- ✅ `utils/IdentityManager.js` - 保留（被多个页面使用）
- ✅ `utils/roleManager.js` - 保留（可能需要）

**原因：**
- 避免一次性大规模重构导致项目无法运行
- 保持代码兼容性，新旧代码可以共存
- 降低迁移风险

#### 2. 两种处理方式

##### 方式 1：增强旧模块（推荐）

将 `IdentityManager.js` 内部改为委托给 `CentralIdentityManager`：

```javascript
// utils/IdentityManager.js
const { centralIdentityManager } = require('./CentralIdentityManager')

class IdentityManager {
  static getCurrentIdentity() {
    // 内部委托给 CentralIdentityManager
    return centralIdentityManager.getCurrentIdentity()
  }

  static getCurrentRole() {
    return centralIdentityManager.getCurrentRole()
  }
}

module.exports = IdentityManager
```

**优点：**
- 不需要修改所有页面
- 旧的 API 继续工作
- 逐步迁移，风险低

##### 方式 2：直接替换

逐个页面迁移到新的 API：

```javascript
// 旧代码
const IdentityManager = require('../../utils/identityManager')
const identity = IdentityManager.getCurrentIdentity()

// 新代码
const { centralIdentityManager } = require('../../utils/CentralIdentityManager')
const identity = centralIdentityManager.getCurrentIdentity()

// 或使用页面增强器（最简单）
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')

Page(enhanceWithIdentity({
  onLoad() {
    console.log('当前角色:', this.data.userRole)
  }
}))
```

**优点：**
- 代码更简洁
- 使用最新的 API
- 更好的性能

**缺点：**
- 需要修改多个页面
- 工作量较大

#### 3. 迁移优先级

按照以下顺序迁移页面：

**高优先级（先迁移）：**
1. `pages/index/index.js` - 首页
2. `pages/profile/index.js` - 个人中心
3. `pages/messages/index.js` - 消息列表

**中优先级（后迁移）：**
4. `subpackages/profile/edit/index.js` - 编辑资料
5. `subpackages/profile/settings/index.js` - 设置

**低优先级（最后迁移）：**
6. 测试文件（test-*.js）
7. 文档文件（*.md）

#### 4. 迁移后的清理

迁移完成后，可以删除以下文件：

```bash
# 删除旧的身份管理器
rm utils/IdentityManager.js
rm utils/roleManager.js
rm utils/identityManager.js  # 注意：不是 IdentityManager.js

# 保留以下文件（仍然有用）
# - utils/identityContextManager.js
# - utils/CentralIdentityManager.js（新模块）
# - utils/identityPageEnhancer.js（新模块）
# - utils/identityAccessMiddleware.js（新模块）
```

## 快速开始

### 选项 1：保持现状（最简单）

如果现在的代码能正常工作，可以暂时不做任何改变。

**优点：**
- 零风险
- 零工作量

**缺点：**
- 没有使用新的集中式身份管理器
- 无法享受新功能（访问日志、权限控制等）

### 选项 2：逐步迁移（推荐）

按照以下步骤逐步迁移：

1. **选择一个页面开始**
   - 建议从 `pages/index/index.js` 开始

2. **修改导入**
   ```javascript
   // 删除或注释掉
   // const IdentityManager = require('../../utils/identityManager')

   // 添加新的导入
   const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')
   ```

3. **修改 Page 调用**
   ```javascript
   // 旧代码
   Page({
     data: { userRole: 'owner' },
     onLoad() {
       this.setData({
         userRole: IdentityManager.getCurrentRole()
       })
     }
   })

   // 新代码
   Page(enhanceWithIdentity({
     data: {}, // identityEnhancer 会自动添加 userRole
     onLoad() {
       console.log('当前角色:', this.data.userRole) // 自动同步
     }
   }))
   ```

4. **测试页面**
   - 测试身份切换功能
   - 测试页面显示是否正确

5. **重复步骤 1-4**，迁移所有页面

### 选项 3：一次性迁移（激进）

1. 备份代码
   ```bash
   git add .
   git commit -m "备份：迁移到新的身份管理器之前"
   ```

2. 使用编辑器的全局查找替换：
   - 查找：`IdentityManager\.`
   - 替换：`centralIdentityManager\.`

3. 测试所有页面
   - 确保没有运行时错误
   - 确保身份切换功能正常

4. 删除旧模块（可选）

## 需要帮助？

查看详细文档：
- 📄 `OLD_IDENTITY_MIGRATION_STRATEGY.md` - 完整的迁移策略
- 📄 `docs/identity-quick-reference.md` - 快速参考卡片
- 📄 `docs/identity-management-guide.md` - 详细使用指南
- 📄 `IDENTITY_REFACTOR_SUMMARY.md` - 重构完成总结

## 常见问题

### Q1：我必须立即迁移吗？

**A：** 不必须。如果现有代码能正常工作，可以保持现状。新的 `CentralIdentityManager` 提供了更多功能（访问日志、权限控制、自动同步等），但不是强制的。

### Q2：迁移会破坏现有功能吗？

**A：** 如果采用渐进式迁移策略（选项 2），不会破坏现有功能。新旧 API 可以共存，你可以逐个页面迁移。

### Q3：identityContextManager 需要删除吗？

**A：** 不需要。`identityContextManager.js` 在 `app.js` 中被大量使用，用于管理身份上下文隔离。可以将其重构为 `CentralIdentityManager` 的内部实现，但不必删除。

### Q4：我应该选择哪个迁移方案？

**A：** 推荐使用**选项 2：逐步迁移**。这个方案风险最低，即使遇到问题也可以快速回滚。
