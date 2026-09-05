import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";
import { PEDIDO_SELECT } from "@/lib/queries";

export async function GET(_req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const { rows } = await withUser(user, (c) =>
    c.query(`${PEDIDO_SELECT} WHERE p.id = $1 GROUP BY p.id, m.numero, u.nombre`, [id])
  );
  if (!rows[0]) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ pedido: rows[0] });
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "mesero", "cajero"]);
  if (error) return error;
  const { id } = await params;
  const body = await request.json();
  try {
    if (body.accion === "enviar_cocina") {
      const { rows } = await withUser(user, async (c) => {
        const res = await c.query(
          `UPDATE detalle_pedidos
           SET estado_cocina = 'pendiente'
           WHERE id_pedido = $1 AND estado_cocina = 'borrador'
           RETURNING id`,
          [id]
        );
        await c.query("SET LOCAL app.bypass_triggers = 'true'");
        await c.query(
          `WITH dups AS (
             SELECT id_pedido, id_producto, COALESCE(variante, '') AS me_var, COALESCE(destino_servicio, 'local') AS me_dest, COALESCE(notas, '') AS me_notas, precio_unitario, estado_cocina,
                    (ARRAY_AGG(id ORDER BY created_at))[1] AS primary_id,
                    ARRAY_AGG(id ORDER BY created_at) AS all_ids,
                    SUM(cantidad) AS total_qty
             FROM detalle_pedidos
             WHERE id_pedido = $1
             GROUP BY id_pedido, id_producto, COALESCE(variante, ''), COALESCE(destino_servicio, 'local'), COALESCE(notas, ''), precio_unitario, estado_cocina
             HAVING COUNT(*) > 1
           ),
           upd AS (
             UPDATE detalle_pedidos d
             SET cantidad = dups.total_qty
             FROM dups
             WHERE d.id = dups.primary_id
           )
           DELETE FROM detalle_pedidos d
           USING dups
           WHERE d.id = ANY(dups.all_ids) AND d.id <> dups.primary_id;`,
          [id]
        );
        await c.query(
          `UPDATE pedidos SET total = (
             SELECT COALESCE(SUM(precio_unitario * cantidad), 0)
             FROM detalle_pedidos
             WHERE id_pedido = $1 AND estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
           ) WHERE id = $1`,
          [id]
        );
        return res;
      });
      if (!rows.length) return NextResponse.json({ error: "No hay platillos nuevos para enviar a cocina" }, { status: 409 });
      return NextResponse.json({ enviados: rows.length });
    }
    if (body.accion === "cobrar") {
      if (!["efectivo", "tarjeta", "mixto"].includes(body.metodo_pago)) {
        return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 });
      }
      const { rows } = await withUser(user, async (c) => {
        await c.query(
          `UPDATE pedidos SET total = (
             SELECT COALESCE(SUM(precio_unitario * cantidad), 0)
             FROM detalle_pedidos
             WHERE id_pedido = $1 AND estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
           ) WHERE id = $1 AND estado_pago = 'pendiente'`,
          [id]
        );

        const orderRes = await c.query("SELECT total FROM pedidos WHERE id = $1 AND estado_pago = 'pendiente'", [id]);
        if (!orderRes.rows[0]) {
          throw Object.assign(new Error("Pedido no disponible para cobro"), { code: "P0001" });
        }
        const total = Number(orderRes.rows[0].total);
        let ef = 0;
        let tj = 0;
        let montoRecibido = Number(body.monto_recibido) || 0;
        let vuelto = Number(body.vuelto) || 0;

        if (body.metodo_pago === "efectivo") {
          ef = total;
          if (montoRecibido <= 0) montoRecibido = total;
          if (vuelto <= 0 && montoRecibido > total) vuelto = montoRecibido - total;
        } else if (body.metodo_pago === "tarjeta") {
          tj = total;
          montoRecibido = total;
          vuelto = 0;
        } else if (body.metodo_pago === "mixto") {
          ef = Number(body.pago_efectivo) || 0;
          tj = Number(body.pago_tarjeta) || 0;
          if (ef + tj < total) {
            throw Object.assign(new Error("Los montos ingresados no cubren el total de la cuenta"), { code: "P0001" });
          }
          if (montoRecibido <= 0) montoRecibido = ef + tj;
          if (vuelto <= 0 && (ef + tj) > total) vuelto = (ef + tj) - total;
          if (ef + tj > total) ef = Math.max(0, total - tj);
        }

        return c.query(
          `UPDATE pedidos 
           SET estado_pago = 'pagada', fecha_pago = NOW(), metodo_pago = $2, pago_efectivo = $3, pago_tarjeta = $4, monto_recibido = $5, vuelto = $6
           WHERE id = $1 AND estado_pago = 'pendiente' RETURNING *`,
          [id, body.metodo_pago, ef, tj, montoRecibido, vuelto]
        );
      });
      return NextResponse.json({ pedido: rows[0] });
    }
    if (body.accion === "cambiar_metodo_pago") {
      return NextResponse.json({ error: "El método de pago no se puede modificar una vez cobrado el pedido." }, { status: 400 });
    }
    if (body.accion === "cancelar") {
      const { rows } = await withUser(user, async (c) => {
        const canForceCancel = ["superadmin", "admin"].includes(user.rol);
        if (!canForceCancel) {
          const chk = await c.query(
            `SELECT COUNT(*)::int AS n
             FROM detalle_pedidos
             WHERE id_pedido = $1 AND estado_cocina IN ('preparacion', 'entregado')`,
            [id]
          );
          if (chk.rows[0].n > 0) {
            throw Object.assign(
              new Error("No se puede cancelar: ya hay productos en preparación o entregados. Requiere usuario Administrador."),
              { code: "P0001" }
            );
          }
        } else {
          // Como admin/superadmin, anular todos los ítems pendientes o en preparación del pedido
          await c.query(
            `UPDATE detalle_pedidos
             SET estado_cocina = 'cancelado'
             WHERE id_pedido = $1 AND estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')`,
            [id]
          );
        }
        return c.query(
          `UPDATE pedidos SET estado_pago = 'cancelada' WHERE id = $1 AND estado_pago = 'pendiente' RETURNING *`,
          [id]
        );
      });
      return NextResponse.json({ pedido: rows[0] });
    }
    if (body.notas !== undefined) {
      const { rows } = await withUser(user, (c) =>
        c.query(
          `UPDATE pedidos SET notas = $2 WHERE id = $1 RETURNING *`,
          [id, body.notas || null]
        )
      );
      if (!rows[0]) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      return NextResponse.json({ pedido: rows[0] });
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}

export async function POST(request, context) {
  return PATCH(request, context);
}
