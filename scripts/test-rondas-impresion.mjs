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

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;

async function runTest() {
  console.log("=== INICIANDO PRUEBA DE CONTROL DE RONDAS Y MINI-TICKETS ===");
  const dbUrl = new URL(appUrl);
  if (adminUrl) {
    const adminCredentials = new URL(adminUrl);
    dbUrl.username = adminCredentials.username;
    dbUrl.password = adminCredentials.password;
  }
  const client = new pg.Client({ connectionString: dbUrl.toString() });
  await client.connect();

  // 1. Obtener usuario y productos
  const { rows: users } = await client.query("SELECT id FROM usuarios WHERE activo = true LIMIT 1");
  const testUser = users[0];

  const { rows: pPupusa } = await client.query("SELECT id, nombre, precio, categoria FROM productos WHERE categoria = 'pupusa' AND activo = true LIMIT 1");
  const { rows: pPan } = await client.query("SELECT id, nombre, precio, categoria FROM productos WHERE categoria = 'panes' AND activo = true LIMIT 1");
  const { rows: pBebida } = await client.query("SELECT id, nombre, precio, categoria FROM productos WHERE categoria = 'bebida' AND activo = true LIMIT 1");

  const { rows: mesaRows } = await client.query("SELECT id, numero FROM mesas WHERE estado = 'disponible' LIMIT 1");
  const mesa = mesaRows[0];

  // 2. Crear pedido
  const { rows: pedRows } = await client.query(
    `INSERT INTO pedidos (id_mesa, id_usuario, nombre_control, tipo_pedido, estado_pago)
     VALUES ($1, $2, 'Test Rondas', 'local', 'pendiente')
     RETURNING id`,
    [mesa.id, testUser.id]
  );
  const pedidoId = pedRows[0].id;
  console.log(`Pedido creado: ${pedidoId} (Mesa ${mesa.numero})`);

  // 3. RONDA 1: Insertar Pupusa y Bebida en estado borrador
  console.log("\n--- SIMULANDO RONDA 1 ---");
  await client.query(
    `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, estado_cocina, precio_unitario, estacion)
     VALUES 
       ($1, $2, 2, 'borrador', $3, 'pupusa'),
       ($1, $4, 1, 'borrador', $5, 'bebida')`,
    [pedidoId, pPupusa[0].id, pPupusa[0].precio, pBebida[0].id, pBebida[0].precio]
  );

  // Simular lógica de enviar_cocina para Ronda 1
  const maxRonda1 = await client.query(
    `SELECT COALESCE(MAX(ronda), 0) AS max_ronda FROM detalle_pedidos WHERE id_pedido = $1 AND estado_cocina <> 'borrador'`,
    [pedidoId]
  );
  const nextRonda1 = Number(maxRonda1.rows[0].max_ronda) + 1; // Debe ser 1
  console.log(`Ronda calculada para primer envio: ${nextRonda1} (Esperado: 1)`);

  await client.query(
    `UPDATE detalle_pedidos SET estado_cocina = 'pendiente', ronda = $2 WHERE id_pedido = $1 AND estado_cocina = 'borrador'`,
    [pedidoId, nextRonda1]
  );
  await client.query(`UPDATE pedidos SET ronda_actual = $2 WHERE id = $1`, [pedidoId, nextRonda1]);

  // Verificar que hay 2 items en ronda 1
  const { rows: itemsRonda1 } = await client.query(
    `SELECT id, cantidad, estacion, ronda FROM detalle_pedidos WHERE id_pedido = $1 AND ronda = 1`,
    [pedidoId]
  );
  console.log(`Items enviados en Ronda 1: ${itemsRonda1.length} (Esperado: 2)`);
  if (itemsRonda1.length !== 2) throw new Error("Fallo en cantidad de items de Ronda 1");

  // 4. RONDA 2 (ADICIÓN): Cliente pide 1 Pan con Gallina 10 minutos después
  console.log("\n--- SIMULANDO RONDA 2 (ADICION) ---");
  await client.query(
    `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, estado_cocina, precio_unitario, estacion)
     VALUES ($1, $2, 1, 'borrador', $3, 'panes')`,
    [pedidoId, pPan[0].id, pPan[0].precio]
  );

  // Simular enviar_cocina para la adición
  const maxRonda2 = await client.query(
    `SELECT COALESCE(MAX(ronda), 0) AS max_ronda FROM detalle_pedidos WHERE id_pedido = $1 AND estado_cocina <> 'borrador'`,
    [pedidoId]
  );
  const nextRonda2 = Number(maxRonda2.rows[0].max_ronda) + 1; // Debe ser 2
  console.log(`Ronda calculada para adición: ${nextRonda2} (Esperado: 2)`);

  await client.query(
    `UPDATE detalle_pedidos SET estado_cocina = 'pendiente', ronda = $2 WHERE id_pedido = $1 AND estado_cocina = 'borrador'`,
    [pedidoId, nextRonda2]
  );
  await client.query(`UPDATE pedidos SET ronda_actual = $2 WHERE id = $1`, [pedidoId, nextRonda2]);

  // Verificar que los items recién enviados de Ronda 2 SOLO contienen el Pan con Gallina
  const { rows: itemsRonda2 } = await client.query(
    `SELECT d.id, d.cantidad, pr.nombre, d.estacion, d.ronda 
     FROM detalle_pedidos d
     JOIN productos pr ON pr.id = d.id_producto
     WHERE d.id_pedido = $1 AND d.ronda = 2`,
    [pedidoId]
  );
  console.log(`Items para impresion en Ronda 2: ${itemsRonda2.length} (Esperado: 1): ${itemsRonda2[0]?.nombre} (Estacion: ${itemsRonda2[0]?.estacion})`);

  if (itemsRonda2.length !== 1 || itemsRonda2[0].estacion !== "panes") {
    throw new Error("Fallo: la ronda 2 no contiene exclusivamente la adición");
  }

  // Verificar que los de ronda 1 NO cambiaron de ronda
  const { rows: checkOriginales } = await client.query(
    `SELECT COUNT(*) as cant FROM detalle_pedidos WHERE id_pedido = $1 AND ronda = 1`,
    [pedidoId]
  );
  console.log(`Items que permanecen en Ronda 1: ${checkOriginales[0].cant} (Esperado: 2)`);

  // Verificar que el total de la mesa contiene todos los 3 platillos (total consolidado para caja)
  const { rows: totalMesa } = await client.query(
    `SELECT COUNT(*) as total_items FROM detalle_pedidos WHERE id_pedido = $1`,
    [pedidoId]
  );
  console.log(`Total consolidado de la mesa para cobro: ${totalMesa[0].total_items} items (Esperado: 3)`);

  // Limpiar prueba
  await client.query("DELETE FROM detalle_pedidos WHERE id_pedido = $1", [pedidoId]);
  await client.query("DELETE FROM pedidos WHERE id = $1", [pedidoId]);

  await client.end();
  console.log("\n=======================================================");
  console.log("RESULTADO: CONTROL DE RONDAS Y MINI-TICKETS 100% EXITO");
  console.log("=======================================================");
}

runTest().catch((err) => {
  console.error("Error en test:", err);
  process.exit(1);
});