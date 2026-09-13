@echo off
chcp 65001 >nul
title POS  - Iniciando...
color 0A

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║         POS  — MODO LOCAL           ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: ─── Verificar que Node.js está instalado ───────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  color 0C
  echo  [ERROR] Node.js no está instalado o no está en el PATH.
  echo  Descárgalo de https://nodejs.org ^(versión 20 o superior^)
  echo.
  pause
  exit /b 1
)

:: ─── Verificar que el build existe ──────────────────────────────────────────
if not exist ".next\standalone\server.js" (
  color 0E
  echo  [AVISO] No se encontró el build de producción.
  echo  Ejecutando "npm run build" primero. Esto puede tardar 1-2 minutos...
  echo.
  call npm run build
  if errorlevel 1 (
    color 0C
    echo  [ERROR] El build falló. Revisa los errores de arriba.
    pause
    exit /b 1
  )
)

:: ─── Configurar variables de entorno ────────────────────────────────────────
if exist ".env.local" (
  echo  [OK] Usando configuración de .env.local
) else (
  color 0E
  echo  [AVISO] No se encontró .env.local. Ejecuta setup-local.bat primero.
  pause
  exit /b 1
)

set PORT=3000
set NODE_ENV=production
set NEXT_TELEMETRY_DISABLED=1

:: ─── Iniciar el servidor ────────────────────────────────────────────────────
echo.
echo  [OK] Iniciando servidor POS en http://localhost:%PORT%
echo  Presiona Ctrl+C para detener el sistema.
echo.

:: Copiar archivos públicos al standalone si no existen
if exist ".next\standalone" (
  if not exist ".next\standalone\public" (
    xcopy /E /I /Q public .next\standalone\public >nul 2>&1
  )
  if not exist ".next\standalone\.next\static" (
    xcopy /E /I /Q .next\static .next\standalone\.next\static >nul 2>&1
  )
)

:: Abrir el navegador después de 3 segundos
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%PORT%"

:: Iniciar servidor
node .next\standalone\server.js

pause
