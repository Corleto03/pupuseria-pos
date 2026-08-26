import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";

export async function POST(request, { params }) {
  const { user, error } = await requireUser(["gerente", "mesero", "cajero"]);
  if (error) return error;
  const { id } = await params;
  const body = await request.json();
  try {
    const { rows } = await withUser(user, async (c) => {
      const prod = await c.query("SELECT * FROM productos WHERE id = $1 AND activo = TRUE", [body.id_producto]);
      if (!prod.rows[0]) throw Object.assign(new Error("Producto no disponible"), { code: "P0001" });
      const p = prod.rows[0];
      const destino = body.destino_servicio || (await c.query(
        "SELECT tipo_pedido FROM pedidos WHERE id = $1", [id]
      )).rows[0]?.tipo_pedido;
      if (!['local', 'llevar'].includes(destino)) {
        throw Object.assign(new Error("Destino de servicio inválido"), { code: "P0001" });
      }
      // Solo se agrupan borradores iguales; un ítem enviado nunca vuelve a cambiarse.
      const existing = await c.query(
        `SELECT id, cantidad FROM detalle_pedidos
         WHERE id_pedido = $1
           AND id_producto = $2
           AND estado_cocina IN ('borrador', 'pendiente')
           AND destino_servicio = $5
           AND (variante = $3 OR (variante IS NULL AND $3 IS NULL))
           AND (notas = $4 OR (notas IS NULL AND $4 IS NULL))
         LIMIT 1`,
        [id, p.id, body.variante || null, body.notas || null, destino]
      );

      if (existing.rows[0]) {
        const newQty = existing.rows[0].cantidad + (body.cantidad || 1);
        return c.query(
          `UPDATE detalle_pedidos
           SET cantidad = $1
           WHERE id = $2
           RETURNING *`,
          [newQty, existing.rows[0].id]
        );
      } else {
        return c.query(
          `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, notas, variante, destino_servicio, precio_unitario)
           SELECT $1, $2, $3, $4, $5, $6, $7
           FROM pedidos pe
           WHERE pe.id = $1 AND pe.estado_pago = 'pendiente'
           RETURNING *`,
          [id, p.id, body.cantidad || 1, body.notas || null, body.variante || null, destino, p.precio]
        );
      }
    });
    if (!rows[0]) return NextResponse.json({ error: "El pedido ya no está abierto o no encontrado" }, { status: 409 });
    return NextResponse.json({ detalle: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
