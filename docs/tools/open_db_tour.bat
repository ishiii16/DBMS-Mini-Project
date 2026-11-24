@echo off
title MoodTune database - PostgreSQL moodmusic (port 5433)
mode con cols=190 lines=60
chcp 65001 >nul
set PGCLIENTENCODING=UTF8
cd /d "%~dp0..\.."
for /f "tokens=1,* delims==" %%a in ('findstr /b DATABASE_URL web\.env.local') do set DBURL=%%b
"C:\Program Files\PostgreSQL\18\bin\psql.exe" "%DBURL%" -P pager=off -f docs\db_tour.sql
"C:\Program Files\PostgreSQL\18\bin\psql.exe" "%DBURL%"
