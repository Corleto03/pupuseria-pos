import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const envPath = path.join(root, fileName);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    break;
  }
}

loadEnv();

const dbConnectionString = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;

async function testNotifications() {
  console.log("=== INICIANDO PRUEBA INTEGRAL DE NOTIFICACIONES EN TIEMPO REAL ===");

  const listener = new pg.Client({ connectionString: dbConnectionString });
  const sender = new pg.Client({ connectionString: dbConnectionString });

  await listener.connect();
  await sender.connect();

  const eventsReceived = [];

  await listener.query("LISTEN pos_events");
  listener.on("notification", (msg) => {
    try {
      const data = JSON.parse(msg.payload);
      eventsReceived.push(data);
      console.log(" [EVENTO NOTIFY RECIBIDO]:", data);
    } catch (e) {
      console.log(" [RAW NOTIFY]:", msg.payload);
    }
  });

  // Asegurar que exista un usuario activo
  let uRes = await sender.query("SELECT id FROM public.usuarios WHERE activo = true LIMIT 1");
  if (uRes.rows.length === 0) {
    const insertU = await sender.query(
      `INSERT INTO public.usuarios (email, password_hash, nombre, rol, activo)
       VALUES ('test_admin@oceansis.local', 'hash_test_12345', 'Admin Test', 'admin', true)
       RETURNING id`
    );
    uRes = insertU;
  }
  const userId = uRes.rows[0].id;

  // Asegurar que exista una mesa
  let mRes = await sender.query("SELECT id, numero FROM public.mesas ORDER BY numero ASC LIMIT 1");
  if (mRes.rows.length === 0) {
    const insertM = await sender.query("INSERT INTO public.mesas (numero, estado) VALUES (1, 'disponible') RETURNING id, numero");
    mRes = insertM;
  }
  const mesa = mRes.rows[0];

  // Asegurar que exista un producto
  let pRes = await sender.query("SELECT id FROM public.productos LIMIT 1");
  if (pRes.rows.length === 0) {
    const insertP = await sender.query("INSERT INTO public.productos (nombre, categoria, precio) VALUES ('Pupusa Revueltas Test', 'pupusa', 1.25) RETURNING id");
    pRes = insertP;
  }
  const prod = pRes.rows[0];

  console.log(`\n1. Creando / Abriendo comanda en Mesa ${mesa.numero}...`);
  await sender.query("UPDATE public.pedidos SET estado_pago = 'cancelada' WHERE id_mesa = $1 AND estado_pago = 'pendiente'", [mesa.id]);

  const insertPed = await sender.query(
    `INSERT INTO public.pedidos (id_mesa, id_usuario, nombre_control, tipo_pedido, estado_pago)
     VALUES ($1, $2, $3, 'local', 'pendiente')
     RETURNING id`,
    [mesa.id, userId, `Mesa ${mesa.numero}`]
  );
  const pedidoId = insertPed.rows[0].id;

  await new Promise((r) => setTimeout(r, 600));

  console.log("\n2. Mesero envía platillos a COCINA (estado_cocina = 'pendiente')...");
  const insertDet = await sender.query(
    `INSERT INTO public.detalle_pedidos (id_pedido, id_producto, cantidad, estado_cocina, destino_servicio, precio_unitario)
     VALUES ($1, $2, 2, 'pendiente', 'local', 1.25)
     RETURNING id`,
    [pedidoId, prod.id]
  );
  const detalleId = insertDet.rows[0].id;

  await new Promise((r) => setTimeout(r, 600));

  console.log("\n3. Cocina marca platillo 'EN PREPARACION' (estado_cocina = 'preparacion')...");
  await sender.query(
    `UPDATE public.detalle_pedidos SET estado_cocina = 'preparacion' WHERE id = $1`,
    [detalleId]
  );

  await new Promise((r) => setTimeout(r, 600));

  console.log("\n4. Cocina marca platillo 'ENTREGADO' (estado_cocina = 'entregado')...");
  await sender.query(
    `UPDATE public.detalle_pedidos SET estado_cocina = 'entregado' WHERE id = $1`,
    [detalleId]
  );

  await new Promise((r) => setTimeout(r, 600));

  console.log("\n5. Caja realiza el COBRO (estado_pago = 'pagada')...");
  await sender.query(
    `UPDATE public.pedidos SET estado_pago = 'pagada', pago_efectivo = 2.50, total = 2.50 WHERE id = $1`,
    [pedidoId]
  );

  await new Promise((r) => setTimeout(r, 1000));

  console.log("\n=======================================================");
  console.log(`TOTAL DE EVENTOS EN TIEMPO REAL CAPTURADOS: ${eventsReceived.length}`);
  console.log("=======================================================");

  const evtPendiente = eventsReceived.find((e) => e.table === "detalle_pedidos" && e.estado_cocina === "pendiente");
  const evtPreparacion = eventsReceived.find((e) => e.table === "detalle_pedidos" && e.estado_cocina === "preparacion");
  const evtEntregado = eventsReceived.find((e) => e.table === "detalle_pedidos" && e.estado_cocina === "entregado");
  const evtPagada = eventsReceived.find((e) => e.table === "pedidos" && e.estado_pago === "pagada");

  console.log(" -> Notificación Cocina (Pendiente):", evtPendiente ? `OK [Mesa ${evtPendiente.mesa_numero}]` : "FALLÓ");
  console.log(" -> Notificación Mesero (Preparación):", evtPreparacion ? `OK [Mesa ${evtPreparacion.mesa_numero}]` : "FALLÓ");
  console.log(" -> Notificación Mesero/Caja (Entregado):", evtEntregado ? `OK [Mesa ${evtEntregado.mesa_numero}]` : "FALLÓ");
  console.log(" -> Notificación Mesero/Admin (Pagada):", evtPagada ? `OK [Mesa ${evtPagada.mesa_numero}]` : "FALLÓ");

  await listener.end();
  await sender.end();

  if (evtPendiente && evtPreparacion && evtEntregado && evtPagada) {
    console.log("\nRESULTADO: TODAS LAS NOTIFICACIONES POR ROL FUNCIONAN CORRECTAMENTE (100% EXITO)");
    process.exit(0);
  } else {
    console.error("\nRESULTADO: ALGUNAS NOTIFICACIONES NO SE CAPTURARON");
    process.exit(1);
  }
}

testNotifications().catch((e) => {
  console.error("Error en prueba de notificaciones:", e);
  process.exit(1);
});
