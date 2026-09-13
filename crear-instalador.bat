@echo off
chcp 65001 >nul
title Compilando Instalador .exe - POS Pupusería
cls

echo =======================================================
echo        GENERANDO INSTALADOR DE WINDOWS (.EXE)
echo =======================================================
echo.

:: Asegurarse de situarse en la carpeta del script
cd /d "%~dp0"

echo Carpeta de trabajo: %CD%
echo.
echo Paso 1: Verificando que la app no esté abierta en segundo plano...
taskkill /f /im electron.exe >nul 2>&1

echo Paso 2: Iniciando compilación de Next.js y empaquetado Electron...
echo (Este proceso puede tardar de 1 a 3 minutos, por favor espera...)
echo.

call npm run electron:build:installer

if %ERRORLEVEL% EQU 0 (
  echo.
  echo =======================================================
  echo  ¡ÉXITO! Instalador generado correctamente.
  echo  Ubicación: %CD%\dist-electron\
  echo =======================================================
  echo.
  if exist "dist-electron" (
    explorer "dist-electron"
  )
) else (
  echo.
  echo =======================================================
  echo  [ERROR] Ocurrió un fallo durante la compilación.
  echo =======================================================
)

echo.
pause
