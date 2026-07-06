@echo off
title JEVS Stop

echo Stopping JEVS...

cd /d %~dp0

docker compose down

taskkill /FI "WINDOWTITLE eq npm*" /F >nul 2>&1

echo.
echo All services stopped.
pause