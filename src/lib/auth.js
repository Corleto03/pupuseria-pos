import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const COOKIE = "pos_session";
export const ROLES = ["gerente", "mesero", "cocinero", "cajero"];

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET inválido");
  return new TextEncoder().encode(s);
};

export async function signToken(user) {
  return new SignJWT({
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    rol: user.rol,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, secret());
  return {
    id: payload.id,
    email: payload.email,
    nombre: payload.nombre,
    rol: payload.rol,
  };
}

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export function canAccess(rol, roles) {
  return roles.includes(rol);
}

export const HOME_BY_ROLE = {
  gerente: "/dashboard",
  mesero: "/mesas",
  cajero: "/caja",
  cocinero: "/cocina",
};
