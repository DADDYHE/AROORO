#!/bin/bash
# =============================================================================
# deploy_cloudfunctions.sh  ——  本地准备脚本（【非】真实部署）
# =============================================================================
# ⚠️  重要：本脚本【仅做本地准备】，不会把代码上传到 CloudBase！
#   它只负责：逐个云函数目录执行 `npm install` 并提示配置漂移 / 编译提醒。
#   真正的部署（上传）由 cloudbaserc.json 驱动，推荐命令为：
#
#       tcb fn deploy            # 部署 cloudbaserc.json 中定义的所有函数
#       tcb fn deploy <函数名>   # 部署单个函数
#
#   前提：需安装并登录 CloudBase CLI（`npm i -g @cloudbase/cli`，`tcb login`）。
#   也可直接在「微信开发者工具 / IDE」中右键云函数目录选择「上传并部署」。
#
#   权威部署说明见 docs/runbook-remediation-2026-07-26.md（仓库根目录无 README.md）。
#
# 用法：
#   ./deploy_cloudfunctions.sh            # 仅本地准备（默认，不上传）
#   ./deploy_cloudfunctions.sh --upload   # 本地准备完成后调用 `tcb fn deploy` 真实上传
# =============================================================================

set -e

# --upload：本地准备完成后调用真实上传命令（需已安装并登录 tcb CLI）
UPLOAD_MODE=0
if [ "$1" = "--upload" ]; then
  UPLOAD_MODE=1
  if ! command -v tcb >/dev/null 2>&1; then
    echo "❌ --upload 需要 CloudBase CLI（tcb），请先执行：npm i -g @cloudbase/cli && tcb login"
    exit 1
  fi
fi

echo "🚀 开始批量部署云函数..."

# 与 cloudbaserc.json 对齐的可部署云函数列表
# 任何修改请同时同步：
#   - cloudbaserc.json 中 functions[] / framework.plugins.function.inputs.functions[]
#   - 本脚本 CLOUD_FUNCTIONS 数组
CLOUD_FUNCTIONS=(
  # 普通 API 云函数（timeout 10s）
  "userService"
  "hostService"
  "orderService"
  "petService"
  "favoriteService"
  "activityService"
  "mallService"
  "feedingService"
  "adminService"
  "utilityService"
  "couponService"
  "tuanService"
  "paymentService"
  "partnerService"
  "i18nOverride"
  # 定时 / 定时清理云函数（timeout 30s）
  "orderTimeoutService"
  "couponExpiryCheck"
  "tuanExpiryCheck"
  "rateLimitCleanup"
)

# 云函数目录
CLOUD_FUNCTIONS_DIR="./cloudfunctions"

# 检查目录是否存在
if [ ! -d "$CLOUD_FUNCTIONS_DIR" ]; then
  echo "❌ 云函数目录不存在：$CLOUD_FUNCTIONS_DIR"
  exit 1
fi

# 检测 cloudfunctions/ 下存在但未列入 CLOUD_FUNCTIONS 的目录（配置漂移提醒）
ORPHANS=()
for d in "$CLOUD_FUNCTIONS_DIR"/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  # common 是共享模块目录，不是云函数
  [ "$name" = "common" ] && continue
  listed=0
  for f in "${CLOUD_FUNCTIONS[@]}"; do
    if [ "$f" = "$name" ]; then
      listed=1
      break
    fi
  done
  if [ "$listed" = "0" ]; then
    ORPHANS+=("$name")
  fi
done
if [ ${#ORPHANS[@]} -gt 0 ]; then
  echo "⚠️  以下云函数目录存在但未列入 CLOUD_FUNCTIONS（也不会被 cloudbaserc.json 部署）："
  for o in "${ORPHANS[@]}"; do echo "   - $o"; done
  echo "   确认无误请同步更新本脚本与 cloudbaserc.json"
  echo ""
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

  # --upload：本地准备完成后调用真实上传命令
  if [ "$UPLOAD_MODE" = "1" ]; then
    echo "☁️  上传部署：$func ..."
    tcb fn deploy "$func" 2>&1 | tail -5 || echo "⚠️  $func 上传失败，请检查 tcb 登录状态与 cloudbaserc.json"
  fi

  # 返回项目根目录
  cd - > /dev/null

  echo "✅ $func 部署完成"
  echo ""
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 所有云函数部署完成！"
echo ""
echo "⚠️  接下来请在微信开发者工具中重新编译小程序。"
