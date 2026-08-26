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
  const { user, error } = await requireUser(["gerente", "mesero", "cajero"]);
  if (error) return error;
  const { id } = await params;
  const body = await request.json();
  try {
    if (body.accion === "enviar_cocina") {
      const { rows } = await withUser(user, (c) =>
        c.query(
          `UPDATE detalle_pedidos
           SET estado_cocina = 'pendiente'
           WHERE id_pedido = $1 AND estado_cocina = 'borrador'
           RETURNING id`,
          [id]
        )
      );
      if (!rows.length) return NextResponse.json({ error: "No hay platillos nuevos para enviar a cocina" }, { status: 409 });
      return NextResponse.json({ enviados: rows.length });
    }
    if (body.accion === "cobrar") {
      const { rows } = await withUser(user, (c) =>
        c.query(
          `UPDATE pedidos SET estado_pago = 'pagada', fecha_pago = NOW()
           WHERE id = $1 AND estado_pago = 'pendiente' RETURNING *`,
          [id]
        )
      );
      if (!rows[0]) return NextResponse.json({ error: "Pedido no disponible para cobro" }, { status: 409 });
      return NextResponse.json({ pedido: rows[0] });
    }
    if (body.accion === "cancelar") {
      const { rows } = await withUser(user, async (c) => {
        const chk = await c.query(
          `SELECT COUNT(*)::int AS n
           FROM detalle_pedidos
           WHERE id_pedido = $1 AND estado_cocina IN ('preparacion', 'entregado')`,
          [id]
        );
        if (chk.rows[0].n > 0) {
          throw Object.assign(new Error("No se puede cancelar: ya hay productos en preparación o entregados"), { code: "P0001" });
        }
        return c.query(
          `UPDATE pedidos SET estado_pago = 'cancelada' WHERE id = $1 AND estado_pago = 'pendiente' RETURNING *`,
          [id]
        );
      });
      return NextResponse.json({ pedido: rows[0] });
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
