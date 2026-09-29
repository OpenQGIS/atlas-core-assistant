@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/4] 切换到 website 分支...
git checkout website || goto :err
echo [2/4] 从 main 同步静态站点 (index.html + static/)...
git checkout main -- index.html static || goto :err
echo     递增缓存版本号 (?v=N，与线上版本取最大防撞号)...
python bump_version.py
echo [3/4] 提交并推送...
git add index.html static
git commit -m "sync: 从 main 同步静态站点" 2>nul
if errorlevel 1 (
  echo   没有变更，无需同步。
) else (
  git push origin website || goto :err
)
echo [4/4] 切回 main 分支...
git checkout main
echo.
echo 完成！GitHub Pages 将在约 1 分钟后自动更新。
pause
exit /b 0
:err
echo.
echo 出错了，请检查 git 输出。已停留在当前分支。
pause
exit /b 1
