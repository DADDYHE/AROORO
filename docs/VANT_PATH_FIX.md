# 修复 @vant/weapp 组件路径错误

## 问题描述

```
[ app.json 文件内容错误] app.json: ["usingComponents"]["van-icon"]: "@vant/weapp/icon/index", 
component not found in the path: /Users/yy/Documents/trae_projects/zuoyou/@vant/weapp/icon/index
```

## 根本原因

1. **npm 包结构问题**：`@vant/weapp` 的源码包含 `dist/` 目录，实际组件代码在 `dist/` 下
2. **复制路径错误**：直接复制整个包导致路径为 `miniprogram_npm/@vant/weapp/dist/icon/index`
3. **引用路径不匹配**：app.json 中引用 `@vant/weapp/icon/index`，但实际文件在 `@vant/weapp/dist/icon/index`

## 修复方案

### 1. 清理并正确复制 @vant/weapp

```bash
# 删除错误的复制
rm -rf miniprogram_npm/@vant/weapp

# 创建目录
mkdir -p miniprogram_npm/@vant

# 将 dist/ 的内容复制到 @vant/ 根目录（跳过 dist 这一层）
cp -r node_modules/@vant/weapp/dist/* miniprogram_npm/@vant/
```

### 2. 修改组件引用路径

将所有文件中的 `@vant/weapp/` 替换为 `@vant/`：

```bash
find . -name "*.json" -type f -exec sed -i '' 's|@vant/weapp/|@vant/|g' {} \;
```

### 3. 修复后的文件结构

```
miniprogram_npm/
├── @vant/
│   ├── icon/
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── ...
│   ├── button/
│   ├── field/
│   ├── calendar/
│   └── ...
└── @tencentcloud/
    └── ...
```

## 修复前后对比

### 修复前（错误）
```json
{
  "usingComponents": {
    "van-icon": "@vant/weapp/icon/index",
    "van-button": "@vant/weapp/button/index"
  }
}
```

文件路径：`miniprogram_npm/@vant/weapp/dist/icon/index` ❌

### 修复后（正确）
```json
{
  "usingComponents": {
    "van-icon": "@vant/icon/index",
    "van-button": "@vant/button/index"
  }
}
```

文件路径：`miniprogram_npm/@vant/icon/index` ✅

## 批量修改的文件列表

以下所有 JSON 文件中的 `@vant/weapp/` 已替换为 `@vant/`：

1. `app.json`
2. `custom-tab-bar/index.json`
3. `pages/home/index.json`
4. `pages/pet/list.json`
5. `pages/pet/detail.json`
6. `pages/pet/update-profile.json`
7. `pages/booking/calendar.json`
8. `subpackages/hosting/index.json`
9. `subpackages/booking/calendar.json`
10. `subpackages/booking/confirm.json`
11. `subpackages/booking/pet-select.json`
12. `subpackages/booking/requirements.json`
13. `subpackages/pet/create-step1.json`
14. `subpackages/pet/create-step2.json`
15. `subpackages/pet/create-step3.json`
16. `subpackages/pet/create-step4.json`
17. `subpackages/host-register/step1.json`
18. `subpackages/host-register/step2.json`
19. `subpackages/host-register/step3.json`
20. `subpackages/host-register/step4.json`
21. `subpackages/other/favorites/index.json`

## 验证结果

```bash
✅ @vant/icon/index.json exists
✅ @vant/button/index.json exists
✅ @vant/field/index.json exists
✅ 无 lint 错误
✅ 所有文件引用路径已更新
```

## 小程序开发者工具操作

完成以上修复后，请在微信开发者工具中：

1. **清除缓存**：
   - 工具 → 清除缓存 → 清除文件缓存
   - 工具 → 清除缓存 → 清除数据缓存

2. **重新编译**：
   - 点击"编译"按钮（或按 Cmd+B）

3. **重启开发者工具**（推荐）：
   - 完全退出微信开发者工具
   - 重新打开项目

## 后续维护建议

### 添加自动化脚本

在 `package.json` 中添加完整的构建脚本：

```json
{
  "scripts": {
    "build:npm:manual": "npm run clean:miniprogram_npm && npm run copy:npm:all",
    "copy:npm:all": "npm run copy:tencentcloud && npm run copy:vant && npm run copy:tim-plugins",
    "copy:tencentcloud": "mkdir -p miniprogram_npm/@tencentcloud && cp -r node_modules/@tencentcloud/chat miniprogram_npm/@tencentcloud/ && cp -r node_modules/@tencentcloud/tui-core miniprogram_npm/@tencentcloud/",
    "copy:vant": "mkdir -p miniprogram_npm/@vant && cp -r node_modules/@vant/weapp/dist/* miniprogram_npm/@vant/",
    "copy:tim-plugins": "cp -r node_modules/tim-upload-plugin miniprogram_npm/ && cp -r node_modules/tim-profanity-filter-plugin miniprogram_npm/ && cp -r node_modules/tim-wx-sdk miniprogram_npm/"
  }
}
```

### 安装新包后

每次运行 `npm install` 安装新包后，需要重新运行：

```bash
npm run build:npm:manual
```

## 相关问题文档

- [修复 @tencentcloud/chat 模块错误](./NPM_MODULE_FIX.md)
- [修复 IM SDK isReady 错误](./IM_SDK_ERROR_FIX_V2.md)

## 修复时间
2025-02-06
