import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pool, withUser } from "@/lib/db";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import fs from "node:fs";

export async function GET() {
  try {
    const { rows } = await pool.query("SELECT clave, valor FROM public.ajustes");
    const config = {};
    rows.forEach((r) => {
      config[r.clave] = r.valor;
    });
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  // Only superadmin, admin, and gerente can edit settings
  const { user, error } = await requireUser(["superadmin", "admin", "gerente"]);
  if (error) return error;

  try {
    const contentType = request.headers.get("content-type") || "";
    let nombreRestaurante = null;
    let logoUrl = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      nombreRestaurante = formData.get("nombre_restaurante");
      
      const file = formData.get("logo");
      if (file && typeof file === "object" && file.size > 0) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        // Ensure public directory exists
        const publicDir = path.join(process.cwd(), "public");
        if (!fs.existsSync(publicDir)) {
          await mkdir(publicDir, { recursive: true });
        }
        
        const filename = "logo.png";
        const uploadPath = path.join(publicDir, filename);
        await writeFile(uploadPath, buffer);
        logoUrl = `/logo.png?v=${Date.now()}`; // Add version for cache busting
      }
    } else {
      const body = await request.json();
      nombreRestaurante = body.nombre_restaurante;
      logoUrl = body.logo_url;
    }

    // Update settings in database using withUser to pass the RLS check
    await withUser(user, async (c) => {
      if (nombreRestaurante !== null) {
        await c.query(
          "INSERT INTO public.ajustes (clave, valor) VALUES ('nombre_restaurante', $1) ON CONFLICT (clave) DO UPDATE SET valor = $1",
          [String(nombreRestaurante).trim()]
        );
      }
      
      if (logoUrl !== null) {
        await c.query(
          "INSERT INTO public.ajustes (clave, valor) VALUES ('logo_url', $1) ON CONFLICT (clave) DO UPDATE SET valor = $1",
          [logoUrl]
        );
      }
    });

    // Return the updated settings
    const { rows } = await pool.query("SELECT clave, valor FROM public.ajustes");
    const config = {};
    rows.forEach((r) => {
      config[r.clave] = r.valor;
    });
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
