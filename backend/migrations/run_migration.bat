@echo off
REM ============================================================
REM  Run v3 schema migration + Excel import for C9 and GIL
REM  Run this ONCE after pulling the updated backend code.
REM ============================================================

cd /d D:\Integrum_dashboard\backend

REM ── Step 0: Extract GIL zip to the expected directory ────────
set GIL_ZIP=C:\Users\Abcom\AppData\Roaming\Claude\local-agent-mode-sessions\31d015be-27b1-47a2-91d9-339cb003e419\f54f9bc1-6764-456b-a6bb-67d5d37e3317\local_6f45bcb2-5c03-4398-a081-79ff081bddcc\uploads\GIL SETTLEMENT_NEW-20260722T114244Z-1-001.zip
set GIL_OUT=C:\Users\Abcom\AppData\Roaming\Claude\local-agent-mode-sessions\31d015be-27b1-47a2-91d9-339cb003e419\f54f9bc1-6764-456b-a6bb-67d5d37e3317\local_6f45bcb2-5c03-4398-a081-79ff081bddcc\uploads\gil_data

echo.
echo === Step 0: Extract GIL Excel files ===
if not exist "%GIL_OUT%\GIL SETTLEMENT_NEW" (
    powershell -Command "Expand-Archive -Path '%GIL_ZIP%' -DestinationPath '%GIL_OUT%' -Force"
    if %ERRORLEVEL% NEQ 0 ( echo FAILED: GIL zip extraction & pause & exit /b 1 )
    echo GIL zip extracted OK
) else (
    echo GIL files already extracted, skipping
)

echo.
echo === Step 1: Apply schema migration ===
set PGPASSWORD=integrum_pass
psql -h localhost -U integrum -d integrum -f migrations\v3_unified_schema.sql
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: Schema migration
    pause & exit /b 1
)
echo Schema migration OK

echo.
echo === Step 2: Import C9 Excel data ===
python migrations\import_c9_excel.py
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: C9 import
    pause & exit /b 1
)
echo C9 import OK

echo.
echo === Step 3: Import GIL Excel data ===
python migrations\import_gil_excel.py
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: GIL import
    pause & exit /b 1
)
echo GIL import OK

echo.
echo === All done! ===
pause
