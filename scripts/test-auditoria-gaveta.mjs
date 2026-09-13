import pg from "pg";
import { readFileSync, existsSync } from "fs";
import path from "path";

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

const { withUser, pool } = await import("../src/lib/db.js");

const { rows: users } = await pool.query("SELECT * FROM public.login_lookup('pupuseriagloria@gmail.com')");
const admin = users[0];
console.log("Probando con usuario:", admin.email, "rol:", admin.rol);

try {
  await withUser(admin, async (c) => {
    await c.query(
      `INSERT INTO public.auditoria (id_usuario, accion, entidad, detalle)
       VALUES ($1, 'abrir_gaveta', 'caja', $2::jsonb)`,
      [admin.id, JSON.stringify({ motivo: "test_verification", ts: new Date().toISOString() })]
    );
  });
  console.log("✅ AUDITORIA: Apertura de gaveta registrada correctamente con RLS activo!");
} catch (err) {
  console.error("❌ FALLO:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
