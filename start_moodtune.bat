@echo off
title MoodTune
cd /d "%~dp0"
set PG="C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
echo [1/3] Starting the MoodTune database (PostgreSQL, port 5433)...
%PG% -D .pgdata status >nul 2>&1 || %PG% -D .pgdata -o "-p 5433" -l .pgdata\server.log start -w
echo [2/3] Starting the web app on http://localhost:3000 ...
cd web
if not exist node_modules call npm install
if not exist .next\BUILD_ID call npm run build
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"
echo [3/3] Running. Log in: ishika@demo.com or admin@demo.com  (password123)
echo       Keep this window open. Close it (or press Ctrl+C) to stop the app.
call npm run start
