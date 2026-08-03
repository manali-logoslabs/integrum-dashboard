@echo off
title Integrum Dashboard — Dev Server
cd /d D:\Integrum_dashboard\frontend
echo.
echo  ==========================================
echo   Integrum Dashboard v2 — Local Dev Server
echo  ==========================================
echo.
echo  Landing    → http://localhost:5173/integrum-dashboard/new
echo  C9 v2      → http://localhost:5173/integrum-dashboard/new/c9
echo  C9 v1      → http://localhost:5173/integrum-dashboard/old/c9
echo.
echo  Starting...
echo.
npm run dev
pause
