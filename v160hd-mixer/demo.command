#!/bin/bash
# 実機なしのデモ（シミュレーター + ミキサー）
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
node mock/mock-v160hd.js --port 18023 &
MOCK=$!
trap 'kill $MOCK' EXIT
(sleep 1.5; open "http://localhost:8160/" 2>/dev/null || xdg-open "http://localhost:8160/") &
node server.js --host 127.0.0.1 --port 18023
