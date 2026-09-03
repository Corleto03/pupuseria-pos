import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  // Intenta .env.local (desarrollo) y luego .env (producción en Docker)
  for (const fileName of [".env.local", ".env"]) {
    const envPath = path.join(root, fileName);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    break; // Solo lee el primero que encuentre
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

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function ensureAppRole(admin, appUrl) {
  const url = new URL(appUrl);
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!role || !password) throw new Error("DATABASE_URL debe incluir el usuario y contraseña de la aplicación");
  const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  if (exists.rowCount) {
    await admin.query(`ALTER ROLE ${quoteIdentifier(role)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`);
  } else {
    await admin.query(`CREATE ROLE ${quoteIdentifier(role)} LOGIN PASSWORD ${quoteLiteral(password)}`);
  }
}

async function bootstrapUser(db, prefix, role) {
  const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`${prefix}_PASSWORD`];
  const name = process.env[`${prefix}_NOMBRE`]?.trim() || prefix.replace("BOOTSTRAP_", "");
  if (!email || !password) return false;
  if (password.length < 12) throw new Error(`${prefix}_PASSWORD debe tener al menos 12 caracteres`);
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO public.usuarios (email, password_hash, nombre, rol)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [email, hash, name, role]
  );
  return true;
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
  await ensureAppRole(admin, appUrl);
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
  const hasSupport = await bootstrapUser(db, "BOOTSTRAP_SUPERADMIN", "superadmin");
  const hasAdmin = await bootstrapUser(db, "BOOTSTRAP_ADMIN", "admin");
  if (hasSupport && hasAdmin) {
    await db.query(
      `UPDATE public.usuarios SET activo = FALSE
       WHERE email IN ('gerente@pupuseria.local', 'mesero@pupuseria.local', 'cocina@pupuseria.local', 'caja@pupuseria.local')`
    );
  }
  await db.end();
  console.log("Esquema, RLS, realtime y seed aplicados.");
  if (!hasSupport || !hasAdmin) console.log("Configura BOOTSTRAP_SUPERADMIN_* y BOOTSTRAP_ADMIN_* para crear las cuentas iniciales.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
