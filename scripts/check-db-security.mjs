import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_ADMIN_URL,
});

async function checkSecurity() {
  try {
    console.log("=== VERIFICANDO TABLAS Y ESTADO DE RLS ===");
    const tablesRes = await pool.query(`
      SELECT c.relname AS tabla,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);
    console.table(tablesRes.rows);

    console.log("\n=== VERIFICANDO POLÍTICAS RLS EN pg_policies ===");
    const policiesRes = await pool.query(`
      SELECT tablename, policyname, permissive, roles, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `);
    console.table(policiesRes.rows);

    console.log("\n=== VERIFICANDO COLUMNAS CLAVE RECIENTES ===");
    const colsRes = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'pedidos' AND column_name IN ('ronda_actual', 'notas', 'metodo_pago'))
          OR (table_name = 'detalle_pedidos' AND column_name IN ('estacion', 'ronda', 'impreso', 'estado_cocina'))
          OR (table_name = 'estaciones_pedido')
        )
      ORDER BY table_name, ordinal_position;
    `);
    console.table(colsRes.rows);

    console.log("\n=== VERIFICANDO PERMISOS SOBRE TABLAS (ROLE_TABLE_GRANTS) ===");
    const grantsRes = await pool.query(`
      SELECT grantee, table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('pupuseria_app', 'pupuseria_prod', 'PUBLIC')
      ORDER BY table_name, grantee, privilege_type;
    `);
    console.table(grantsRes.rows.slice(0, 30));

    console.log("\n=== REVISANDO TABLA INTENTOS_LOGIN ===");
    const loginGrants = grantsRes.rows.filter(r => r.table_name === 'intentos_login');
    console.table(loginGrants);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("Error durante la verificación:", err);
    process.exit(1);
  }
}

checkSecurity();
