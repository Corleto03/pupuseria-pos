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

const MAX_LOGO_SIZE = 3 * 1024 * 1024; // 3 MB max

function validateImageFile(file, buffer) {
  if (buffer.length > MAX_LOGO_SIZE) {
    throw Object.assign(new Error("La imagen excede el límite máximo de 3 MB"), { status: 400 });
  }

  const mime = String(file.type || "").toLowerCase();
  const allowedMime = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!allowedMime.includes(mime)) {
    throw Object.assign(new Error("Formato no permitido. Solo se aceptan imágenes PNG, JPG o WebP"), { status: 400 });
  }

  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp =
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

  if (!isPng && !isJpg && !isWebp) {
    throw Object.assign(new Error("El archivo no es una imagen válida o está dañado"), { status: 400 });
  }

  if (isPng) return ".png";
  if (isWebp) return ".webp";
  return ".jpg";
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
      
      const eliminarLogo = formData.get("eliminar_logo");
      if (eliminarLogo === "true" || formData.get("logo_url") === "") {
        logoUrl = "";
      } else {
        const file = formData.get("logo");
        if (file && typeof file === "object" && file.size > 0) {
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const ext = validateImageFile(file, buffer);
          
          // Ensure public directory exists
          const publicDir = path.join(process.cwd(), "public");
          if (!fs.existsSync(publicDir)) {
            await mkdir(publicDir, { recursive: true });
          }
          
          const filename = `logo${ext}`;
          const uploadPath = path.join(publicDir, filename);
          await writeFile(uploadPath, buffer);
          logoUrl = `/${filename}?v=${Date.now()}`; // Add version for cache busting
        }
      }
    } else {
      const body = await request.json();
      nombreRestaurante = body.nombre_restaurante;
      if (body.logo_url !== undefined) {
        logoUrl = body.logo_url;
      }
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
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(request) {
  return PATCH(request);
}
