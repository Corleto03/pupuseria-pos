import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser, pgError } from "@/lib/db";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const mesas = await withUser(user, (c) =>
    c.query(
      `SELECT m.id,
              m.numero,
              m.capacidad,
              CASE WHEN p.id IS NOT NULL THEN 'ocupada' ELSE 'disponible' END AS estado,
              p.id AS pedido_id,
              p.nombre_control,
              COALESCE(
                (
                  SELECT SUM(d.precio_unitario * d.cantidad)
                  FROM detalle_pedidos d
                  WHERE d.id_pedido = p.id AND d.estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
                ),
                p.total,
                0
              ) AS total,
              p.fecha
       FROM mesas m
       LEFT JOIN LATERAL (
         SELECT p1.id, p1.nombre_control, p1.total, p1.fecha
         FROM pedidos p1
         WHERE p1.id_mesa = m.id AND p1.estado_pago = 'pendiente'
         ORDER BY p1.fecha DESC
         LIMIT 1
       ) p ON true
       ORDER BY m.numero`
    )
  );
  return NextResponse.json({ mesas: mesas.rows });
}

export async function POST() {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "mesero", "cajero"]);
  if (error) return error;

  try {
    const { rows } = await withUser(user, async (c) => {
      const nextNumRes = await c.query("SELECT COALESCE(MAX(numero), 0) + 1 AS next_num FROM mesas");
      const nextNum = nextNumRes.rows[0].next_num;
      return c.query(
        "INSERT INTO mesas (numero, capacidad) VALUES ($1, 4) RETURNING *",
        [nextNum]
      );
    });
    return NextResponse.json({ mesa: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
