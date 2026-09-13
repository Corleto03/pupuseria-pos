import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

/**
 * POST /api/cocina/estacion/[estacion]/lista
 * Body: { id_pedido: string }
 * 
 * Marca esta estacion como lista para la comanda dada.
 * Si TODAS las estaciones de esa comanda estan listas, emite evento comanda_lista
 * actualizando la tabla estaciones_pedido (el trigger NOTIFY lo difunde).
 */
export async function POST(request, { params }) {
  const { estacion } = await params;
  const { user, error } = await requireUser(
    ["superadmin", "admin", "gerente", "cocinero"],
    "Tu rol no permite marcar órdenes como listas en esta estación de cocina. Esta acción es exclusiva del personal de Cocina o Administración."
  );
  if (error) return error;

  const ESTACIONES_VALIDAS = ["pupusa", "panes", "bebida", "extra"];
  if (!ESTACIONES_VALIDAS.includes(estacion)) {
    return NextResponse.json({ error: "Estacion no valida" }, { status: 400 });
  }

  const body = await request.json();
  const { id_pedido } = body;
  if (!id_pedido) {
    return NextResponse.json({ error: "Falta id_pedido" }, { status: 400 });
  }

  await withUser(user, async (c) => {
    // Upsert: marca la estacion como lista
    await c.query(
      `INSERT INTO public.estaciones_pedido (id_pedido, estacion, lista, ts_lista)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (id_pedido, estacion)
       DO UPDATE SET lista = TRUE, ts_lista = NOW()`,
      [id_pedido, estacion]
    );

    // Marcar items de esta estacion en esta comanda como entregado
    await c.query(
      `UPDATE public.detalle_pedidos
       SET estado_cocina = 'entregado'
       WHERE id_pedido = $1
         AND estacion = $2
         AND estado_cocina IN ('pendiente', 'preparacion')`,
      [id_pedido, estacion]
    );

    // Verificar si todas las estaciones que participan en esta comanda ya estan listas
    // Estaciones que participan = las que tienen items en esta comanda (excluye 'extra')
    const { rows: estacionesConItems } = await c.query(
      `SELECT DISTINCT estacion
       FROM public.detalle_pedidos
       WHERE id_pedido = $1
         AND estacion IN ('pupusa', 'panes', 'bebida')
         AND estado_cocina NOT IN ('borrador', 'anulado', 'cancelado', 'no_entregado')`,
      [id_pedido]
    );

    const { rows: estacionesListas } = await c.query(
      `SELECT estacion FROM public.estaciones_pedido
       WHERE id_pedido = $1 AND lista = TRUE`,
      [id_pedido]
    );

    const conItems = new Set(estacionesConItems.map((r) => r.estacion));
    const listas = new Set(estacionesListas.map((r) => r.estacion));
    const todasListas = [...conItems].every((e) => listas.has(e));

    const { rows: pedidoInfo } = await c.query(
      `SELECT p.nombre_control, m.numero AS mesa_numero
       FROM public.pedidos p
       LEFT JOIN public.mesas m ON m.id = p.id_mesa
       WHERE p.id = $1`,
      [id_pedido]
    );
    const info = pedidoInfo[0] || {};

    if (todasListas && conItems.size > 0) {
      // Notificación de comanda 100% completa
      await c.query(
        `SELECT pg_notify('pos_events', $1::TEXT)`,
        [
          JSON.stringify({
            table: "comanda_lista",
            op: "UPDATE",
            id_pedido,
            mesa_numero: info.mesa_numero,
            nombre_control: info.nombre_control,
            todas_listas: true,
            ts: Date.now() / 1000,
          }),
        ]
      );
    } else {
      // Notificación de estación / área parcial lista
      await c.query(
        `SELECT pg_notify('pos_events', $1::TEXT)`,
        [
          JSON.stringify({
            table: "comanda_estacion_lista",
            op: "UPDATE",
            id_pedido,
            estacion,
            mesa_numero: info.mesa_numero,
            nombre_control: info.nombre_control,
            todas_listas: false,
            ts: Date.now() / 1000,
          }),
        ]
      );
    }
  });


  return NextResponse.json({ ok: true });
}