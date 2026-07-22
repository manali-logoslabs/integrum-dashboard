@echo off
echo ============================================================
echo  Adding GitHub Actions workflow to main branch
echo ============================================================
echo.

REM Set GITHUB_TOKEN env var before running this script (or store via _store_cred.bat)
set TOKEN=%GITHUB_TOKEN%
set REMOTE=https://manali-logoslabs:%TOKEN%@github.com/manali-logoslabs/integrum-dashboard.git
set TMPDIR=%TEMP%\integrum-workflow-push
set SRCFILE=D:\Integrum_dashboard\frontend\.github\workflows\deploy.yml

REM Verify source file exists
if not exist "%SRCFILE%" (
    echo ERROR: Source file not found: %SRCFILE%
    echo Make sure D:\Integrum_dashboard\frontend\.github\workflows\deploy.yml exists.
    pause
    exit /b 1
)
echo Source workflow file found OK.

REM Clean up previous temp dir
if exist "%TMPDIR%" rmdir /s /q "%TMPDIR%"
mkdir "%TMPDIR%"

echo Cloning main branch...
git clone --depth 1 --branch main %REMOTE% "%TMPDIR%"
if %ERRORLEVEL% NEQ 0 ( echo ERROR: clone failed & pause & exit /b 1 )

cd /d "%TMPDIR%"
git config user.name "manali-logoslabs"
git config user.email "manali@logos-labs.com"

REM Create target directory and copy workflow file
mkdir ".github\workflows" 2>nul
copy /Y "%SRCFILE%" ".github\workflows\deploy.yml"
if %ERRORLEVEL% NEQ 0 ( echo ERROR: copy failed & pause & exit /b 1 )

echo.
echo Workflow file content:
type ".github\workflows\deploy.yml"
echo.

git add .github\workflows\deploy.yml
git status
git commit -m "ci: add GitHub Actions deploy workflow"
git push %REMOTE% main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo  SUCCESS! GitHub Actions will now build and deploy your site.
    echo  Watch at:
    echo  https://github.com/manali-logoslabs/integrum-dashboard/actions
    echo  Site URL: https://manali-logoslabs.github.io/integrum-dashboard/
    echo ============================================================
) else (
    echo FAILED: push returned error %ERRORLEVEL%
)
echo.
pause
