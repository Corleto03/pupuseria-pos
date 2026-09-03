import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";
import { PEDIDO_SELECT } from "@/lib/queries";

export async function GET(request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado") || "pendiente";
  const tipo = searchParams.get("tipo");
  const fecha = searchParams.get("fecha") || (estado !== "pendiente" ? "hoy" : "todos");

  const { rows } = await withUser(user, (c) => {
    const params = [estado];
    let where = "p.estado_pago = $1";
    if (tipo) {
      params.push(tipo);
      where += ` AND p.tipo_pedido = $${params.length}`;
    }
    if (fecha === "hoy") {
      where += " AND (p.fecha AT TIME ZONE 'America/El_Salvador')::date = (NOW() AT TIME ZONE 'America/El_Salvador')::date";
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      params.push(fecha);
      where += ` AND (p.fecha AT TIME ZONE 'America/El_Salvador')::date = $${params.length}::date`;
    }
    const orderDir = estado === "pendiente" ? "ASC" : "DESC";
    return c.query(
      `${PEDIDO_SELECT} WHERE ${where} GROUP BY p.id, m.numero, u.nombre ORDER BY p.fecha ${orderDir}`,
      params
    );
  });
  return NextResponse.json({ pedidos: rows });
}

export async function POST(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "mesero", "cajero"]);
  if (error) return error;
  const body = await request.json();
  try {
    const { rows } = await withUser(user, (c) =>
      c.query("SELECT * FROM abrir_pedido($1,$2,$3,$4)", [
        body.tipo_pedido,
        body.nombre_control,
        body.id_mesa || null,
        user.id,
      ])
    );
    return NextResponse.json({ pedido: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
