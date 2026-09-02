import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
});

import { pool } from "./src/lib/db.js";

async function fixDb() {
  const c = await pool.connect();
  try {
    const res = await c.query("UPDATE public.detalle_pedidos SET estado_cocina = 'cancelado' WHERE estado_cocina NOT IN ('borrador', 'pendiente', 'preparacion', 'entregado', 'cancelado')");
    console.log("Updated rows:", res.rowCount);
  } catch (err) {
    console.error("DB Error:", err.message);
  } finally {
    c.release();
    pool.end();
  }
}
fixDb();
