@echo off
echo Starting Digital Twin Simulator...
echo.
cd /d "%~dp0"

:: Start the application and automatically open the default browser
call npm run dev -- --open

pause
