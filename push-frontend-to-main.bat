@echo off
setlocal EnableDelayedExpansion

echo ============================================================
echo  Integrum Dashboard - Push Frontend to main branch
echo ============================================================
echo.

REM Set GITHUB_TOKEN env var before running this script (or store via _store_cred.bat)
set TOKEN=%GITHUB_TOKEN%
set REMOTE=https://manali-logoslabs:%TOKEN%@github.com/manali-logoslabs/integrum-dashboard.git
set TMPDIR=%TEMP%\integrum-main-push

REM Clean up any previous temp dir
if exist "%TMPDIR%" (
    echo Cleaning previous temp directory...
    rmdir /s /q "%TMPDIR%"
)
mkdir "%TMPDIR%"
echo Temp directory: %TMPDIR%
echo.

REM Copy frontend contents (not the frontend folder itself, but its contents)
echo Copying frontend files...
xcopy /E /I /Q /H "D:\Integrum_dashboard\frontend\*" "%TMPDIR%\"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: xcopy failed!
    pause
    exit /b 1
)
echo Done copying.
echo.

REM Initialize a fresh git repo in temp dir
cd /d "%TMPDIR%"
git init
git config user.name "manali-logoslabs"
git config user.email "manali@logos-labs.com"

REM Create a .gitignore to exclude node_modules and dist
(
    echo node_modules/
    echo dist/
    echo .env
    echo .env.local
    echo *.log
) > .gitignore

REM Stage everything
git add .
git status --short

REM Commit
git commit -m "feat: frontend-only demo with static mock data

- Removed all backend/database dependencies
- Replaced API layer with static mock data (Aug-Nov 2025)
- C9 dashboard: 11 units, full widget library, drag-and-drop
- GIL dashboard: wind+solar, 8 turbines, all charts
- Light/Dark mode, Lock/Presentation mode, Fullscreen widgets
- No backend server required - runs standalone with Vite
- Mock data covers: KPI, daily, monthly, TOD, DISCOM, banking, heatmap
"

echo.
echo Pushing to main branch (force)...
git push --force %REMOTE% HEAD:main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo  SUCCESS! Frontend pushed to main branch.
    echo  View at: https://github.com/manali-logoslabs/integrum-dashboard/tree/main
    echo ============================================================
) else (
    echo.
    echo FAILED: git push returned error code %ERRORLEVEL%
    echo Check your network connection or token.
)

echo.
pause
