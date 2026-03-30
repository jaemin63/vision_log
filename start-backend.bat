@echo off
title Backend - Robot Image Logger
cd /d "%~dp0backend"
echo Starting backend server...
npm run start:dev
pause
