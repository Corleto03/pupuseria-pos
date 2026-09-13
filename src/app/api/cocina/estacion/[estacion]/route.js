import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

export async function GET(request, { params }) {
  const { estacion } = await params;
  const { user, error } = await requireUser([
    "superadmin", "admin", "gerente", "cocinero", "mesero", "cajero",
  ]);
  if (error) return error;

  const ESTACIONES_VALIDAS = ["pupusa", "panes", "bebida", "extra"];
  if (!ESTACIONES_VALIDAS.includes(estacion)) {
    return NextResponse.json({ error: "Estacion no valida" }, { status: 400 });
  }

  const { rows } = await withUser(user, (c) =>
    c.query(
      `SELECT
         p.id, p.tipo_pedido, p.nombre_control, p.id_mesa, p.estado_pago, p.fecha, p.notas,
         m.numero AS mesa_numero,
         u.nombre AS mesero_nombre,
         COALESCE(
           json_agg(
             json_build_object(
               'id', d.id,
               'id_producto', d.id_producto,
               'cantidad', d.cantidad,
               'estado_cocina', d.estado_cocina,
               'notas', d.notas,
               'variante', d.variante,
               'precio_unitario', d.precio_unitario,
               'producto_nombre', pr.nombre,
               'categoria', pr.categoria,
               'estacion', d.estacion,
               'ronda', COALESCE(d.ronda, 1)
             ) ORDER BY d.created_at
           ) FILTER (WHERE d.id IS NOT NULL AND d.estacion = $1),
           '[]'
         ) AS detalles,
         p.ronda_actual,
         COALESCE(ep.lista, FALSE) AS estacion_lista,
         ep.ts_lista
       FROM pedidos p
       LEFT JOIN mesas m ON m.id = p.id_mesa
       LEFT JOIN usuarios u ON u.id = p.id_usuario
       LEFT JOIN detalle_pedidos d ON d.id_pedido = p.id
       LEFT JOIN productos pr ON pr.id = d.id_producto
       LEFT JOIN estaciones_pedido ep ON ep.id_pedido = p.id AND ep.estacion = $1
       WHERE p.estado_pago = 'pendiente'
         AND EXISTS (
           SELECT 1 FROM detalle_pedidos x
           WHERE x.id_pedido = p.id
             AND x.estacion = $1
             AND x.estado_cocina IN ('pendiente', 'preparacion', 'entregado')
         )
       GROUP BY p.id, m.numero, u.nombre, ep.lista, ep.ts_lista, p.ronda_actual
       ORDER BY p.fecha ASC`,
      [estacion]
    )
  );

  return NextResponse.json({ pedidos: rows });
}