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

async function main() {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'pupuseria'");
  if (exists.rowCount === 0) {
    await admin.query("CREATE DATABASE pupuseria");
    console.log("Base de datos pupuseria creada.");
  } else {
    console.log("Base de datos pupuseria ya existe.");
  }
  await admin.end();

  const dbUrl = new URL(adminUrl);
  dbUrl.pathname = "/pupuseria";
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
