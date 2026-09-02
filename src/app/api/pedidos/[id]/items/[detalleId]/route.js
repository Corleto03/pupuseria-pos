import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";

export async function PATCH(request, { params }) {
  const { id, detalleId } = await params;
  const body = await request.json();

  const roles = body.estado_cocina
    ? ["superadmin", "admin", "gerente", "cocinero", "cajero"]
    : ["superadmin", "admin", "gerente", "mesero", "cajero"];
  const { user, error } = await requireUser(roles);
  if (error) return error;

  try {
    const { rows } = await withUser(user, async (c) => {
      if (body.estado_cocina) {
        if (body.cantidad != null) {
          const currentRes = await c.query(
            `SELECT * FROM detalle_pedidos WHERE id = $1 AND id_pedido = $2`,
            [detalleId, id]
          );
          if (currentRes.rows[0]) {
            const current = currentRes.rows[0];
            const transitionQty = parseInt(body.cantidad, 10);
            if (transitionQty > 0 && transitionQty < current.cantidad) {
              // 1. Decrease the original item's quantity
              await c.query(
                `UPDATE detalle_pedidos SET cantidad = cantidad - $1
                 WHERE id = $2 AND id_pedido = $3`,
                [transitionQty, detalleId, id]
              );
              // 2. Create the new item in the new state
              const insertedNew = await c.query(
                `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, estado_cocina, notas, variante, destino_servicio, precio_unitario, motivo_cancelacion, cancelado_por, fecha_cancelacion)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $4 = 'cancelado' THEN NOW() ELSE NULL END)
                 RETURNING *`,
                [
                  id,
                  current.id_producto,
                  transitionQty,
                  body.estado_cocina,
                  current.notas,
                  current.variante,
                  current.destino_servicio,
                  current.precio_unitario,
                  body.motivo_cancelacion || null,
                  body.estado_cocina === 'cancelado' ? user.id : null,
                ]
              );
              return insertedNew;
            }
          }
        }
        if (!['borrador', 'pendiente', 'preparacion', 'entregado', 'cancelado'].includes(body.estado_cocina)) {
          throw Object.assign(new Error("Estado de cocina no válido"), { code: "P0001" });
        }
        return c.query(
          `UPDATE detalle_pedidos SET 
             estado_cocina = $1,
             motivo_cancelacion = COALESCE($4, motivo_cancelacion),
             cancelado_por = CASE WHEN $1 = 'cancelado' THEN $5 ELSE cancelado_por END,
             fecha_cancelacion = CASE WHEN $1 = 'cancelado' THEN NOW() ELSE fecha_cancelacion END
           WHERE id = $2 AND id_pedido = $3 RETURNING *`,
          [body.estado_cocina, detalleId, id, body.motivo_cancelacion || null, user.id]
        );
      }
      if (body.cantidad != null) {
        return c.query(
          `UPDATE detalle_pedidos SET cantidad = $1
           WHERE id = $2 AND id_pedido = $3 AND estado_cocina IN ('borrador', 'pendiente') RETURNING *`,
          [body.cantidad, detalleId, id]
        );
      }
      if (body.variante !== undefined) {
        return c.query(
          `UPDATE detalle_pedidos SET variante = $1 WHERE id = $2 AND id_pedido = $3 RETURNING *`,
          [body.variante || null, detalleId, id]
        );
      }
      if (body.destino_servicio !== undefined) {
        if (!['local', 'llevar'].includes(body.destino_servicio)) {
          throw Object.assign(new Error("Destino de servicio inválido"), { code: "P0001" });
        }
        return c.query(
          `UPDATE detalle_pedidos SET destino_servicio = $1
           WHERE id = $2 AND id_pedido = $3 AND estado_cocina IN ('borrador', 'pendiente') RETURNING *`,
          [body.destino_servicio, detalleId, id]
        );
      }
      return c.query(
        `UPDATE detalle_pedidos SET notas = $1 WHERE id = $2 AND id_pedido = $3 RETURNING *`,
        [body.notas ?? null, detalleId, id]
      );
    });
    if (!rows[0]) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ detalle: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "mesero", "cajero"]);
  if (error) return error;
  const { id, detalleId } = await params;
  const url = new URL(req.url);
  const qtyParam = url.searchParams.get("cantidad");
  const qty = qtyParam ? parseInt(qtyParam, 10) : null;

  try {
    const { rowCount } = await withUser(user, async (c) => {
      if (qty && qty > 0) {
        const currentRes = await c.query(
          "SELECT cantidad FROM detalle_pedidos WHERE id = $1 AND id_pedido = $2",
          [detalleId, id]
        );
        if (currentRes.rows[0] && qty < currentRes.rows[0].cantidad) {
          return c.query(
            "UPDATE detalle_pedidos SET cantidad = cantidad - $1 WHERE id = $2 AND id_pedido = $3",
            [qty, detalleId, id]
          );
        }
      }
      return c.query("DELETE FROM detalle_pedidos WHERE id = $1 AND id_pedido = $2", [detalleId, id]);
    });
    if (!rowCount) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
