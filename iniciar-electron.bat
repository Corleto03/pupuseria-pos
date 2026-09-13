@echo off
chcp 65001 >nul
title POS - Modo Desktop Electron
cls

echo =======================================================
echo          POS RESTAURANTE - MODO ELECTRON
echo =======================================================
echo.
echo Detectando red local...

for /f "tokens=*" %%i in ('node -e "const os=require('os');const ifaces=os.networkInterfaces();for(const k in ifaces){for(const i of ifaces[k]){if(i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254')){console.log(i.address);process.exit(0);}}}"') do set LOCAL_IP=%%i

if defined LOCAL_IP (
  echo.
  echo  PC Local:  http://localhost:3000
  echo  📱 Celular: http://%LOCAL_IP%:3000
  echo.
  echo  * Para conectar tu celular, conectalo al mismo Wi-Fi
  echo    y abre en el navegador: http://%LOCAL_IP%:3000
  echo.
) else (
  echo  PC Local: http://localhost:3000
  echo.
)
echo =======================================================
echo Iniciando aplicacion Electron...
echo.

call npm run electron:dev

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Ocurrio un problema al ejecutar Electron.
  pause
)
