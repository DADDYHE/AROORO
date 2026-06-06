#!/bin/bash

echo "🧹 开始清理小程序缓存..."

# 清理编译输出目录
echo "📁 清理 dist 目录..."
find . -type d -name "dist" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# 清理临时文件
echo "🗑️  清理临时文件..."
find . -type f -name "*.wxss" -path "*/.miniprogram/*" -delete 2>/dev/null || true
find . -type f -name "*.wxml" -path "*/.miniprogram/*" -delete 2>/dev/null || true
find . -type f -name "*.js" -path "*/.miniprogram/*" -delete 2>/dev/null || true

# 清理日志
echo "📝 清理日志文件..."
find . -type f -name "*.log" -delete 2>/dev/null || true

echo "✅ 清理完成！"
echo ""
echo "⚠️  接下来请在微信开发者工具中执行："
echo "   1. 工具 → 清除缓存 → 清除全部缓存"
echo "   2. 重新编译项目 (Cmd + B / Ctrl + B)"
echo "   3. 如果问题仍然存在，重启微信开发者工具"
