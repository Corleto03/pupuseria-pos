/**
 * electron/main.js — Proceso principal de Electron para POS Pupusería
 *
 * Flujo:
 *  1. Arranca el servidor Next.js como proceso hijo
 *  2. Espera a que esté listo (polling HTTP)
 *  3. Abre la ventana principal del POS
 *  4. Crea un ícono en la bandeja del sistema (system tray)
 *  5. Al cerrar la ventana → minimiza a bandeja (no termina el servidor)
 *  6. "Salir" desde bandeja → cierra servidor y app
 */

const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog } = require("electron");
const { spawn }  = require("child_process");
const { existsSync } = require("fs");
const path  = require("path");
const http  = require("http");
const os    = require("os");

// ─── Configuración ───────────────────────────────────────────────────────────
const PORT        = process.env.PORT || 3000;
const ROOT        = path.join(__dirname, "..");
const STANDALONE  = path.join(ROOT, ".next", "standalone", "server.js");
const IS_DEV      = !existsSync(STANDALONE);
const ICON_PATH   = path.join(ROOT, "public", "icon.png");
const FAVICON_ICO = path.join(ROOT, "public", "favicon.ico");

// ─── Cargar variables de entorno (.env.local / .env) ─────────────────────────
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  try {
    const fs = require("fs");
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {
    console.warn("[Electron] Advertencia al leer env:", e.message);
  }
}

const EXE_DIR = path.dirname(process.execPath);
loadEnvFile(path.join(EXE_DIR, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));


function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal && !iface.address.startsWith("169.254")) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

const LOCAL_IP = getLocalIp();

// Habilitar depuración remota en modo DEV → chrome://inspect/#devices
if (IS_DEV) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}

console.log(`\n=========================================`);
console.log(`  POS Pupusería — Electron`);
console.log(`  Modo: ${IS_DEV ? "DEV (npm run dev)" : "PROD (standalone)"}`);
console.log(`  Puerto Next.js: ${PORT}`);
console.log(`  PC Local: http://localhost:${PORT}`);
console.log(`  📱 Conectar Celular/Tablet: http://${LOCAL_IP}:${PORT}`);
console.log(`  Root: ${ROOT}`);
if (IS_DEV) console.log(`  DevTools: chrome://inspect/#devices`);
console.log(`=========================================\n`);



// ─── Control de instancia única ──────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // Ya hay otra ventana de Electron corriendo; cerramos esta copia silenciosamente
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  // Si intentan abrir de nuevo, traemos al frente la ventana que ya está abierta
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

let mainWindow = null;
let tray       = null;

let nextProc   = null;
let serverReady = false;

// ─── 1. Arrancar Next.js ──────────────────────────────────────────────────────
function startNextServer() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      NODE_ENV: IS_DEV ? "development" : "production",
      NEXT_TELEMETRY_DISABLED: "1",
    };

    if (IS_DEV) {
      console.log("[Electron] Iniciando: npm run dev ...");
      // shell:true es NECESARIO en Windows para que cmd.exe encuentre npm.cmd
      nextProc = spawn("npm", ["run", "dev"], {
        cwd: ROOT,
        env,
        shell: true,      // ← clave para Windows
        windowsHide: true,
      });
    } else {
      console.log("[Electron] Iniciando: node standalone/server.js ...");
      // Copiar public/ y static/ al standalone si no existen
      const pubDst  = path.join(ROOT, ".next", "standalone", "public");
      const statDst = path.join(ROOT, ".next", "standalone", ".next", "static");
      const envDst = path.join(ROOT, ".next", "standalone", ".env.local");
      const envCustom = existsSync(path.join(EXE_DIR, ".env.local"))
        ? path.join(EXE_DIR, ".env.local")
        : (existsSync(path.join(ROOT, ".env.local")) ? path.join(ROOT, ".env.local") : null);

      try {
        require("fs").cpSync(path.join(ROOT, "public"), pubDst, { recursive: true });
        if (!existsSync(statDst)) require("fs").cpSync(path.join(ROOT, ".next", "static"), statDst, { recursive: true });
        if (envCustom) require("fs").copyFileSync(envCustom, envDst);
      } catch (e) { console.warn("[Electron] Advertencia al copiar archivos:", e.message); }


      nextProc = spawn(process.execPath, [STANDALONE], {
        cwd: path.join(ROOT, ".next", "standalone"),
        env,
        windowsHide: true,
      });
    }

    // Redirigir output de Next.js a la consola de Electron
    nextProc.stdout?.on("data", (d) => {
      const line = d.toString().trim();
      console.log("[Next]", line);
      // Detectar cuando Next.js está listo
      if (line.includes("Local:") || line.includes("ready") || line.includes("localhost")) {
        console.log("[Electron] ✅ Next.js reporta que está listo");
      }
    });
    nextProc.stderr?.on("data", (d) => console.error("[Next:err]", d.toString().trim()));

    nextProc.on("error", (e) => {
      console.error("[Electron] ERROR al arrancar Next.js:", e.message);
      reject(e);
    });

    nextProc.on("exit", (code, signal) => {
      if (code !== null && code !== 0) {
        console.error(`[Electron] Next.js terminó inesperadamente (code=${code}, signal=${signal})`);
      }
    });

    // Poll HTTP cada 1 segundo hasta que el servidor responda
    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      if (tries % 5 === 0) console.log(`[Electron] Esperando Next.js... (intento ${tries})`);

      const req = http.get(`http://localhost:${PORT}/api/auth/me`, (res) => {
        clearInterval(poll);
        serverReady = true;
        console.log(`[Electron] ✅ Servidor listo en http://localhost:${PORT} (intento ${tries})`);
        resolve();
      });
      req.setTimeout(800, () => req.destroy());
      req.on("error", () => {
        if (tries >= 120) {
          clearInterval(poll);
          reject(new Error("El servidor Next.js no respondió en 2 minutos"));
        }
      });
      req.end();
    }, 1000);
  });
}


// ─── 2. Crear ventana principal ───────────────────────────────────────────────
function createWindow() {
  const icon = existsSync(ICON_PATH) ? nativeImage.createFromPath(ICON_PATH) : undefined;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    icon,
    title: "POS Pupusería",
    backgroundColor: "#1c1917",
    show: true, // Mostrar de inmediato para que el usuario vea actividad
    center: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Mostrar pantalla de carga integrada en la misma ventana
  mainWindow.loadURL(`data:text/html,<!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>POS Pupusería</title>
    <style>
      body { margin:0; background:#1c1917; color:#fafaf9; font-family:system-ui,-apple-system,sans-serif;
             display:flex; flex-direction:column; align-items:center; justify-content:center;
             height:100vh; overflow:hidden; user-select:none; }
      .card { text-align:center; padding:40px; }
      h1   { font-size:28px; margin:0 0 10px; font-weight:800; letter-spacing:-0.5px; }
      p    { font-size:14px; color:#a8a29e; margin:0 0 28px; }
      .bar { width:260px; height:6px; background:#292524; border-radius:6px; overflow:hidden; margin:0 auto; }
      .fill{ width:40%; height:100%; background:#10b981; border-radius:6px;
             animation: move 1.6s ease-in-out infinite; }
      @keyframes move { 0%{margin-left:-40%; width:40%} 50%{width:60%} 100%{margin-left:100%; width:40%} }
    </style></head><body>
    <div class="card">
      <h1>🫔 POS Pupusería</h1>
      <p id="txt">Iniciando servidor local...</p>
      <div class="bar"><div class="fill"></div></div>
    </div>
    </body></html>`);

  mainWindow.focus();

  // Atajos para abrir DevTools si el desarrollador lo desea
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i") {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === "F12") {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Al cerrar con la X → minimizar a bandeja en vez de terminar
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (os.platform() === "win32" && tray) {
        tray.displayBalloon({
          iconType: "info",
          title: "POS Pupusería",
          content: "El sistema sigue corriendo en la bandeja. Haz doble clic para volver a abrir.",
        });
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── 3. System Tray ───────────────────────────────────────────────────────────
function createTray() {
  const iconPath = existsSync(FAVICON_ICO) ? FAVICON_ICO : ICON_PATH;
  const trayIcon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip("POS Pupusería — Sistema en ejecución");

  const menu = Menu.buildFromTemplate([
    {
      label: "Abrir POS",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
          mainWindow.loadURL(`http://localhost:${PORT}`);
        }
      },
    },
    {
      label: `Abrir en navegador (puerto ${PORT})`,
      click: () => shell.openExternal(`http://localhost:${PORT}`),
    },
    {
      label: `📱 Conectar Celular (http://${LOCAL_IP}:${PORT})`,
      click: () => {
        const { clipboard } = require("electron");
        clipboard.writeText(`http://${LOCAL_IP}:${PORT}`);
        dialog.showMessageBox({
          type: "info",
          title: "Conectar Celular o Tablet",
          message: `Dirección para conectar desde tu celular:\n\nhttp://${LOCAL_IP}:${PORT}\n\n(¡Enlace copiado al portapapeles! Asegúrate de que el celular esté conectado a la misma red Wi-Fi).`,
        });
      },
    },
    { type: "separator" },
    {
      label: "Estado del servidor",
      click: () => {
        dialog.showMessageBox({
          type: "info",
          title: "Estado del servidor",
          message: serverReady
            ? `✅ Servidor corriendo correctamente en http://localhost:${PORT}`
            : "⏳ Servidor iniciando...",
        });
      },
    },
    { type: "separator" },
    {
      label: "Salir por completo",
      click: () => {
        app.isQuitting = true;
        killNextServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
      mainWindow.loadURL(`http://localhost:${PORT}`);
    }
  });
}

// ─── 4. Cerrar Next.js limpiamente ───────────────────────────────────────────
function killNextServer() {
  if (!nextProc) return;
  try {
    if (os.platform() === "win32") {
      spawn("taskkill", ["/pid", String(nextProc.pid), "/T", "/F"], { shell: true });
    } else {
      nextProc.kill("SIGTERM");
    }
  } catch { /* ya estaba muerto */ }
  nextProc = null;
}

// ─── 5. Ciclo de vida de la app ───────────────────────────────────────────────
app.on("ready", async () => {
  createTray();
  createWindow();

  try {
    await startNextServer();
    console.log("[Electron] Cargando POS en la ventana principal...");
    if (mainWindow) {
      mainWindow.loadURL(`http://localhost:${PORT}`);
      mainWindow.focus();
    }
  } catch (err) {
    dialog.showErrorBox(
      "Error al iniciar",
      `No se pudo arrancar el servidor:\n\n${err.message}\n\nVerifica que PostgreSQL esté corriendo.`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // En Windows/Mac, mantener activo en segundo plano en la bandeja
});

app.on("before-quit", () => {
  app.isQuitting = true;
  killNextServer();
});

app.on("activate", () => {
  if (!mainWindow) {
    createWindow();
    if (serverReady) mainWindow.loadURL(`http://localhost:${PORT}`);
  }
});

