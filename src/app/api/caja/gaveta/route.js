import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

/**
 * POST /api/caja/gaveta
 * Registra en auditoría la apertura manual de la gaveta de dinero física
 * y valida los permisos del usuario de caja/administrador.
 */
export async function POST(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "cajero"]);
  if (error) return error;

  try {
    let motivo = "manual";
    try {
      const body = await request.json();
      if (body?.motivo) motivo = body.motivo;
    } catch {
      // Si no hay body, se mantiene 'manual'
    }

    await withUser(user, async (c) => {
      await c.query(
        `INSERT INTO public.auditoria (id_usuario, accion, entidad, detalle)
         VALUES ($1, 'abrir_gaveta', 'caja', $2::jsonb)`,
        [
          user.id,
          JSON.stringify({
            motivo,
            usuario: user.nombre,
            rol: user.rol,
            ts: new Date().toISOString(),
          }),
        ]
      );
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Apertura de gaveta registrada correctamente",
      comando_hex: "1B700019FA",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Error al procesar apertura de gaveta" },
      { status: 500 }
    );
  }
}
