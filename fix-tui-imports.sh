#!/bin/bash
# 批量修复 TUI-Messages 组件中的 import 语句

cd /Users/yy/Documents/trae_projects/zuoyou/TUI-Messages

# 修复使用 import 的组件文件
FILES=(
  "TUIChat/components/MessagePrivate/ServiceEvaluation/index.js"
  "TUIChat/components/MessagePrivate/OrderList/index.js"
  "TUIChat/components/MessageElements/ImageMessage/index.js"
  "TUIChat/components/MessageElements/SystemMessage/index.js"
  "TUIChat/components/MessageElements/AudioMessage/index.js"
  "TUIChat/components/MessageElements/TipMessage/index.js"
  "TUIChat/components/MessageElements/VideoMessage/index.js"
  "TUIChat/components/MessageElements/TextMessage/index.js"
  "TUIChat/components/MessageElements/Emoji/index.js"
  "TUIConversation/components/JoinGroup/index.js"
  "TUIConversation/components/ConversationItem/index.js"
  "TUIConversation/components/CreateGroup/index.js"
  "TUIGroup/index.js"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "修复文件: $file"
    # 检查文件内容
    head -5 "$file"
    echo "---"
  else
    echo "文件不存在: $file"
  fi
done
