@echo off
cd /d "%~dp0app"
if not exist node_modules call npm install
if not exist dist\index.html call npm run build
start "" http://localhost:4173
call npm run preview
