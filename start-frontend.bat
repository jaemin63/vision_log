@echo off
title Frontend - Robot Image Logger
cd /d "%~dp0frontend"
echo Starting frontend dev server...
npm run dev -- --host 0.0.0.0
pause
