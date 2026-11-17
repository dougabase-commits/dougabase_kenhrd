#!/bin/bash
# macOS: ダブルクリックで起動
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js が見つかりません。https://nodejs.org/ からインストールしてください。"
  read -r -p "Enter で閉じます" _
  exit 1
fi
[ -d node_modules ] || npm install
(sleep 1.5; open "http://localhost:8160/") &
node server.js
