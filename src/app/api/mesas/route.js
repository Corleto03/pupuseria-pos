import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const mesas = await withUser(user, (c) =>
    c.query(
      `SELECT m.*,
              p.id AS pedido_id,
              p.nombre_control,
              p.total,
              p.fecha
       FROM mesas m
       LEFT JOIN pedidos p
         ON p.id_mesa = m.id AND p.estado_pago = 'pendiente' AND p.tipo_pedido = 'local'
       ORDER BY m.numero`
    )
  );
  return NextResponse.json({ mesas: mesas.rows });
}
