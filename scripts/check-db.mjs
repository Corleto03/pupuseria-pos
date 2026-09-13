/**
 * scripts/check-db.mjs
 * Verifica la conexión a PostgreSQL y muestra el estado de las tablas principales.
 * Uso: npm run db:check
 */
import { Client } from "pg";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Cargar .env.local manualmente
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const [key, ...vals] = line.split("=");
    if (key?.trim() && !key.trim().startsWith("#")) {
      process.env[key.trim()] = vals.join("=").trim();
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no encontrada en .env.local");
  process.exit(1);
}

console.log("\n=== DIAGNÓSTICO DE BASE DE DATOS ===\n");
console.log(`URL: ${DATABASE_URL.replace(/:([^:@]+)@/, ":****@")}`);

const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  console.log("✅ Conexión exitosa a PostgreSQL\n");

  const tablas = ["usuarios", "pedidos", "detalle_pedidos", "productos", "mesas", "ajustes"];
  console.log("Tablas principales:");
  for (const tabla of tablas) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${tabla}`);
      console.log(`  ✅ ${tabla.padEnd(20)} → ${rows[0].n} registros`);
    } catch {
      console.log(`  ❌ ${tabla.padEnd(20)} → NO EXISTE o error`);
    }
  }

  const { rows: version } = await client.query("SELECT version()");
  console.log(`\nPostgreSQL: ${version[0].version.split(" ").slice(0, 2).join(" ")}`);
} catch (err) {
  console.error(`\n❌ No se pudo conectar: ${err.message}`);
  console.error("   Verifica que PostgreSQL esté corriendo y que .env.local tenga las credenciales correctas.");
  process.exit(1);
} finally {
  await client.end();
}

console.log("\n✅ Base de datos operativa.\n");
