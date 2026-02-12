# 身份隔离功能测试指南

## 1. 测试目标

验证一个账号下两个身份（宠物主人和寄养家庭）的完全隔离，包括：

1. **身份上下文隔离**：验证不同身份的上下文是否完全隔离
2. **IM用户账号隔离**：验证不同身份是否使用独立的IM用户账号
3. **数据存储隔离**：验证不同身份的数据是否存储在独立的空间
4. **代码使用隔离**：验证代码是否只使用当前身份的上下文

## 2. 测试环境准备

### 2.1 开发环境

- 微信开发者工具最新版本
- Node.js 14.0 或以上版本
- 小程序基础库 2.2.3 或以上版本

### 2.2 测试账号

- 一个微信小程序账号，已绑定云开发环境
- 该账号已创建宠物主人和寄养家庭两个身份

## 3. 测试步骤

### 3.1 身份上下文隔离测试

#### 3.1.1 测试准备

1. 启动微信开发者工具
2. 打开小程序项目
3. 进入调试模式，打开控制台

#### 3.1.2 测试步骤

1. **登录小程序**：
   - 点击登录按钮，使用测试账号登录
   - 观察控制台输出，确认身份上下文管理器初始化成功
   - 确认每个身份的上下文都被正确添加到身份上下文管理器中

2. **检查身份上下文**：
   - 在控制台中执行以下代码，检查身份上下文：
     ```javascript
     const app = getApp();
     console.log('当前身份:', app.globalData.identityContextManager.getCurrentRoleType());
     console.log('所有身份上下文:', app.globalData.identityContextManager.exportContexts());
     ```
   - 确认输出中包含两个身份的上下文信息

3. **切换身份**：
   - 点击身份切换按钮，切换到另一个身份
   - 观察控制台输出，确认身份切换成功
   - 确认身份上下文管理器中的当前身份已更新

4. **再次检查身份上下文**：
   - 在控制台中执行以下代码，检查切换后的身份上下文：
     ```javascript
     const app = getApp();
     console.log('切换后的当前身份:', app.globalData.identityContextManager.getCurrentRoleType());
     console.log('当前身份上下文:', app.globalData.identityContextManager.getCurrentContext());
     ```
   - 确认输出中的当前身份已切换

### 3.2 IM用户账号隔离测试

#### 3.2.1 测试准备

1. 确保腾讯云IM服务已初始化
2. 确保测试账号已在腾讯云IM系统中注册

#### 3.2.2 测试步骤

1. **登录小程序**：
   - 点击登录按钮，使用测试账号登录
   - 观察控制台输出，确认IM登录成功
   - 记录当前身份的IM用户ID

2. **检查IM用户账号**：
   - 在控制台中执行以下代码，检查当前IM用户账号：
     ```javascript
     const app = getApp();
     const currentContext = app.globalData.identityContextManager.getCurrentContext();
     console.log('当前身份的IM用户ID:', currentContext.imUserInfo.userID);
     ```
   - 确认输出的IM用户ID格式为 `{roleType}_{openid}`，例如 `owner_oNIhl17JEstp_WtKcSq-EUKa93qk`

3. **切换身份**：
   - 点击身份切换按钮，切换到另一个身份
   - 观察控制台输出，确认IM账号切换成功
   - 记录切换后身份的IM用户ID

4. **检查切换后的IM用户账号**：
   - 在控制台中执行以下代码，检查切换后的IM用户账号：
     ```javascript
     const app = getApp();
     const currentContext = app.globalData.identityContextManager.getCurrentContext();
     console.log('切换后身份的IM用户ID:', currentContext.imUserInfo.userID);
     ```
   - 确认输出的IM用户ID与之前记录的不同，格式为 `{roleType}_{openid}`，例如 `host_oNIhl17JEstp_WtKcSq-EUKa93qk`

5. **发送消息测试**：
   - 在当前身份下，发送一条消息给另一个用户
   - 切换到另一个身份，发送一条消息给同一个用户
   - 确认接收方收到的消息来自不同的IM用户账号

### 3.3 数据存储隔离测试

#### 3.3.1 测试准备

1. 确保存储管理器已初始化
2. 清空本地存储，避免之前的测试数据干扰

#### 3.3.2 测试步骤

1. **登录小程序**：
   - 点击登录按钮，使用测试账号登录
   - 切换到宠物主人身份

2. **存储宠物主人数据**：
   - 在控制台中执行以下代码，存储宠物主人专属数据：
     ```javascript
     const app = getApp();
     // 存储宠物主人专属数据
     app.globalData.storageManager.setStorageSync('test_data', '宠物主人测试数据');
     console.log('存储宠物主人数据成功');
     ```

3. **切换到寄养家庭身份**：
   - 点击身份切换按钮，切换到寄养家庭身份

4. **存储寄养家庭数据**：
   - 在控制台中执行以下代码，存储寄养家庭专属数据：
     ```javascript
     const app = getApp();
     // 存储寄养家庭专属数据
     app.globalData.storageManager.setStorageSync('test_data', '寄养家庭测试数据');
     console.log('存储寄养家庭数据成功');
     ```

5. **检查存储隔离**：
   - 在控制台中执行以下代码，检查不同身份的数据：
     ```javascript
     const app = getApp();
     
     // 检查当前身份（寄养家庭）的数据
     console.log('寄养家庭数据:', app.globalData.storageManager.getStorageSync('test_data'));
     
     // 切换到宠物主人身份
     app.globalData.identityContextManager.switchContext('owner');
     
     // 检查宠物主人身份的数据
     console.log('宠物主人数据:', app.globalData.storageManager.getStorageSync('test_data'));
     ```
   - 确认输出中，宠物主人和寄养家庭的数据不同

6. **检查存储键**：
   - 在控制台中执行以下代码，检查存储键：
     ```javascript
     const keys = wx.getStorageInfoSync().keys;
     console.log('所有存储键:', keys);
     ```
   - 确认输出中包含 `owner_test_data` 和 `host_test_data` 两个键

### 3.4 代码使用隔离测试

#### 3.4.1 测试准备

1. 确保小程序已登录
2. 确保已创建宠物主人和寄养家庭两个身份

#### 3.4.2 测试步骤

1. **宠物主人身份操作**：
   - 切换到宠物主人身份
   - 执行一些操作，例如查看宠物档案、发送消息等
   - 观察控制台输出，确认所有操作都使用宠物主人身份的上下文

2. **寄养家庭身份操作**：
   - 切换到寄养家庭身份
   - 执行一些操作，例如查看寄养订单、发送消息等
   - 观察控制台输出，确认所有操作都使用寄养家庭身份的上下文

3. **交叉操作测试**：
   - 在宠物主人身份下，尝试访问寄养家庭专属功能
   - 确认系统会拒绝访问，或者使用宠物主人身份的上下文处理
   - 在寄养家庭身份下，尝试访问宠物主人专属功能
   - 确认系统会拒绝访问，或者使用寄养家庭身份的上下文处理

## 4. 测试预期结果

### 4.1 身份上下文隔离测试

- ✅ 身份上下文管理器初始化成功
- ✅ 每个身份的上下文都被正确添加到身份上下文管理器中
- ✅ 身份切换成功，当前身份上下文更新正确
- ✅ 每个身份的上下文包含完整的信息，包括profile、imUserInfo等

### 4.2 IM用户账号隔离测试

- ✅ 宠物主人身份使用 `owner_{openid}` 格式的IM用户ID
- ✅ 寄养家庭身份使用 `host_{openid}` 格式的IM用户ID
- ✅ 身份切换时，IM用户账号自动切换
- ✅ 不同身份发送的消息来自不同的IM用户账号

### 4.3 数据存储隔离测试

- ✅ 宠物主人数据存储在 `owner_` 前缀的键中
- ✅ 寄养家庭数据存储在 `host_` 前缀的键中
- ✅ 不同身份的数据互不干扰
- ✅ 切换身份后，只能访问当前身份的数据

### 4.4 代码使用隔离测试

- ✅ 宠物主人身份的操作只使用宠物主人的上下文
- ✅ 寄养家庭身份的操作只使用寄养家庭的上下文
- ✅ 身份切换后，代码自动使用新身份的上下文
- ✅ 不同身份的功能和数据完全隔离

## 5. 故障排除

### 5.1 常见问题及解决方案

#### 5.1.1 身份上下文初始化失败

**问题现象**：
- 控制台输出 "身份上下文管理器初始化失败"
- 身份上下文未被正确添加

**解决方案**：
- 检查 `utils/identityContextManager.js` 文件是否存在且内容正确
- 检查小程序启动时是否正确初始化了身份上下文管理器
- 检查云函数 `getUserIdentity` 是否返回正确的身份信息

#### 5.1.2 IM用户账号切换失败

**问题现象**：
- 控制台输出 "切换IM用户账号失败"
- 身份切换后，IM功能不可用

**解决方案**：
- 检查腾讯云IM服务是否正确初始化
- 检查 `switchIMAccount` 方法是否正确实现
- 检查云函数 `login` 是否返回正确的userSig

#### 5.1.3 数据存储隔离失败

**问题现象**：
- 不同身份的数据相互干扰
- 存储键没有正确添加身份前缀

**解决方案**：
- 检查 `utils/storageManager.js` 文件是否存在且内容正确
- 检查存储操作是否使用了 `storageManager` 提供的方法
- 检查身份切换时是否正确切换了存储前缀

#### 5.1.4 代码使用隔离失败

**问题现象**：
- 代码使用了错误身份的上下文
- 身份切换后，代码仍然使用旧身份的上下文

**解决方案**：
- 检查代码中是否正确使用了 `identityContextManager.getCurrentContext()` 获取当前上下文
- 检查身份切换后是否正确更新了全局状态
- 检查代码中是否有硬编码的身份信息

## 6. 测试工具

### 6.1 控制台命令

以下是测试过程中常用的控制台命令：

#### 6.1.1 身份管理相关

```javascript
// 获取App实例
const app = getApp();

// 获取当前身份
console.log('当前身份:', app.globalData.identityContextManager.getCurrentRoleType());

// 获取所有身份上下文
console.log('所有身份上下文:', app.globalData.identityContextManager.exportContexts());

// 切换身份
app.globalData.identityContextManager.switchContext('owner'); // 切换到宠物主人
app.globalData.identityContextManager.switchContext('host'); // 切换到寄养家庭

// 获取特定身份的上下文
console.log('宠物主人上下文:', app.globalData.identityContextManager.getContext('owner'));
console.log('寄养家庭上下文:', app.globalData.identityContextManager.getContext('host'));
```

#### 6.1.2 存储管理相关

```javascript
// 获取App实例
const app = getApp();

// 存储数据
app.globalData.storageManager.setStorageSync('test_key', 'test_value');

// 获取数据
console.log('存储数据:', app.globalData.storageManager.getStorageSync('test_key'));

// 删除数据
app.globalData.storageManager.removeStorageSync('test_key');

// 清除当前身份的所有数据
app.globalData.storageManager.clearStorageSync();

// 检查存储键
console.log('所有存储键:', wx.getStorageInfoSync().keys);
```

#### 6.1.3 IM相关

```javascript
// 获取App实例
const app = getApp();

// 检查当前IM用户ID
const currentContext = app.globalData.identityContextManager.getCurrentContext();
console.log('当前IM用户ID:', currentContext.imUserInfo.userID);

// 检查IM登录状态
console.log('IM登录状态:', currentContext.imUserInfo.isLoggedIn);
```

## 7. 测试结果记录

### 7.1 测试结果表格

| 测试项 | 预期结果 | 实际结果 | 状态 | 备注 |
|--------|----------|----------|------|------|
| 身份上下文隔离 | 不同身份的上下文完全隔离 | | | |
| IM用户账号隔离 | 不同身份使用独立的IM用户账号 | | | |
| 数据存储隔离 | 不同身份的数据存储在独立的空间 | | | |
| 代码使用隔离 | 代码只使用当前身份的上下文 | | | |

### 7.2 测试日志

测试过程中，建议记录以下日志：

1. **登录日志**：记录登录过程中的控制台输出
2. **身份切换日志**：记录身份切换过程中的控制台输出
3. **IM操作日志**：记录IM操作过程中的控制台输出
4. **存储操作日志**：记录存储操作过程中的控制台输出
5. **错误日志**：记录测试过程中遇到的所有错误

## 8. 结论

通过以上测试步骤，可以验证一个账号下两个身份的完全隔离。如果所有测试项都通过，说明身份隔离功能实现成功。

身份隔离功能的实现，确保了：

1. **数据安全**：不同身份的数据互不干扰，保护用户隐私
2. **功能独立**：不同身份的功能独立运行，避免冲突
3. **用户体验**：用户可以在不同身份之间自由切换，无需重新登录
4. **系统稳定性**：身份隔离减少了系统复杂度，提高了系统稳定性

## 9. 后续优化建议

### 9.1 功能优化

- **身份切换动画**：添加身份切换动画，提升用户体验
- **身份快捷切换**：添加身份快捷切换按钮，方便用户快速切换身份
- **身份状态提示**：在界面上添加身份状态提示，明确当前身份

### 9.2 性能优化

- **上下文缓存**：缓存身份上下文，减少重复计算
- **存储优化**：优化存储操作，减少存储开销
- **IM连接管理**：优化IM连接管理，减少连接开销

### 9.3 安全性优化

- **身份验证**：加强身份切换时的验证，防止未授权访问
- **数据加密**：对敏感数据进行加密存储，提高安全性
- **访问控制**：实现更细粒度的访问控制，确保数据安全

## 10. 附录

### 10.1 相关文件

- `utils/identityContextManager.js`：身份上下文管理模块
- `utils/storageManager.js`：存储管理模块
- `app.js`：小程序入口文件，集成了身份隔离功能

### 10.2 相关API

- **身份上下文管理API**：
  - `addContext(roleType, context)`：添加身份上下文
  - `getCurrentContext()`：获取当前身份上下文
  - `switchContext(roleType)`：切换身份

- **存储管理API**：
  - `setStorageSync(key, value, roleType)`：存储数据
  - `getStorageSync(key, defaultValue, roleType)`：获取数据
  - `removeStorageSync(key, roleType)`：删除数据

- **IM管理API**：
  - `switchIMAccount(targetRoleType)`：切换IM用户账号
  - `updateIMUserProfile(userName, avatarUrl)`：更新IM用户资料

### 10.3 常见问题解答

**Q1: 身份隔离功能是否会影响小程序的性能？**

A1: 身份隔离功能的实现采用了轻量级设计，对小程序性能的影响很小。通过合理的缓存和优化，身份隔离功能可以在保证性能的同时，提供更好的用户体验。

**Q2: 身份隔离功能是否会增加开发复杂度？**

A2: 身份隔离功能的实现采用了模块化设计，通过身份上下文管理器和存储管理器封装了复杂的逻辑，简化了开发过程。开发者只需要使用这些管理器提供的API，就可以实现身份隔离功能。

**Q3: 身份隔离功能是否支持更多身份类型？**

A3: 当前实现支持宠物主人和寄养家庭两个身份类型。如果需要支持更多身份类型，只需要修改身份类型的定义和相关逻辑即可。

**Q4: 身份隔离功能是否会影响现有的功能？**

A4: 身份隔离功能的实现采用了向后兼容的设计，不会影响现有的功能。现有的功能可以继续使用，同时可以通过身份隔离功能获得更好的用户体验。

**Q5: 如何在新功能中使用身份隔离功能？**

A5: 在新功能中使用身份隔离功能，只需要：
1. 使用 `identityContextManager.getCurrentContext()` 获取当前身份上下文
2. 使用 `storageManager` 提供的方法进行存储操作
3. 确保所有操作都基于当前身份的上下文

通过以上步骤，可以确保新功能正确使用身份隔离功能，提供更好的用户体验。
