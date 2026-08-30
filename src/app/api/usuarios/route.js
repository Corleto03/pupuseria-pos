import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";

const ROLES_NEGOCIO = ["admin", "gerente", "mesero", "cocinero", "cajero"];

export async function GET() {
  const { user, error } = await requireUser(["superadmin", "admin"]);
  if (error) return error;
  const { rows } = await withUser(user, (c) =>
    c.query(
      `SELECT id, email, nombre, rol, activo, created_at FROM usuarios
       WHERE eliminado = FALSE
       ${user.rol === "superadmin" ? "" : "AND rol <> 'superadmin'"}
       ORDER BY created_at ASC`
    )
  );
  return NextResponse.json({ usuarios: rows });
}

export async function POST(request) {
  const { user, error } = await requireUser(["superadmin", "admin"]);
  if (error) return error;
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const nombre = String(body.nombre || "").trim();
  const password = String(body.password || "");
  const rol = body.rol;
  const allowed = user.rol === "superadmin" ? ["superadmin", ...ROLES_NEGOCIO] : ROLES_NEGOCIO;
  if (!email || !nombre || password.length < 12 || !allowed.includes(rol)) {
    return NextResponse.json({ error: "Datos inválidos. La contraseña debe tener al menos 12 caracteres." }, { status: 400 });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await withUser(user, (c) =>
      c.query(
        `INSERT INTO usuarios (email, password_hash, nombre, rol)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, nombre, rol, activo, created_at`,
        [email, hash, nombre, rol]
      )
    );
    return NextResponse.json({ usuario: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
