import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "pos_session";

const RULES = [
  { prefix: "/mesas", roles: ["gerente", "mesero", "cajero"] },
  { prefix: "/llevar", roles: ["gerente", "mesero", "cajero"] },
  { prefix: "/caja", roles: ["gerente", "mesero", "cajero"] },
  { prefix: "/historial", roles: ["gerente", "mesero", "cajero"] },
  { prefix: "/cocina", roles: ["gerente", "cocinero"] },
  { prefix: "/dashboard", roles: ["gerente"] },
  { prefix: "/menu", roles: ["gerente"] },
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
