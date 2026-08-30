import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";
import { PEDIDO_SELECT } from "@/lib/queries";

export async function GET() {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "cocinero"]);
  if (error) return error;

  const { rows } = await withUser(user, (c) =>
    c.query(
      `${PEDIDO_SELECT}
       WHERE p.estado_pago = 'pendiente'
         AND EXISTS (
           SELECT 1 FROM detalle_pedidos x
           WHERE x.id_pedido = p.id
             AND x.estado_cocina IN ('pendiente', 'preparacion', 'entregado')
         )
       GROUP BY p.id, m.numero, u.nombre
       ORDER BY p.fecha ASC`
    )
  );
  return NextResponse.json({ pedidos: rows });
}
