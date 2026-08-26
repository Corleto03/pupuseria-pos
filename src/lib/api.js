import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function requireUser(roles) {
  const user = await getSession();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.rol)) {
    return { user: null, error: NextResponse.json({ error: "Sin permiso" }, { status: 403 }) };
  }
  return { user, error: null };
}
