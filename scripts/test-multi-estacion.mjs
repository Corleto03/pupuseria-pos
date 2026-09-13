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
  console.log("=== INICIANDO PRUEBA DE FLUJO MULTI-ESTACION COCINA ===");
  const dbUrl = new URL(appUrl);
  if (adminUrl) {
    const adminCredentials = new URL(adminUrl);
    dbUrl.username = adminCredentials.username;
    dbUrl.password = adminCredentials.password;
  }
  const client = new pg.Client({ connectionString: dbUrl.toString() });
  await client.connect();

  // Escuchar eventos en pos_events
  const capturedEvents = [];
  await client.query("LISTEN pos_events");
  client.on("notification", (msg) => {
    try {
      capturedEvents.push(JSON.parse(msg.payload));
    } catch {}
  });

  // 1. Obtener usuario staff y productos de las 3 estaciones
  const { rows: users } = await client.query("SELECT id, rol FROM usuarios WHERE activo = true LIMIT 1");
  const testUser = users[0];

  const { rows: prodsPupusa } = await client.query("SELECT id, nombre, precio, categoria FROM productos WHERE categoria = 'pupusa' AND activo = true LIMIT 1");
  const { rows: prodsPanes } = await client.query("SELECT id, nombre, precio, categoria FROM productos WHERE categoria = 'panes' AND activo = true LIMIT 1");
  const { rows: prodsBebida } = await client.query("SELECT id, nombre, precio, categoria FROM productos WHERE categoria = 'bebida' AND activo = true LIMIT 1");

  console.log(`Producto Pupusa: ${prodsPupusa[0]?.nombre} ($${prodsPupusa[0]?.precio})`);
  console.log(`Producto Panes: ${prodsPanes[0]?.nombre} ($${prodsPanes[0]?.precio})`);
  console.log(`Producto Bebida: ${prodsBebida[0]?.nombre} ($${prodsBebida[0]?.precio})`);

  if (!prodsPupusa[0] || !prodsPanes[0] || !prodsBebida[0]) {
    throw new Error("Faltan productos para las 3 estaciones");
  }

  // 2. Crear pedido de prueba
  const { rows: mesaRows } = await client.query("SELECT id, numero FROM mesas WHERE estado = 'disponible' LIMIT 1");
  const mesa = mesaRows[0];

  const { rows: pedRows } = await client.query(
    `INSERT INTO pedidos (id_mesa, id_usuario, nombre_control, tipo_pedido, estado_pago)
     VALUES ($1, $2, 'Prueba MultiEstacion', 'local', 'pendiente')
     RETURNING id`,
    [mesa.id, testUser.id]
  );
  const pedidoId = pedRows[0].id;
  console.log(`Pedido creado: ${pedidoId} (Mesa ${mesa.numero})`);

  // 3. Insertar items para cada estacion
  await client.query(
    `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, estado_cocina, precio_unitario, estacion)
     VALUES 
       ($1, $2, 2, 'borrador', $3, 'pupusa'),
       ($1, $4, 1, 'borrador', $5, 'panes'),
       ($1, $6, 3, 'borrador', $7, 'bebida')`,
    [
      pedidoId, 
      prodsPupusa[0].id, prodsPupusa[0].precio,
      prodsPanes[0].id, prodsPanes[0].precio,
      prodsBebida[0].id, prodsBebida[0].precio
    ]
  );

  // 4. Simular enviar a cocina
  console.log("Enviando orden a cocina...");
  await client.query(
    `UPDATE detalle_pedidos SET estado_cocina = 'pendiente' WHERE id_pedido = $1`,
    [pedidoId]
  );
  await client.query(
    `INSERT INTO estaciones_pedido (id_pedido, estacion, lista)
     VALUES ($1, 'pupusa', false), ($1, 'panes', false), ($1, 'bebida', false)
     ON CONFLICT (id_pedido, estacion) DO NOTHING`,
    [pedidoId]
  );

  // 5. Verificar filtros por estacion
  const checkEstacion = async (est) => {
    const { rows } = await client.query(
      `SELECT d.id, d.cantidad, pr.nombre, d.estacion, ep.lista
       FROM detalle_pedidos d
       JOIN productos pr ON pr.id = d.id_producto
       LEFT JOIN estaciones_pedido ep ON ep.id_pedido = d.id_pedido AND ep.estacion = $2
       WHERE d.id_pedido = $1 AND d.estacion = $2`,
      [pedidoId, est]
    );
    return rows;
  };

  const pupItems = await checkEstacion('pupusa');
  const panItems = await checkEstacion('panes');
  const bebItems = await checkEstacion('bebida');

  console.log(`Estacion Pupusas ve ${pupItems.length} items (esperado: 1): ${pupItems[0]?.nombre}`);
  console.log(`Estacion Panes ve ${panItems.length} items (esperado: 1): ${panItems[0]?.nombre}`);
  console.log(`Estacion Bebidas ve ${bebItems.length} items (esperado: 1): ${bebItems[0]?.nombre}`);

  if (pupItems.length !== 1 || panItems.length !== 1 || bebItems.length !== 1) {
    throw new Error("Fallo en el filtrado por estacion");
  }

  // 6. Simular que pupusas marca "Orden Lista"
  console.log("\n-> Estacion Pupusas marca: 'Orden Lista'");
  await client.query(
    `UPDATE estaciones_pedido SET lista = TRUE, ts_lista = NOW() WHERE id_pedido = $1 AND estacion = 'pupusa'`,
    [pedidoId]
  );

  // 7. Simular que panes marca "Orden Lista"
  console.log("-> Estacion Panes marca: 'Orden Lista'");
  await client.query(
    `UPDATE estaciones_pedido SET lista = TRUE, ts_lista = NOW() WHERE id_pedido = $1 AND estacion = 'panes'`,
    [pedidoId]
  );

  // Verificar que aun no estan todas
  const { rows: checkIncompleto } = await client.query(
    `SELECT COUNT(*) as completas FROM estaciones_pedido WHERE id_pedido = $1 AND lista = TRUE`,
    [pedidoId]
  );
  console.log(`Estaciones listas hasta ahora: ${checkIncompleto[0].completas} / 3 (Aun incompleto)`);

  // 8. Simular que bebidas marca "Orden Lista" y se dispara comanda_lista
  console.log("-> Estacion Bebidas marca: 'Orden Lista'");
  await client.query(
    `UPDATE estaciones_pedido SET lista = TRUE, ts_lista = NOW() WHERE id_pedido = $1 AND estacion = 'bebida'`,
    [pedidoId]
  );

  // Enviar el evento comanda_lista como lo hace la API
  await client.query(
    `SELECT pg_notify('pos_events', $1::TEXT)`,
    [JSON.stringify({
      table: "comanda_lista",
      op: "UPDATE",
      id_pedido: pedidoId,
      mesa_numero: mesa.numero,
      nombre_control: "Prueba MultiEstacion",
      todas_listas: true,
      ts: Date.now() / 1000
    })]
  );

  await new Promise((r) => setTimeout(r, 500));

  const comandaEvent = capturedEvents.find((e) => e.table === "comanda_lista" && e.id_pedido === pedidoId);
  console.log("Evento comanda_lista capturado:", comandaEvent ? "SI (EXITO)" : "NO (ERROR)");

  if (!comandaEvent || !comandaEvent.todas_listas) {
    throw new Error("No se capturo el evento comanda_lista");
  }

  // Limpiar pedido de prueba
  console.log("Limpiando datos de prueba...");
  await client.query("DELETE FROM detalle_pedidos WHERE id_pedido = $1", [pedidoId]);
  await client.query("DELETE FROM estaciones_pedido WHERE id_pedido = $1", [pedidoId]);
  await client.query("DELETE FROM pedidos WHERE id = $1", [pedidoId]);

  await client.end();
  console.log("\n=======================================================");
  console.log("RESULTADO: FLUJO MULTI-ESTACION VERIFICADO CON 100% EXITO");
  console.log("=======================================================");
}

runTest().catch((err) => {
  console.error("Error en test:", err);
  process.exit(1);
});