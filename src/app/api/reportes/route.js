import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

function rango(periodo) {
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
  const { user, error } = await requireUser(["gerente"]);
  if (error) return error;
  const periodo = new URL(request.url).searchParams.get("periodo") || "dia";
  const { start, end } = rango(periodo);

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
              m.numero AS mesa_numero, u.nombre AS mesero_nombre
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
       WHERE p.estado_pago = 'pagada' AND COALESCE(p.fecha_pago, p.fecha) BETWEEN $1 AND $2
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
    return {
      total: ventas.rows[0].total,
      ordenes: ventas.rows[0].ordenes,
      promedio: ventas.rows[0].ordenes ? ventas.rows[0].total / ventas.rows[0].ordenes : 0,
      servicio: servicio.rows,
      recientes: recientes.rows,
      top: top.rows,
      serie: serie.rows,
    };
  });

  return NextResponse.json(data);
}
