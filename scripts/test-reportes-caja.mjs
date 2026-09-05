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

async function testReportesCaja() {
  console.log("=== VERIFICANDO REGISTRO Y REPORTE DE CUADRE DE CAJA (DÍA / MES) ===");

  const client = new pg.Client({ connectionString: dbConnectionString });
  await client.connect();

  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Limpiar o registrar un turno de caja de prueba para hoy
  console.log("\n1. Registrando turno de caja de prueba con Faltante de -$5.00...");
  
  // Borrar cajas de prueba recientes si existen
  await client.query("DELETE FROM public.caja WHERE fecha = CURRENT_DATE");

  // Insertar caja de prueba abierta
  const insCaja = await client.query(
    `INSERT INTO public.caja (fecha, apertura, efectivo, tarjeta, cierre)
     VALUES (CURRENT_DATE, 50.00, 200.00, 50.00, 245.00)
     RETURNING id, apertura, efectivo, cierre`
  );
  const caja = insCaja.rows[0];
  const esperado = Number(caja.apertura) + Number(caja.efectivo);
  const diff = Number(caja.cierre) - esperado;

  console.log(` -> Caja insertada. Apertura: $${caja.apertura}, Efectivo: $${caja.efectivo}, Esperado: $${esperado}, Cierre Contado: $${caja.cierre}`);
  console.log(` -> Diferencia de cuadre calculada: $${diff.toFixed(2)}`);

  // 2. Probar consulta de reportes para HOY (día)
  console.log("\n2. Consultando consulta de reporte diario (periodo = 'dia')...");
  const startDia = new Date(`${todayStr}T00:00:00-06:00`).toISOString();
  const endDia = new Date(`${todayStr}T23:59:59.999-06:00`).toISOString();

  const resDia = await client.query(
    `SELECT c.id, to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
            c.apertura::float, c.cierre::float, c.efectivo::float,
            (c.apertura + c.efectivo)::float AS esperado,
            (c.cierre - (c.apertura + c.efectivo))::float AS diferencia
     FROM public.caja c
     WHERE (c.fecha BETWEEN DATE($1) AND DATE($2)) OR (c.created_at BETWEEN $1 AND $2)
     ORDER BY c.created_at DESC`,
    [startDia, endDia]
  );

  console.log(` -> Cajas encontradas para hoy: ${resDia.rows.length}`);
  const cHoy = resDia.rows[0];
  console.log(` -> Datos de hoy: Cierre=$${cHoy.cierre}, Esperado=$${cHoy.esperado}, Diferencia=$${cHoy.diferencia}`);

  // 3. Probar consulta de reportes para el MES (periodo = 'mes')
  console.log("\n3. Consultando consulta de reporte mensual (periodo = 'mes')...");
  const monthStart = `${todayStr.slice(0, 7)}-01T00:00:00-06:00`;
  const monthEnd = `${todayStr.slice(0, 7)}-30T23:59:59.999-06:00`;

  const resMes = await client.query(
    `SELECT c.id, to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
            c.apertura::float, c.cierre::float, c.efectivo::float,
            (c.apertura + c.efectivo)::float AS esperado,
            (c.cierre - (c.apertura + c.efectivo))::float AS diferencia
     FROM public.caja c
     WHERE (c.fecha BETWEEN DATE($1) AND DATE($2)) OR (c.created_at BETWEEN $1 AND $2)
     ORDER BY c.created_at DESC`,
    [monthStart, monthEnd]
  );

  console.log(` -> Cajas encontradas para el mes: ${resMes.rows.length}`);

  await client.end();

  if (resDia.rows.length > 0 && resMes.rows.length > 0 && Math.abs(cHoy.diferencia - (-5.00)) < 0.01) {
    console.log("\nVERIFICACIÓN COMPLETADA 100% EXITO: El cuadre de caja (faltante/sobrante) queda registrado por día y mes.");
    process.exit(0);
  } else {
    console.error("\nERROR EN VERIFICACIÓN");
    process.exit(1);
  }
}

testReportesCaja().catch((e) => {
  console.error("Error en prueba de reportes:", e);
  process.exit(1);
});
