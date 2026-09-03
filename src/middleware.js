import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "pos_session";

const RULES = [
  { prefix: "/mesas", roles: ["superadmin", "admin", "gerente", "mesero", "cajero"] },
  { prefix: "/llevar", roles: ["superadmin", "admin", "gerente", "mesero", "cajero"] },
  { prefix: "/caja", roles: ["superadmin", "admin", "gerente", "cajero"] },
  { prefix: "/historial", roles: ["superadmin", "admin", "gerente", "mesero", "cajero"] },
  { prefix: "/cocina", roles: ["superadmin", "admin", "gerente", "cocinero", "mesero", "cajero"] },
  { prefix: "/dashboard", roles: ["superadmin", "admin", "gerente"] },
  { prefix: "/menu", roles: ["superadmin", "admin", "gerente"] },
  { prefix: "/usuarios", roles: ["superadmin", "admin"] },
  { prefix: "/personalizacion", roles: ["superadmin", "admin"] },
];

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "");
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  let rol;
  try {
    const { payload } = await jwtVerify(token, secret());
    rol = payload.rol;
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  if (rule && !rule.roles.includes(rol)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
