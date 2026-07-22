@echo off
echo [1/2] Stopping any existing Python/uvicorn processes...
taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM python3.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo [2/2] Starting PostgreSQL service...
net start postgresql-x64-17 2>nul

echo [3/3] Starting FastAPI backend on port 8000...
start "Integrum Backend" cmd /k "cd /d D:\Integrum_dashboard\backend && .venv\Scripts\activate && uvicorn main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

echo [4/4] Starting Vite frontend on port 5173...
start "Integrum Frontend" cmd /k "cd /d D:\Integrum_dashboard\frontend && npm run dev"

echo.
echo Both servers starting:
echo   Backend:  http://localhost:8000/api/health
echo   Frontend: http://localhost:5173/c9
echo.
pause
