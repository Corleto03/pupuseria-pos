import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

function getLocalYMD(d = new Date(), tz = "America/El_Salvador") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function rango(periodo, fechaParam, tz = "America/El_Salvador") {
  if (fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
    const start = new Date(`${fechaParam}T00:00:00-06:00`);
    const end = new Date(`${fechaParam}T23:59:59.999-06:00`);
    return { start, end };
  }

  const todayYMD = getLocalYMD(new Date(), tz);

  if (periodo === "semana") {
    const [y, m, d] = todayYMD.split("-").map(Number);
    const localDate = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = localDate.getUTCDay() || 7; // 1 = lunes, 7 = domingo
    const monday = new Date(localDate);
    monday.setUTCDate(localDate.getUTCDate() - dayOfWeek + 1);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const monYMD = monday.toISOString().slice(0, 10);
    const sunYMD = sunday.toISOString().slice(0, 10);
    return {
      start: new Date(`${monYMD}T00:00:00-06:00`),
      end: new Date(`${sunYMD}T23:59:59.999-06:00`),
    };
  } else if (periodo === "mes") {
    const [y, m] = todayYMD.split("-");
    const nextMonth = Number(m) === 12 ? new Date(Number(y) + 1, 0, 1) : new Date(Number(y), Number(m), 1);
    const lastDayOfMonth = new Date(nextMonth.getTime() - 1);
    const lastYMD = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(lastDayOfMonth);
    return {
      start: new Date(`${y}-${m}-01T00:00:00-06:00`),
      end: new Date(`${lastYMD}T23:59:59.999-06:00`),
    };
  }

  // periodo === 'dia' (Hoy)
  const start = new Date(`${todayYMD}T00:00:00-06:00`);
  const end = new Date(`${todayYMD}T23:59:59.999-06:00`);
  return { start, end };
}

export async function GET(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente"]);
  if (error) return error;
  const searchParams = new URL(request.url).searchParams;
  const periodo = searchParams.get("periodo") || "dia";
  const fecha = searchParams.get("fecha") || "";
  const { start, end } = rango(periodo, fecha);

  const data = await withUser(user, async (c) => {
    const ventas = await c.query(
      `SELECT COALESCE(SUM(p.total),0)::float AS total,
              COUNT(*)::int AS ordenes
       FROM pedidos p
       WHERE p.estado_pago = 'pagada' AND COALESCE(p.fecha_pago, p.fecha) BETWEEN $1 AND $2`,
      [start.toISOString(), end.toISOString()]
    );
    const servicio = await c.query(
      `SELECT p.tipo_pedido AS tipo,
              COUNT(*)::int AS ordenes,
              COALESCE(SUM(p.total), 0)::float AS total
       FROM pedidos p
       WHERE p.estado_pago = 'pagada' AND COALESCE(p.fecha_pago, p.fecha) BETWEEN $1 AND $2
       GROUP BY p.tipo_pedido
       ORDER BY total DESC`,
      [start.toISOString(), end.toISOString()]
    );
    const recientes = await c.query(
      `SELECT p.id, COALESCE(p.fecha_pago, p.fecha) AS fecha,
              p.nombre_control, p.tipo_pedido, p.total::float AS total,
              m.numero AS mesa_numero, u.nombre AS mesero_nombre,
              COALESCE(
                (
                  SELECT CASE 
                    WHEN COUNT(DISTINCT d.destino_servicio) > 1 THEN 'local/llevar'
                    WHEN MIN(d.destino_servicio) = 'llevar' THEN 'llevar'
                    ELSE 'local'
                  END
                  FROM detalle_pedidos d
                  WHERE d.id_pedido = p.id AND d.estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
                ),
                p.tipo_pedido
              ) AS tipo_servicio_calculado
       FROM pedidos p
       LEFT JOIN mesas m ON m.id = p.id_mesa
       LEFT JOIN usuarios u ON u.id = p.id_usuario
       WHERE p.estado_pago = 'pagada' AND COALESCE(p.fecha_pago, p.fecha) BETWEEN $1 AND $2
       ORDER BY COALESCE(p.fecha_pago, p.fecha) DESC
       LIMIT 12`,
      [start.toISOString(), end.toISOString()]
    );
    const top = await c.query(
      `SELECT pr.nombre,
              SUM(d.cantidad)::int AS cantidad,
              SUM(d.cantidad * d.precio_unitario)::float AS ingresos
       FROM detalle_pedidos d
       JOIN pedidos p ON p.id = d.id_pedido
       JOIN productos pr ON pr.id = d.id_producto
       WHERE p.estado_pago = 'pagada' 
         AND COALESCE(p.fecha_pago, p.fecha) BETWEEN $1 AND $2
         AND d.estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
       GROUP BY pr.nombre
       ORDER BY cantidad DESC
       LIMIT 8`,
      [start.toISOString(), end.toISOString()]
    );
    const serie = await c.query(
      `SELECT to_char(COALESCE(p.fecha_pago, p.fecha) AT TIME ZONE 'America/El_Salvador', 'YYYY-MM-DD') AS dia,
              SUM(p.total)::float AS total
       FROM pedidos p
       WHERE p.estado_pago = 'pagada' AND COALESCE(p.fecha_pago, p.fecha) BETWEEN $1 AND $2
       GROUP BY 1
       ORDER BY 1`,
      [start.toISOString(), end.toISOString()]
    );
    const auditoria = await c.query(
      `SELECT a.id, a.created_at AS fecha, a.accion,
              u.nombre AS usuario_nombre, u.rol AS usuario_rol,
              p.id AS pedido_id, p.tipo_pedido, p.nombre_control,
              m.numero AS mesa_numero,
              COALESCE(pr.nombre, 'Producto no disponible') AS producto_nombre,
              COALESCE(a.detalle->'despues'->>'variante', a.detalle->'antes'->>'variante') AS variante,
              COALESCE((a.detalle->'despues'->>'cantidad')::int, (a.detalle->'antes'->>'cantidad')::int, 1) AS cantidad,
              COALESCE((a.detalle->'despues'->>'precio_unitario')::numeric, (a.detalle->'antes'->>'precio_unitario')::numeric, 0) AS precio_unitario
       FROM public.auditoria a
       LEFT JOIN public.usuarios u ON u.id = a.id_usuario
       LEFT JOIN public.pedidos p ON p.id = NULLIF(COALESCE(a.detalle->'despues'->>'id_pedido', a.detalle->'antes'->>'id_pedido'), '')::UUID
       LEFT JOIN public.mesas m ON m.id = p.id_mesa
       LEFT JOIN public.productos pr ON pr.id = NULLIF(COALESCE(a.detalle->'despues'->>'id_producto', a.detalle->'antes'->>'id_producto'), '')::UUID
       WHERE a.created_at BETWEEN $1 AND $2
         AND a.entidad = 'detalle_pedidos'
         AND (
           a.accion = 'delete'
           OR (a.accion = 'insert' AND a.detalle->'despues'->>'estado_cocina' IN ('no_entregado', 'anulado', 'cancelado'))
           OR (a.accion = 'update' AND a.detalle->'despues'->>'estado_cocina' IN ('no_entregado', 'anulado', 'cancelado') AND COALESCE(a.detalle->'antes'->>'estado_cocina', '') NOT IN ('no_entregado', 'anulado', 'cancelado'))
         )
         ORDER BY a.created_at DESC
         LIMIT 50`,
      [start.toISOString(), end.toISOString()]
    );
    const cajas = await c.query(
      `SELECT c.id,
              to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
              c.apertura::float AS apertura,
              c.cierre::float AS cierre,
              c.efectivo::float AS efectivo,
              c.tarjeta::float AS tarjeta,
              c.created_at,
              (c.apertura + c.efectivo)::float AS esperado,
              CASE 
                WHEN c.cierre IS NULL THEN NULL
                ELSE (c.cierre - (c.apertura + c.efectivo))::float
              END AS diferencia
       FROM public.caja c
       WHERE (c.fecha BETWEEN DATE($1) AND DATE($2)) 
          OR (c.created_at BETWEEN $1 AND $2)
       ORDER BY c.created_at DESC`,
      [start.toISOString(), end.toISOString()]
    );

    const cerradas = cajas.rows.filter((r) => r.cierre !== null);
    const cuadradasCount = cerradas.filter((r) => Math.abs(r.diferencia || 0) < 0.01).length;
    const faltantesTotal = cerradas
      .filter((r) => (r.diferencia || 0) < -0.01)
      .reduce((sum, r) => sum + Math.abs(r.diferencia), 0);
    const sobrantesTotal = cerradas
      .filter((r) => (r.diferencia || 0) > 0.01)
      .reduce((sum, r) => sum + r.diferencia, 0);

    return {
      total: ventas.rows[0].total,
      ordenes: ventas.rows[0].ordenes,
      promedio: ventas.rows[0].ordenes ? ventas.rows[0].total / ventas.rows[0].ordenes : 0,
      servicio: servicio.rows,
      recientes: recientes.rows,
      top: top.rows,
      serie: serie.rows,
      auditoria: auditoria.rows,
      cajas: cajas.rows,
      resumen_cajas: {
        total_cierres: cerradas.length,
        cuadradas: cuadradasCount,
        faltantes: faltantesTotal,
        sobrantes: sobrantesTotal,
      },
    };
  });

  return NextResponse.json(data);
}
