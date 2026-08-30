import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { COOKIE, HOME_BY_ROLE, signToken } from "@/lib/auth";

export async function POST(request) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
  }

  const loginKey = email.trim().toLowerCase();
  const allowed = await pool.query("SELECT public.login_puede_intentar($1) AS ok", [loginKey]);
  if (!allowed.rows[0]?.ok) {
    return NextResponse.json({ error: "Demasiados intentos. Intente nuevamente en 15 minutos." }, { status: 429 });
  }

  const { rows } = await pool.query("SELECT * FROM public.login_lookup($1)", [loginKey]);
  const user = rows[0];
  if (!user || !user.activo) {
    await pool.query("SELECT public.login_fallido($1)", [loginKey]);
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    await pool.query("SELECT public.login_fallido($1)", [loginKey]);
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  await pool.query("SELECT public.login_exitoso($1)", [loginKey]);

  const token = await signToken(user);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
    home: HOME_BY_ROLE[user.rol],
  });
}
