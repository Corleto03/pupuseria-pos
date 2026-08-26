import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;

if (!adminUrl || !appUrl) {
  console.error("Faltan DATABASE_ADMIN_URL o DATABASE_URL en .env.local");
  process.exit(1);
}

const sql = fs.readFileSync(path.join(root, "sql", "01_schema.sql"), "utf8");

function databaseName(url) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name) throw new Error("DATABASE_URL no indica una base de datos");
  return decodeURIComponent(name);
}

function quoteIdentifier(value) {
  return `\"${value.replaceAll('"', '\"\"')}\"`;
}

async function main() {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const targetDatabase = databaseName(appUrl);
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [targetDatabase]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)}`);
    console.log(`Base de datos ${targetDatabase} creada.`);
  } else {
    console.log(`Base de datos ${targetDatabase} ya existe.`);
  }
  await admin.end();

  // Usa las credenciales administrativas para aplicar el esquema, pero en la
  // misma base que consumirá la aplicación (DATABASE_URL).
  const dbUrl = new URL(appUrl);
  const adminCredentials = new URL(adminUrl);
  dbUrl.username = adminCredentials.username;
  dbUrl.password = adminCredentials.password;
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  await db.query(sql);
  await db.end();
  console.log("Esquema, RLS, realtime y seed aplicados.");
  console.log("Usuarios: gerente@ / mesero@ / cocina@ / caja@  (dominio pupuseria.local)");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
