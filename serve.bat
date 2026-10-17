@echo off
chcp 65001 >nul
title بقالة عم عبده - سيرفر محلي
echo.
echo   ============================================
echo     بقالة عم عبده - تشغيل الموقع محلياً
echo   ============================================
echo.
echo   العنوان:  http://localhost:8080
echo   للايقاف:  اضغط Ctrl + C
echo.
start "" http://localhost:8080
python -m http.server 8080
pause
