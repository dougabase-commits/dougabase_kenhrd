@echo off
rem Windows: ダブルクリックで起動
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js が見つかりません。https://nodejs.org/ からインストールしてください。& pause & exit /b 1)
if not exist node_modules call npm install
start "" http://localhost:8160/
node server.js
pause
