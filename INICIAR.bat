@echo off
title KOMBAT.IO - Servidor
color 0A
echo.
echo  ==========================================
echo    KOMBAT.IO - Iniciando servidor...
echo  ==========================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERRO: Node.js nao instalado!
    echo.
    echo  Instale em: https://nodejs.org  ^(versao LTS^)
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

echo  Node.js OK:
node --version
echo.
echo  ==========================================
echo   Acesse: http://localhost:3000
echo  ==========================================
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
node server.js
pause
