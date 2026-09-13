/**
 * scripts/build-local.mjs
 *
 * Genera un paquete portátil de la aplicación listo para copiar a otra PC.
 * Resultado: carpeta dist/pupuseria-pos-local/ con todo lo necesario.
 *
 * Uso: node scripts/build-local.mjs
 */

import { execSync } from "child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist", "pupuseria-pos-local");

console.log("\n=== BUILD LOCAL — Generando paquete portable ===\n");

// ─── 1. Build de Next.js ──────────────────────────────────────────────────────
console.log("1/5  Compilando Next.js (output:standalone)...");
try {
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  console.log("     ✅ Build completado.\n");
} catch {
  console.error("     ❌ Build falló. Revisa los errores de arriba.");
  process.exit(1);
}

// ─── 2. Limpiar y crear directorio dist ───────────────────────────────────────
console.log("2/5  Preparando carpeta dist...");
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
console.log(`     Destino: ${DIST}\n`);

// ─── 3. Copiar archivos del standalone ────────────────────────────────────────
console.log("3/5  Copiando archivos standalone...");

// Núcleo del servidor Next.js standalone
cpSync(join(ROOT, ".next", "standalone"), DIST, { recursive: true });

// Archivos estáticos (CSS, JS del cliente)
cpSync(
  join(ROOT, ".next", "static"),
  join(DIST, ".next", "static"),
  { recursive: true }
);

// Archivos públicos (logos, íconos, sonidos)
cpSync(
  join(ROOT, "public"),
  join(DIST, "public"),
  { recursive: true }
);

// Scripts de DB
cpSync(
  join(ROOT, "scripts"),
  join(DIST, "scripts"),
  { recursive: true }
);

// SQL de migración
cpSync(
  join(ROOT, "sql"),
  join(DIST, "sql"),
  { recursive: true }
);

console.log("     ✅ Archivos copiados.\n");

// ─── 4. Crear .env.local de ejemplo ──────────────────────────────────────────
console.log("4/5  Creando archivos de configuración...");

const envEjemplo = `# Configuración de base de datos local
# Ajusta las credenciales según tu instalación de PostgreSQL
DATABASE_URL=postgresql://pupuseria_app:pupuseria_app@localhost:5432/pupuseria
DATABASE_ADMIN_URL=postgresql://postgres:123@localhost:5432/pupuseria
JWT_SECRET=7c8f3e8d4b6a1f0e9d2c7b5a4f6e8c1d3b9a2e7f5c4d8a1b6e0f3c9d7a5b2e4
NEXT_TELEMETRY_DISABLED=1

BOOTSTRAP_SUPERADMIN_EMAIL=soporte@pos.local
BOOTSTRAP_SUPERADMIN_NOMBRE=Soporte
BOOTSTRAP_SUPERADMIN_PASSWORD=soporte123

BOOTSTRAP_ADMIN_EMAIL=admin@restaurante.local
BOOTSTRAP_ADMIN_NOMBRE=Admin
BOOTSTRAP_ADMIN_PASSWORD=admin123
`;
writeFileSync(join(DIST, ".env.local"), envEjemplo);

// Copiar scripts de inicio
copyFileSync(join(ROOT, "start-local.bat"), join(DIST, "start-local.bat"));
copyFileSync(join(ROOT, "setup-local.bat"), join(DIST, "setup-local.bat"));

console.log("     ✅ Archivos de configuración creados.\n");

// ─── 5. Crear README de instalación ─────────────────────────────────────────
console.log("5/5  Generando README-INSTALACION.txt...");

const readme = `╔══════════════════════════════════════════════════════════════╗
║              POS PUPUSERÍA — GUÍA DE INSTALACIÓN             ║
╚══════════════════════════════════════════════════════════════╝

REQUISITOS PREVIOS
──────────────────
• Windows 10 o 11 (64 bits)
• Node.js 20 o superior → https://nodejs.org
• PostgreSQL 14 o superior → https://www.postgresql.org
• Los bridges de impresora corriendo (uno por impresora activa)

PRIMERA INSTALACIÓN
───────────────────
1. Copia esta carpeta completa a la PC del restaurante.
2. Abre una ventana de comandos en la carpeta.
3. Ejecuta: setup-local.bat
   (configura la base de datos, instala dependencias y hace el build)
4. Cuando termine, ejecuta: start-local.bat
5. El sistema abrirá en http://localhost:3000

INICIO DIARIO
─────────────
• Doble click en start-local.bat
• El navegador se abrirá automáticamente.
• Para las tablets/celulares de cocina: abrir http://<IP-DE-LA-PC>:3000

CREDENCIALES INICIALES
──────────────────────
• Admin:    admin@restaurante.local   /  admin123
• Soporte:  soporte@pos.local        /  soporte123
⚠ Cambia las contraseñas en Usuarios después del primer ingreso.

CONFIGURACIÓN DE IMPRESORAS
────────────────────────────
1. Inicia el bridge de cada impresora (agente local).
   Puertos por defecto:
   • Impresora Pupusas:  http://localhost:8085
   • Impresora Panes:    http://localhost:8086
   • Impresora Caja:     http://localhost:8087
2. Entra al POS → Personalización → Hardware POS.
3. Habilita cada impresora, verifica la URL y pulsa "Imprimir Prueba".
4. Guarda la configuración.

ACCESO DESDE TABLET / CELULAR
───────────────────────────────
Las tablets deben estar en la misma red WiFi que la PC de caja.
En las tablets, abrir el navegador y escribir:
   http://<IP-LOCAL-DE-LA-PC>:3000
(La IP local se puede ver con: ipconfig en cmd, buscar IPv4)

SOLUCIÓN DE PROBLEMAS
──────────────────────
• "Error de conexión a la base de datos":
  Verifica que PostgreSQL esté corriendo (Servicios de Windows).
• "No se puede imprimir":
  Verifica que el bridge de la impresora esté activo.
  El sistema hace fallback al diálogo del navegador automáticamente.
• "Página en blanco":
  Espera 5 segundos y recarga. Si persiste, reinicia start-local.bat.
`;

writeFileSync(join(DIST, "README-INSTALACION.txt"), readme, "utf8");
console.log("     ✅ README creado.\n");

// ─── Resumen ─────────────────────────────────────────────────────────────────
console.log("=== PAQUETE LISTO ===");
console.log(`Ubicación: ${DIST}`);
console.log("Archivos incluidos:");
console.log("  ✅ Servidor Next.js standalone");
console.log("  ✅ Archivos estáticos (.next/static)");
console.log("  ✅ Archivos públicos (public/)");
console.log("  ✅ Scripts de DB (scripts/, sql/)");
console.log("  ✅ setup-local.bat + start-local.bat");
console.log("  ✅ .env.local de ejemplo");
console.log("  ✅ README-INSTALACION.txt");
console.log("\nPara distribuir: comprime la carpeta dist/pupuseria-pos-local/ en un ZIP.\n");
