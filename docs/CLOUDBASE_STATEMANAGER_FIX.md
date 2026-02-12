# 修复 CloudBase SDK 和 StateManager 错误

## 错误汇总

### 错误 1: CloudBase SDK 模块未找到

```
Error: module 'miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js' is not defined,
require args is './miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js'
    at app.js:326
```

### 错误 2: StateManager pageRegistry 未定义

```
TypeError: Cannot read property 'pageRegistry' of undefined
    at Function.registerPage (stateManager.js:680)
    at ai.onLoad (index.js:49)
```

## 根本原因

### 问题 1: CloudBase SDK 路径问题

1. `@cloudbase/wx-cloud-client-sdk` 包的实际入口文件是 `lib/wxCloudClientSDK.cjs.js`
2. app.js 中引用的是 `index.js`，该文件不存在
3. 需要复制 `lib/` 目录并创建 `index.js` 作为入口

### 问题 2: StateManager 未初始化

1. `StateManager.init()` 从未被调用
2. 当页面调用 `registerPage()` 时，`app.globalData.stateManager` 不存在
3. 访问 `app.globalData.stateManager.pageRegistry` 导致 `undefined` 错误

## 修复方案

### 1. 修复 CloudBase SDK

#### 复制包到 miniprogram_npm

```bash
# 创建目录
mkdir -p miniprogram_npm/@cloudbase

# 复制 lib 目录
cp -r node_modules/@cloudbase/wx-cloud-client-sdk/lib miniprogram_npm/@cloudbase/wx-cloud-client-sdk

# 复制 package.json
cp node_modules/@cloudbase/wx-cloud-client-sdk/package.json miniprogram_npm/@cloudbase/wx-cloud-client-sdk/
```

#### 创建 index.js 入口文件

```javascript
// miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js
// 导出 wxCloudClientSDK 作为默认导出
module.exports = require('./wxCloudClientSDK.cjs.js')
```

#### 修复后的文件结构

```
miniprogram_npm/@cloudbase/wx-cloud-client-sdk/
├── api/
├── db/
├── orm/
├── types/
├── index.js              ✅ 新建的入口文件
├── index.d.ts
├── error.d.ts
├── utils.d.ts
├── wxCloudClientSDK.cjs.js   ✅ 实际的 SDK 文件
├── wxCloudClientSDK.esm.js
├── wxCloudClientSDK.umd.js
└── package.json
```

### 2. 修复 StateManager

#### 在 registerPage() 中添加初始化检查

```javascript
static registerPage(pageName, initialState) {
  console.log('StateManager.registerPage - 注册页面:', pageName, '初始状态:', Object.keys(initialState));

  // ✅ 新增：确保 stateManager 已初始化
  if (!app.globalData.stateManager) {
    this.init();
  }

  // 存储页面状态
  if (!app.globalData.stateManager.pageRegistry) {
    app.globalData.stateManager.pageRegistry = {};
  }
  app.globalData.stateManager.pageRegistry[pageName] = {
    initialState: initialState,
    currentState: { ...initialState },
    listeners: []
  };

  console.log('StateManager.registerPage - 页面注册成功:', pageName);
}
```

#### 在 addListener() 中添加初始化检查

```javascript
static addListener(pageName, callback) {
  console.log('StateManager.addListener - 添加页面状态监听器:', pageName);

  // ✅ 新增：确保 stateManager 已初始化
  if (!app.globalData.stateManager) {
    this.init();
  }

  if (!app.globalData.stateManager.pageRegistry || !app.globalData.stateManager.pageRegistry[pageName]) {
    console.error('StateManager.addListener - 页面未注册:', pageName);
    return () => {};
  }

  // ... 其余代码不变
}
```

## 修复效果

### CloudBase SDK

```bash
✅ miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js exists
✅ index.js 正确导出 wxCloudClientSDK.cjs.js
✅ app.js:326 可以正常 require
```

### StateManager

```javascript
// 页面加载时的初始化流程
1. 页面调用 stateManager.registerPage('home', initialState)
2. ✅ registerPage 检查 app.globalData.stateManager 不存在
3. ✅ 自动调用 StateManager.init()
4. ✅ 创建 app.globalData.stateManager = { pageRegistry: {}, ... }
5. ✅ 成功注册页面到 pageRegistry
```

## 验证步骤

### 1. 清除小程序缓存
- 工具 → 清除缓存 → 清除文件缓存
- 工具 → 清除缓存 → 清除数据缓存

### 2. 重新编译
- 点击"编译"按钮（或按 Cmd+B）

### 3. 检查控制台日志

期望看到的日志：
```
StateManager.registerPage - 注册页面: home 初始状态: [...]
StateManager.init - 初始化状态管理器
StateManager.init - 创建全局状态管理器实例
StateManager._initDefaultState - 初始化默认状态: userInfo = null
StateManager._initDefaultState - 初始化默认状态: userRole = owner
...
StateManager.init - 状态管理器初始化完成
StateManager.registerPage - 页面注册成功: home
```

## 后续维护建议

### 1. 自动化 CloudBase SDK 复制

在 `package.json` 中添加：

```json
{
  "scripts": {
    "copy:cloudbase": "mkdir -p miniprogram_npm/@cloudbase && cp -r node_modules/@cloudbase/wx-cloud-client-sdk/lib miniprogram_npm/@cloudbase/wx-cloud-client-sdk && cp node_modules/@cloudbase/wx-cloud-client-sdk/package.json miniprogram_npm/@cloudbase/wx-cloud-client-sdk/ && echo \"module.exports = require('./wxCloudClientSDK.cjs.js')\" > miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js"
  }
}
```

### 2. StateManager 初始化建议

在 `app.js` 的 `onLaunch` 中尽早调用：

```javascript
App({
  onLaunch() {
    // 最先初始化 StateManager
    const { stateManager } = require('./utils/stateManager')
    stateManager.init()

    // 其他初始化...
  }
})
```

### 3. 健壮性改进

考虑在 StateManager 的所有方法开头添加初始化检查：

```javascript
static _ensureInitialized() {
  if (!app.globalData.stateManager) {
    this.init();
  }
}

static registerPage(pageName, initialState) {
  this._ensureInitialized()
  // ... 其余代码
}
```

## 相关问题文档

- [修复 @tencentcloud/chat 模块错误](./NPM_MODULE_FIX.md)
- [修复 @vant/weapp 组件路径错误](./VANT_PATH_FIX.md)
- [修复 IM SDK isReady 错误](./IM_SDK_ERROR_FIX_V2.md)

## 修复时间
2025-02-06
