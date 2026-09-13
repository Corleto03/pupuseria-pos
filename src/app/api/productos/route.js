import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

export async function GET(request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const todos = searchParams.get("todos") === "true";
  const isManagement = ["superadmin", "admin", "gerente"].includes(user.rol);

  const { rows } = await withUser(user, (c) => {
    if (todos && isManagement) {
      return c.query("SELECT * FROM productos ORDER BY sort_order, nombre");
    }
    return c.query("SELECT * FROM productos WHERE activo = TRUE ORDER BY sort_order, nombre");
  });
  return NextResponse.json({ productos: rows });
}

export async function POST(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente"]);
  if (error) return error;
  const body = await request.json();
  const { rows } = await withUser(user, (c) =>
    c.query(
      `INSERT INTO productos (nombre, categoria, precio, especialidad, activo)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [body.nombre, body.categoria, body.precio, body.especialidad || null]
    )
  );
  return NextResponse.json({ producto: rows[0] });
}
