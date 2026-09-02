import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
});

import { pool } from "./src/lib/db.js";

async function run() {
  const c = await pool.connect();
  try {
    const anulados = await c.query(
      `SELECT d.id, d.cantidad, d.motivo_cancelacion, d.fecha_cancelacion,
              pr.nombre AS producto_nombre, u.nombre AS cancelado_por_nombre,
              p.nombre_control
       FROM detalle_pedidos d
       JOIN productos pr ON pr.id = d.id_producto
       JOIN pedidos p ON p.id = d.id_pedido
       LEFT JOIN usuarios u ON u.id = d.cancelado_por
       WHERE d.estado_cocina = 'cancelado' 
       ORDER BY COALESCE(d.fecha_cancelacion, d.updated_at) DESC
       LIMIT 15`
    );
    console.log("Success!", anulados.rowCount);
  } catch (err) {
    console.error("DB Error:", err.message);
  } finally {
    c.release();
    pool.end();
  }
}
run();
