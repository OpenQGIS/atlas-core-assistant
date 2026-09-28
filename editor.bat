@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Python，请先安装 Python 3.10+ 并勾选 "Add to PATH"
  echo 下载地址: https://www.python.org/downloads/
  pause
  exit /b 1
)
python -c "import PIL" >nul 2>nul
if errorlevel 1 (
  echo 首次运行，正在安装依赖 Pillow...
  python -m pip install Pillow
)
rem 最小化控制台运行服务（出错时窗口保留可看日志）
start "AtlasEditor" /min cmd /k "python editor.py --no-browser"
timeout /t 2 >nul
start http://127.0.0.1:8098
