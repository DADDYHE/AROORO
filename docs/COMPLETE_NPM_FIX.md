# 小程序 npm 包完整修复指南

## 问题概述

微信小程序不支持 ES Module（`import/export`），而 TUIKit 相关包使用 ES Module，导致模块加载失败。

## 已修复的问题

### 1. ✅ @tencentcloud/chat-uikit-engine
- **问题**：使用 ES Module 格式
- **修复**：使用 esbuild 转换为 CommonJS
- **文件**：`miniprogram_npm/@tencentcloud/chat-uikit-engine/index.cjs.js`
- **大小**：210.4kb

### 2. ✅ @tencentcloud/chat-uikit-wechat
- **问题**：使用 ES Module 格式
- **修复**：使用 esbuild 转换为 CommonJS
- **文件**：`miniprogram_npm/@tencentcloud/chat-uikit-wechat/index.cjs.js`
- **大小**：6.5kb

### 3. ✅ @tencentcloud/tui-core
- **问题**：使用 ES Module 格式
- **修复**：使用 esbuild 转换为 CommonJS
- **文件**：`miniprogram_npm/@tencentcloud/tui-core/index.cjs.js`
- **大小**：116.6kb

### 4. ✅ @vant/weapp
- **问题**：组件路径错误（多了一层 dist/）
- **修复**：复制 dist/* 到 @vant/ 根目录
- **文件**：`miniprogram_npm/@vant/icon/index.json`

### 5. ✅ @cloudbase/wx-cloud-client-sdk
- **问题**：入口文件是 `lib/wxCloudClientSDK.cjs.js` 而非 `index.js`
- **修复**：创建 `index.js` 导出正确文件

## 快速修复

### 方法一：使用脚本（推荐）

```bash
./scripts/fix-miniprogram-npm.sh
```

### 方法二：手动修复

```bash
# 1. 清理
npm run clean:miniprogram_npm

# 2. 复制并转换所有包
npm run build:copy:packages
npm run build:cjs:packages

# 3. 验证
ls miniprogram_npm/@tencentcloud/
```

## NPM Scripts

已添加以下脚本到 `package.json`：

- `npm run build:copy:packages` - 复制所有 npm 包到 miniprogram_npm
- `npm run build:cjs:packages` - 转换 ES Module 为 CommonJS
- `npm run build:cjs` - 完整构建流程（复制 + 转换）

## 转换原理

使用 esbuild 将 ES Module 转换为 CommonJS：

```bash
npx esbuild node_modules/@tencentcloud/chat-uikit-engine/index.js \
  --bundle \
  --format=cjs \
  --outfile=miniprogram_npm/@tencentcloud/chat-uikit-engine/index.cjs.js \
  --external:@tencentcloud/chat \
  --external:tim-upload-plugin \
  --external:tim-profanity-filter-plugin
```

**参数说明**：
- `--bundle`：打包所有依赖
- `--format=cjs`：输出 CommonJS 格式
- `--external`：不打包外部依赖，保持引用

## 更新包后

当更新 npm 包后，需要重新运行修复脚本：

```bash
npm update
./scripts/fix-miniprogram-npm.sh
```

## 验证

```bash
# 检查所有必需文件
test -f miniprogram_npm/@tencentcloud/chat/index.js && echo "✅ chat"
test -f miniprogram_npm/@tencentcloud/tui-core/index.cjs.js && echo "✅ tui-core"
test -f miniprogram_npm/@tencentcloud/chat-uikit-engine/index.cjs.js && echo "✅ chat-uikit-engine"
test -f miniprogram_npm/@tencentcloud/chat-uikit-wechat/index.cjs.js && echo "✅ chat-uikit-wechat"
test -f miniprogram_npm/@vant/icon/index.json && echo "✅ @vant/weapp"
test -f miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js && echo "✅ wx-cloud-client-sdk"
```

## 下一步

在微信开发者工具中：

1. **清除缓存**：
   - 工具 → 清除缓存 → 清除文件缓存
   - 工具 → 清除缓存 → 清除数据缓存

2. **重新编译**：
   - 点击"编译"按钮（或按 Cmd+B）

3. **检查控制台**：
   - 应该看到 `[APP] 初始化 TUI 组件` 日志
   - 不应该有模块未定义错误
