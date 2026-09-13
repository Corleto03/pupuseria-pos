import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

/**
 * POST /api/cocina/pedidos/[id]/lista-todo
 * Marca TODOS los platillos de una comanda como 'entregado'
 * y todas sus estaciones como listas, emitiendo la notificación comanda_lista completa.
 */
export async function POST(request, { params }) {
  const { user, error } = await requireUser(
    ["superadmin", "admin", "gerente", "cocinero"],
    "Tu rol no permite marcar órdenes como listas o despacharlas. Esta acción es exclusiva del personal de Cocina o Administración."
  );
  if (error) return error;

  const { id } = await params;

  try {
    await withUser(user, async (c) => {
      // 1. Marcar todos los platillos activos de este pedido como entregados
      await c.query(
        `UPDATE public.detalle_pedidos
         SET estado_cocina = 'entregado'
         WHERE id_pedido = $1
           AND estado_cocina IN ('pendiente', 'preparacion')`,
        [id]
      );

      // 2. Marcar todas las estaciones registradas del pedido como listas
      await c.query(
        `UPDATE public.estaciones_pedido
         SET lista = TRUE, ts_lista = NOW()
         WHERE id_pedido = $1`,
        [id]
      );

      // 3. Obtener información de la mesa/pedido
      const { rows: pInfo } = await c.query(
        `SELECT p.nombre_control, m.numero AS mesa_numero
         FROM public.pedidos p
         LEFT JOIN public.mesas m ON m.id = p.id_mesa
         WHERE p.id = $1`,
        [id]
      );
      const info = pInfo[0] || {};

      // 4. Emitir notificación de comanda completa lista para meseros y administradores
      await c.query(
        `SELECT pg_notify('pos_events', $1::TEXT)`,
        [
          JSON.stringify({
            table: "comanda_lista",
            op: "UPDATE",
            id_pedido: id,
            mesa_numero: info.mesa_numero,
            nombre_control: info.nombre_control,
            todas_listas: true,
            ts: Date.now() / 1000,
          }),
        ]
      );
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Error al despachar comanda" },
      { status: 500 }
    );
  }
}
