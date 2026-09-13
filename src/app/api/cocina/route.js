import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";
import { PEDIDO_SELECT } from "@/lib/queries";

export async function GET() {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "cocinero", "mesero", "cajero"]);
  if (error) return error;

  const { rows } = await withUser(user, (c) =>
    c.query(
      `SELECT
         p.id, p.tipo_pedido, p.nombre_control, p.id_mesa, p.id_usuario, p.estado_pago, p.fecha, p.metodo_pago, p.pago_efectivo, p.pago_tarjeta, p.monto_recibido, p.vuelto, p.fecha_pago, p.notas, p.ronda_actual,
         COALESCE(
           (
             SELECT SUM(d2.precio_unitario * d2.cantidad)
             FROM detalle_pedidos d2
             WHERE d2.id_pedido = p.id AND d2.estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
           ),
           p.total,
           0
         ) AS total,
         m.numero AS mesa_numero,
         u.nombre AS mesero_nombre,
         COALESCE(
           json_agg(
             json_build_object(
               'id', d.id,
               'id_producto', d.id_producto,
               'cantidad', d.cantidad,
               'estado_cocina', d.estado_cocina,
               'destino_servicio', d.destino_servicio,
               'notas', d.notas,
               'variante', d.variante,
               'precio_unitario', d.precio_unitario,
               'producto_nombre', pr.nombre,
               'categoria', pr.categoria,
               'estacion', COALESCE(d.estacion, pr.categoria),
               'ronda', COALESCE(d.ronda, 1),
               'impreso', COALESCE(d.impreso, FALSE)
             ) ORDER BY d.created_at
           ) FILTER (WHERE d.id IS NOT NULL),
           '[]'
         ) AS detalles,
         COALESCE(
           (
             SELECT json_object_agg(ep.estacion, json_build_object('lista', ep.lista, 'ts_lista', ep.ts_lista))
             FROM estaciones_pedido ep
             WHERE ep.id_pedido = p.id
           ),
           '{}'::json
         ) AS estaciones_info
       FROM pedidos p
       LEFT JOIN mesas m ON m.id = p.id_mesa
       LEFT JOIN usuarios u ON u.id = p.id_usuario
       LEFT JOIN detalle_pedidos d ON d.id_pedido = p.id
       LEFT JOIN productos pr ON pr.id = d.id_producto
       WHERE p.estado_pago = 'pendiente'
         AND EXISTS (
           SELECT 1 FROM detalle_pedidos x
           WHERE x.id_pedido = p.id
             AND x.estado_cocina IN ('pendiente', 'preparacion', 'entregado')
             AND COALESCE(x.estacion, '') IN ('pupusa', 'panes', 'bebida')
         )
       GROUP BY p.id, m.numero, u.nombre
       ORDER BY p.fecha ASC`
    )
  );
  return NextResponse.json({ pedidos: rows });
}
