@echo off
REM Push local commits to the staging branch on GitHub.
REM Credentials must be pre-stored in %USERPROFILE%\.git-credentials
REM (run _store_cred.bat once to set them up).
cd /d D:\Integrum_dashboard
git add -A
git commit -m "Task4+GIL migration: v3 schema, C9/GIL routes, import scripts" 2>nul
echo Running git push... > D:\Integrum_dashboard\push_log.txt
git config credential.helper store
git push --force https://github.com/manali-logoslabs/integrum-dashboard.git HEAD:staging >> D:\Integrum_dashboard\push_log.txt 2>&1
echo Exit code: %ERRORLEVEL% >> D:\Integrum_dashboard\push_log.txt
type D:\Integrum_dashboard\push_log.txt
pause
