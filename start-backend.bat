@echo off
title Backend - Robot Image Logger
cd /d "%~dp0backend"
set "HOST=0.0.0.0"
echo Starting backend server...
npm run start:dev
pause
