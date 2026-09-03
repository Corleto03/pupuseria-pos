import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

function rango(periodo, fechaParam) {
  if (fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
    const start = new Date(`${fechaParam}T00:00:00-06:00`);
    const end = new Date(`${fechaParam}T23:59:59.999-06:00`);
    return { start, end };
  }
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (periodo === "semana") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (periodo === "mes") {
    start.setDate(1);
  }
  end.setHours(23, 59, 59, 999);
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
    return {
      total: ventas.rows[0].total,
      ordenes: ventas.rows[0].ordenes,
      promedio: ventas.rows[0].ordenes ? ventas.rows[0].total / ventas.rows[0].ordenes : 0,
      servicio: servicio.rows,
      recientes: recientes.rows,
      top: top.rows,
      serie: serie.rows,
      auditoria: auditoria.rows,
    };
  });

  return NextResponse.json(data);
}
