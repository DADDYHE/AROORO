#!/bin/bash

echo "=== 修复 miniprogram_npm 包 ==="
echo ""

# 清理旧的 miniprogram_npm
echo "1. 清理 miniprogram_npm..."
rm -rf miniprogram_npm/*

# 创建目录
mkdir -p miniprogram_npm/@tencentcloud
mkdir -p miniprogram_npm/@vant
mkdir -p miniprogram_npm/@cloudbase

# 复制 @tencentcloud/chat
echo "2. 复制 @tencentcloud/chat..."
cp -r node_modules/@tencentcloud/chat miniprogram_npm/@tencentcloud/

# 复制 @tencentcloud/tui-core
echo "3. 复制 @tencentcloud/tui-core..."
cp -r node_modules/@tencentcloud/tui-core miniprogram_npm/@tencentcloud/

# 转换 tui-core 为 CommonJS
echo "4. 转换 tui-core 为 CommonJS..."
npx esbuild node_modules/@tencentcloud/tui-core/index.js \
  --bundle \
  --format=cjs \
  --outfile=miniprogram_npm/@tencentcloud/tui-core/index.cjs.js \
  --external:@tencentcloud/chat

# 更新 tui-core package.json
sed -i '' 's/"main": "index.js"/"main": "index.cjs.js"/' miniprogram_npm/@tencentcloud/tui-core/package.json

# 复制 @tencentcloud/chat-uikit-engine
echo "5. 复制 @tencentcloud/chat-uikit-engine..."
cp -r node_modules/@tencentcloud/chat-uikit-engine miniprogram_npm/@tencentcloud/

# 转换 chat-uikit-engine 为 CommonJS
echo "6. 转换 chat-uikit-engine 为 CommonJS..."
npx esbuild node_modules/@tencentcloud/chat-uikit-engine/index.js \
  --bundle \
  --format=cjs \
  --outfile=miniprogram_npm/@tencentcloud/chat-uikit-engine/index.cjs.js \
  --external:@tencentcloud/chat \
  --external:tim-upload-plugin \
  --external:tim-profanity-filter-plugin

# 更新 chat-uikit-engine package.json
sed -i '' 's/"main": "index.js"/"main": "index.cjs.js"/' miniprogram_npm/@tencentcloud/chat-uikit-engine/package.json

# 复制 @tencentcloud/chat-uikit-wechat
echo "7. 复制 @tencentcloud/chat-uikit-wechat..."
cp -r node_modules/@tencentcloud/chat-uikit-wechat miniprogram_npm/@tencentcloud/

# 转换 chat-uikit-wechat 为 CommonJS
echo "8. 转换 chat-uikit-wechat 为 CommonJS..."
npx esbuild node_modules/@tencentcloud/chat-uikit-wechat/index.js \
  --bundle \
  --format=cjs \
  --outfile=miniprogram_npm/@tencentcloud/chat-uikit-wechat/index.cjs.js \
  --external:@tencentcloud/chat \
  --external:tim-upload-plugin \
  --external:tim-profanity-filter-plugin \
  --external:@tencentcloud/tui-core \
  --external:@tencentcloud/chat-uikit-engine

# 更新 chat-uikit-wechat package.json
sed -i '' 's/"main": "index.js"/"main": "index.cjs.js"/' miniprogram_npm/@tencentcloud/chat-uikit-wechat/package.json

# 复制 tim-upload-plugin
echo "9. 复制 tim-upload-plugin..."
cp -r node_modules/tim-upload-plugin miniprogram_npm/

# 复制 tim-profanity-filter-plugin
echo "10. 复制 tim-profanity-filter-plugin..."
cp -r node_modules/tim-profanity-filter-plugin miniprogram_npm/

# 复制 @cloudbase/wx-cloud-client-sdk
echo "11. 复制 @cloudbase/wx-cloud-client-sdk..."
cp -r node_modules/@cloudbase/wx-cloud-client-sdk/lib miniprogram_npm/@cloudbase/wx-cloud-client-sdk
cp node_modules/@cloudbase/wx-cloud-client-sdk/package.json miniprogram_npm/@cloudbase/wx-cloud-client-sdk/
echo 'module.exports = require("./wxCloudClientSDK.cjs.js")' > miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js

# 复制 @vant/weapp
echo "12. 复制 @vant/weapp..."
cp -r node_modules/@vant/weapp/dist/* miniprogram_npm/@vant/

# 验证所有文件
echo ""
echo "=== 验证结果 ==="
echo "chat: $(test -f miniprogram_npm/@tencentcloud/chat/index.js && echo '✅' || echo '❌')"
echo "tui-core: $(test -f miniprogram_npm/@tencentcloud/tui-core/index.cjs.js && echo '✅' || echo '❌')"
echo "chat-uikit-engine: $(test -f miniprogram_npm/@tencentcloud/chat-uikit-engine/index.cjs.js && echo '✅' || echo '❌')"
echo "chat-uikit-wechat: $(test -f miniprogram_npm/@tencentcloud/chat-uikit-wechat/index.cjs.js && echo '✅' || echo '❌')"
echo "tim-upload-plugin: $(test -f miniprogram_npm/tim-upload-plugin/index.js && echo '✅' || echo '❌')"
echo "tim-profanity-filter-plugin: $(test -f miniprogram_npm/tim-profanity-filter-plugin/index.js && echo '✅' || echo '❌')"
echo "wx-cloud-client-sdk: $(test -f miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js && echo '✅' || echo '❌')"
echo "@vant/weapp: $(test -f miniprogram_npm/@vant/icon/index.json && echo '✅' || echo '❌')"

echo ""
echo "✅ 所有 npm 包修复完成！"
echo "请在微信开发者工具中清除缓存并重新编译"
