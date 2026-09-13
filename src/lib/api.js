import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function requireUser(roles, customErrorMessage) {
  const user = await getSession();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "No autenticado. Por favor inicia sesión." }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.rol)) {
    const rolNombre = user.rol.charAt(0).toUpperCase() + user.rol.slice(1);
    const defaultMsg = `Tu rol actual (${rolNombre}) no tiene permisos para realizar esta acción.`;
    const msg = customErrorMessage || defaultMsg;
    return { user: null, error: NextResponse.json({ error: msg }, { status: 403 }) };
  }
  return { user, error: null };
}
