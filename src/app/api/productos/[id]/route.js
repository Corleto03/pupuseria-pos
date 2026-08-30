import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";

export async function PATCH(request, { params }) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente"]);
  if (error) return error;
  const { id } = await params;
  const body = await request.json();

  try {
    const { rows } = await withUser(user, (c) => {
      const fields = [];
      const vals = [];
      let i = 1;

      if (body.nombre !== undefined) {
        fields.push(`nombre = $${i++}`);
        vals.push(body.nombre);
      }
      if (body.categoria !== undefined) {
        fields.push(`categoria = $${i++}`);
        vals.push(body.categoria);
      }
      if (body.precio !== undefined) {
        fields.push(`precio = $${i++}`);
        vals.push(Number(body.precio));
      }
      if (body.especialidad !== undefined) {
        fields.push(`especialidad = $${i++}`);
        vals.push(body.especialidad || null);
      }
      if (body.activo !== undefined) {
        fields.push(`activo = $${i++}`);
        vals.push(body.activo);
      }

      if (fields.length === 0) {
        throw new Error("No hay campos para actualizar");
      }

      vals.push(id);
      const query = `UPDATE productos SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`;
      return c.query(query, vals);
    });

    if (!rows[0]) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    return NextResponse.json({ producto: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}

export async function DELETE(_req, { params }) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente"]);
  if (error) return error;
  const { id } = await params;

  try {
    const { rowCount } = await withUser(user, (c) =>
      c.query("DELETE FROM productos WHERE id = $1", [id])
    );
    if (!rowCount) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({
      error: "No se puede eliminar el producto porque tiene pedidos asociados. Considere desactivarlo.",
    }, { status: 409 });
  }
}
