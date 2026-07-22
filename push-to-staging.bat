@echo off
cd /d D:\Integrum_dashboard
echo.
echo ============================================================
echo  Push to staging branch - Integrum Dashboard
echo ============================================================
echo.

:: Try gh CLI first (no PAT needed if already authenticated)
where gh >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Using GitHub CLI...
    gh auth status >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        git push origin main:staging
        goto :done
    ) else (
        echo gh CLI not authenticated. Run: gh auth login
    )
)

:: Fall back to PAT
echo Enter your GitHub Personal Access Token (repo scope^):
echo Get one at: https://github.com/settings/tokens
echo.
SET /P PAT="PAT: "
echo.

if "%PAT%"=="" (
    echo ERROR: No token entered. Aborting.
    pause
    exit /b 1
)

echo Pushing main to staging...
git push https://manali-logoslabs:%PAT%@github.com/manali-logoslabs/integrum-dashboard.git main:staging

:done
if %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS: Code pushed to staging branch.
    echo View at: https://github.com/manali-logoslabs/integrum-dashboard/tree/staging
) else (
    echo.
    echo FAILED: Check token and network connection.
)
echo.
pause
