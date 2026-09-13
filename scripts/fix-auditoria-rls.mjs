import pg from "pg";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Cargar .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0 && !key.trim().startsWith("#")) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

const adminUrl = process.env.DATABASE_ADMIN_URL || "postgresql://postgres:123@localhost:5432/pupuseria";
const pool = new pg.Pool({ connectionString: adminUrl });

try {
  await pool.query(`
    DROP POLICY IF EXISTS auditoria_insert ON public.auditoria;
    CREATE POLICY auditoria_insert ON public.auditoria FOR INSERT
      WITH CHECK (public.current_app_role() IN ('superadmin', 'admin', 'gerente', 'cajero'));
  `);
  console.log("✅ Política auditoria_insert aplicada exitosamente en la base de datos.");
} catch (err) {
  console.error("❌ Error aplicando política:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
