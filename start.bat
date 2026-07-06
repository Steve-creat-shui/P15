@echo off
title JEVS Start

echo Starting JEVS...

cd /d %~dp0

docker compose up -d db backend adminer mailcatcher

cd frontend
start cmd /k npm run dev

echo.
echo Services started!
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000
echo.
pause