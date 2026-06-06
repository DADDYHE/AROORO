#!/bin/bash

echo "🚀 开始批量部署云函数..."

# 定义需要部署的云函数列表
CLOUD_FUNCTIONS=(
  "userService"
  "petService"
  "orderService"
  "hostService"
  "adminService"
  "activityService"
  "mallService"
  "favoriteService"
  "feedingService"
  "IMUserService"
  "utilityService"
  "cloudbase_auth"
  "dbInit"
)

# 云函数目录
CLOUD_FUNCTIONS_DIR="./cloudfunctions"

# 检查目录是否存在
if [ ! -d "$CLOUD_FUNCTIONS_DIR" ]; then
  echo "❌ 云函数目录不存在：$CLOUD_FUNCTIONS_DIR"
  exit 1
fi

# 遍历并部署每个云函数
for func in "${CLOUD_FUNCTIONS[@]}"; do
  echo ""
  echo "📦 正在部署：$func"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  func_path="$CLOUD_FUNCTIONS_DIR/$func"
  
  if [ ! -d "$func_path" ]; then
    echo "⚠️  云函数目录不存在：$func_path"
    continue
  fi
  
  # 进入云函数目录
  cd "$func_path"
  
  # 安装依赖
  echo "📥 安装依赖..."
  npm install --production 2>&1 | tail -3
  
  # 返回项目根目录
  cd - > /dev/null
  
  echo "✅ $func 部署完成"
  echo ""
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 所有云函数部署完成！"
echo ""
echo "⚠️  接下来请："
echo "   1. 在微信开发者工具中重新编译小程序"
echo "   2. 清除小程序缓存（工具 → 清除缓存 → 清除全部缓存）"
echo "   3. 测试头像加载是否正常"
