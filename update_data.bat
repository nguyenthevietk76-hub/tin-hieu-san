@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
python pipeline\fetch_fin.py
if errorlevel 1 exit /b 1
python pipeline\build_data.py %*
if errorlevel 1 exit /b 1
cd app
call npm run build
