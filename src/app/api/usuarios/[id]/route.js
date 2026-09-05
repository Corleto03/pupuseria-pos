import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";

export async function PATCH(request, { params }) {
  const { user, error } = await requireUser(["superadmin", "admin"]);
  if (error) return error;
  const { id } = await params;
  const body = await request.json();
  try {
    const { rows } = await withUser(user, async (c) => {
      const target = await c.query("SELECT id, rol FROM usuarios WHERE id = $1", [id]);
      if (!target.rows[0] || (target.rows[0].rol === "superadmin" && user.rol !== "superadmin")) {
        throw Object.assign(new Error("Usuario no disponible"), { code: "P0001" });
      }
      if (body.password !== undefined) {
        if (String(body.password).length < 12) throw Object.assign(new Error("La contraseña debe tener al menos 12 caracteres"), { code: "P0001" });
        const hash = await bcrypt.hash(String(body.password), 12);
        return c.query("UPDATE usuarios SET password_hash = $1 WHERE id = $2 RETURNING id, email, nombre, rol, activo", [hash, id]);
      }
      if (typeof body.activo !== "boolean") throw Object.assign(new Error("Cambio inválido"), { code: "P0001" });
      return c.query("UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, email, nombre, rol, activo", [body.activo, id]);
    });
    return NextResponse.json({ usuario: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}

export async function POST(request, context) {
  return PATCH(request, context);
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireUser(["superadmin", "admin"]);
  if (error) return error;
  const { id } = await params;
  try {
    await withUser(user, async (c) => {
      if (id === user.id) {
        throw Object.assign(new Error("No puedes eliminar tu propio usuario"), { code: "P0001" });
      }
      const target = await c.query("SELECT id, rol FROM usuarios WHERE id = $1", [id]);
      if (!target.rows[0]) {
        throw Object.assign(new Error("Usuario no encontrado"), { code: "P0002" });
      }
      if (target.rows[0].rol === "superadmin" && user.rol !== "superadmin") {
        throw Object.assign(new Error("No tienes permisos para eliminar a un superadmin"), { code: "P0001" });
      }
      return c.query("UPDATE usuarios SET eliminado = TRUE, activo = FALSE WHERE id = $1", [id]);
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
