@echo off
chcp 65001 >nul
title POS  - Configuración Inicial
color 0B

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║      POS  — SETUP INICIAL           ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Este asistente configura el sistema por primera vez.
echo.

:: ─── Verificar Node.js ──────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  color 0C
  echo  [ERROR] Node.js no encontrado. Instala Node.js 20+ desde https://nodejs.org
  pause & exit /b 1
)
for /f "tokens=1 delims=v" %%i in ('node -v') do set NODEVER=%%i
echo  [OK] Node.js detectado: %NODEVER%

:: ─── Verificar npm ──────────────────────────────────────────────────────────
where npm >nul 2>&1
if errorlevel 1 (
  color 0C
  echo  [ERROR] npm no encontrado.
  pause & exit /b 1
)
echo  [OK] npm detectado.

:: ─── Crear .env.local si no existe ──────────────────────────────────────────
if not exist ".env.local" (
  echo.
  echo  Creando archivo .env.local con valores por defecto...

  set /p DB_PASS="  Contraseña de PostgreSQL (usuario postgres, default: 123): "
  if "%DB_PASS%"=="" set DB_PASS=123

  set /p DB_PORT="  Puerto de PostgreSQL (default: 5432): "
  if "%DB_PORT%"=="" set DB_PORT=5432

  set /p DB_NAME="  Nombre de la base de datos (default: pupuseria): "
  if "%DB_NAME%"=="" set DB_NAME=pupuseria

  (
    echo DATABASE_URL=postgresql://pupuseria_app:pupuseria_app@localhost:%DB_PORT%/%DB_NAME%
    echo DATABASE_ADMIN_URL=postgresql://postgres:%DB_PASS%@localhost:%DB_PORT%/%DB_NAME%
    echo JWT_SECRET=7c8f3e8d4b6a1f0e9d2c7b5a4f6e8c1d3b9a2e7f5c4d8a1b6e0f3c9d7a5b2e4
    echo NEXT_TELEMETRY_DISABLED=1
    echo.
    echo BOOTSTRAP_SUPERADMIN_EMAIL=soporte@pos.local
    echo BOOTSTRAP_SUPERADMIN_NOMBRE=Soporte
    echo BOOTSTRAP_SUPERADMIN_PASSWORD=soporte123
    echo.
    echo BOOTSTRAP_ADMIN_EMAIL=admin@restaurante.local
    echo BOOTSTRAP_ADMIN_NOMBRE=Admin
    echo BOOTSTRAP_ADMIN_PASSWORD=admin123
  ) > .env.local

  echo  [OK] .env.local creado.
) else (
  echo  [OK] .env.local ya existe, se usará el existente.
)

:: ─── Instalar dependencias ───────────────────────────────────────────────────
echo.
echo  Instalando dependencias npm (puede tardar unos minutos)...
call npm install --prefer-offline
if errorlevel 1 (
  color 0C
  echo  [ERROR] Falló npm install.
  pause & exit /b 1
)
echo  [OK] Dependencias instaladas.

:: ─── Configurar base de datos ────────────────────────────────────────────────
echo.
echo  Configurando base de datos PostgreSQL...
node scripts/setup-db.mjs
if errorlevel 1 (
  color 0C
  echo.
  echo  [ERROR] No se pudo configurar la base de datos.
  echo  Verifica que PostgreSQL esté corriendo y que las credenciales sean correctas.
  echo  Luego vuelve a ejecutar este script.
  pause & exit /b 1
)
echo  [OK] Base de datos configurada.

:: ─── Build de producción ─────────────────────────────────────────────────────
echo.
echo  Compilando el sistema (build de producción)...
call npm run build
if errorlevel 1 (
  color 0C
  echo  [ERROR] El build falló.
  pause & exit /b 1
)
echo  [OK] Build completado.

:: ─── Fin ─────────────────────────────────────────────────────────────────────
echo.
color 0A
echo  ╔══════════════════════════════════════════════╗
echo  ║   SETUP COMPLETADO. ¡Listo para usar!        ║
echo  ║   Ejecuta start-local.bat para iniciar.      ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  CREDENCIALES INICIALES:
echo    Admin:    admin@restaurante.local  /  admin123
echo    Soporte:  soporte@pos.local       /  soporte123
echo.
echo  Cambia las contraseñas desde la sección Usuarios del sistema.
echo.
pause
