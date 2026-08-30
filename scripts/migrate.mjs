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

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;

if (!appUrl) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

async function main() {
  console.log("Conectando con credenciales administrativas para aplicar migración...");
  const dbUrl = new URL(appUrl);
  if (adminUrl) {
    const adminCredentials = new URL(adminUrl);
    dbUrl.username = adminCredentials.username;
    dbUrl.password = adminCredentials.password;
  }
  
  const client = new pg.Client({ connectionString: dbUrl.toString() });
  await client.connect();

  console.log("Ejecutando ALTER TABLE en pedidos...");
  await client.query(`
    ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS notas TEXT;
  `);

  console.log("Ejecutando ALTER TABLE en usuarios...");
  await client.query(`
    ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  console.log("Ejecutando ALTER TABLE y CONSTRAINT en pedidos...");
  await client.query(`
    ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_metodo_pago_check CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'mixto') OR metodo_pago IS NULL);
    ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pago_efectivo NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pago_tarjeta NUMERIC(10,2) DEFAULT 0;
  `);

  console.log("Creando tabla ajustes...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.ajustes (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);

  console.log("Insertando valores iniciales para ajustes...");
  await client.query(`
    INSERT INTO public.ajustes (clave, valor) VALUES
      ('nombre_restaurante', 'La Pupusa'),
      ('logo_url', '')
    ON CONFLICT (clave) DO NOTHING;
  `);

  console.log("Configurando RLS y políticas en ajustes...");
  await client.query(`
    ALTER TABLE public.ajustes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.ajustes FORCE ROW LEVEL SECURITY;
  `);

  await client.query(`
    DROP POLICY IF EXISTS ajustes_select ON public.ajustes;
    CREATE POLICY ajustes_select ON public.ajustes FOR SELECT
      USING (true);
  `);

  await client.query(`
    DROP POLICY IF EXISTS ajustes_write ON public.ajustes;
    CREATE POLICY ajustes_write ON public.ajustes FOR ALL
      USING (public.current_app_role() IN ('superadmin', 'admin', 'gerente'))
      WITH CHECK (public.current_app_role() IN ('superadmin', 'admin', 'gerente'));
  `);

  console.log("Otorgando permisos a pupuseria_app...");
  await client.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.ajustes TO pupuseria_app;
  `);

  await client.end();
  console.log("Migración completada con éxito.");
}

main().catch((err) => {
  console.error("Error en migración:", err.message);
  process.exit(1);
});
