# chat-uikit-engine 模块修复

## 问题描述

```
[APP] 预加载chat-uikit-engine失败，但不影响应用启动: Error: module '@tencentcloud/chat-uikit-engine.js' is not defined, require args is '@tencentcloud/chat-uikit-engine'
```

## 根本原因

`@tencentcloud/chat-uikit-engine` 包使用 ES Module 语法（`import/export`），但微信小程序只支持 CommonJS 格式。

## 修复方案

### 1. 安装 esbuild 工具
```bash
npm install --save-dev esbuild
```

### 2. 使用 esbuild 转换 ES Module 为 CommonJS
```bash
npx esbuild node_modules/@tencentcloud/chat-uikit-engine/index.js \
  --bundle \
  --format=cjs \
  --outfile=miniprogram_npm/@tencentcloud/chat-uikit-engine/index.cjs.js \
  --external:@tencentcloud/chat \
  --external:tim-upload-plugin \
  --external:tim-profanity-filter-plugin
```

### 3. 更新 package.json
修改 `main` 入口指向转换后的文件：
```json
{
  "main": "index.cjs.js",
  "type": "commonjs"
}
```

## 转换结果

- ✅ 文件大小：210.4kb
- ✅ 格式：CommonJS
- ✅ 所有导入导出已正确转换
- ✅ 外部依赖正确引用

## 注意事项

- `--external` 参数确保不打包 `@tencentcloud/chat` 等外部依赖
- 保持依赖引用，使用小程序已安装的包
- 每次更新包后需要重新转换

## 验证

```bash
test -f miniprogram_npm/@tencentcloud/chat-uikit-engine/index.cjs.js
# 输出: ✅ index.cjs.js exists
```
