import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";
import { PEDIDO_SELECT } from "@/lib/queries";

export async function GET(_req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const { rows } = await withUser(user, (c) =>
    c.query(`${PEDIDO_SELECT} WHERE p.id = $1 GROUP BY p.id, m.numero, u.nombre`, [id])
  );
  if (!rows[0]) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ pedido: rows[0] });
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "mesero", "cajero"]);
  if (error) return error;
  const { id } = await params;
  const body = await request.json();
  try {
    if (body.accion === "enviar_cocina") {
      const { rows, rondaNueva, newlySentRows, pInfo } = await withUser(user, async (c) => {
        // 1. Calcular la ronda siguiente
        const maxRondaRes = await c.query(
          `SELECT COALESCE(MAX(ronda), 0) AS max_ronda 
           FROM detalle_pedidos 
           WHERE id_pedido = $1 AND estado_cocina <> 'borrador'`,
          [id]
        );
        const nextRonda = Number(maxRondaRes.rows[0]?.max_ronda || 0) + 1;

        // 1. Asegurar que 'estacion' esté asignada desde la categoría del producto
        await c.query(
          `UPDATE public.detalle_pedidos d
           SET estacion = pr.categoria
           FROM public.productos pr
           WHERE pr.id = d.id_producto AND d.id_pedido = $1 AND (d.estacion IS NULL OR d.estacion = '')`,
          [id]
        );

        // 2. Actualizar estado y asignar ronda a los borradores:
        //    - Platillos de cocina (pupusas, panes, bebidas): pasan a 'pendiente'
        //    - Productos de mostrador (extras como churros): pasan directo a 'entregado'
        const resCocina = await c.query(
          `UPDATE detalle_pedidos
           SET estado_cocina = 'pendiente', ronda = $2, impreso = FALSE
           WHERE id_pedido = $1 AND estado_cocina = 'borrador' AND COALESCE(estacion, '') <> 'extra'
           RETURNING id`,
          [id, nextRonda]
        );

        const resExtras = await c.query(
          `UPDATE detalle_pedidos
           SET estado_cocina = 'entregado', ronda = $2, impreso = TRUE
           WHERE id_pedido = $1 AND estado_cocina = 'borrador' AND COALESCE(estacion, '') = 'extra'
           RETURNING id`,
          [id, nextRonda]
        );

        const allUpdatedIds = [...resCocina.rows, ...resExtras.rows];
        if (!allUpdatedIds.length) {
          return { rows: [], rondaNueva: nextRonda, newlySentRows: [], pInfo: {} };
        }

        await c.query("SET LOCAL app.bypass_triggers = 'true'");
        await c.query(
          `WITH dups AS (
             SELECT id_pedido, id_producto, COALESCE(variante, '') AS me_var, COALESCE(destino_servicio, 'local') AS me_dest, COALESCE(notas, '') AS me_notas, precio_unitario, estado_cocina, ronda,
                    (ARRAY_AGG(id ORDER BY created_at))[1] AS primary_id,
                    ARRAY_AGG(id ORDER BY created_at) AS all_ids,
                    SUM(cantidad) AS total_qty
             FROM detalle_pedidos
             WHERE id_pedido = $1 AND ronda = $2
             GROUP BY id_pedido, id_producto, COALESCE(variante, ''), COALESCE(destino_servicio, 'local'), COALESCE(notas, ''), precio_unitario, estado_cocina, ronda
             HAVING COUNT(*) > 1
           ),
           upd AS (
             UPDATE detalle_pedidos d
             SET cantidad = dups.total_qty
             FROM dups
             WHERE d.id = dups.primary_id
           )
           DELETE FROM detalle_pedidos d
           USING dups
           WHERE d.id = ANY(dups.all_ids) AND d.id <> dups.primary_id;`,
          [id, nextRonda]
        );

        await c.query(
          `UPDATE pedidos SET total = (
             SELECT COALESCE(SUM(precio_unitario * cantidad), 0)
             FROM detalle_pedidos
             WHERE id_pedido = $1 AND estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
           ), ronda_actual = $2 WHERE id = $1`,
          [id, nextRonda]
        );

        await c.query(
          `INSERT INTO public.estaciones_pedido (id_pedido, estacion, lista)
           SELECT DISTINCT id_pedido, estacion, FALSE
           FROM public.detalle_pedidos
           WHERE id_pedido = $1
             AND estacion IN ('pupusa', 'panes', 'bebida')
             AND estado_cocina IN ('pendiente', 'preparacion')
           ON CONFLICT (id_pedido, estacion)
           DO UPDATE SET lista = FALSE, ts_lista = NULL`,
          [id]
        );

        // Obtener solo los items de cocina para impresión térmica (los extras no se imprimen en cocina)
        const itemsRes = await c.query(
          `SELECT d.id, d.cantidad, d.variante, d.notas, d.destino_servicio, d.estacion, d.ronda,
                  pr.nombre AS producto_nombre, pr.categoria,
                  p.nombre_control, p.tipo_pedido, m.numero AS mesa_numero
           FROM detalle_pedidos d
           JOIN productos pr ON pr.id = d.id_producto
           JOIN pedidos p ON p.id = d.id_pedido
           LEFT JOIN mesas m ON m.id = p.id_mesa
           WHERE d.id_pedido = $1 AND d.ronda = $2 AND d.estado_cocina = 'pendiente'
           ORDER BY d.estacion, d.created_at`,
          [id, nextRonda]
        );

        const orderInfoRes = await c.query(
          `SELECT p.id, p.tipo_pedido, p.nombre_control, m.numero AS mesa_numero
           FROM pedidos p
           LEFT JOIN mesas m ON m.id = p.id_mesa
           WHERE p.id = $1`,
          [id]
        );

        return {
          rows: allUpdatedIds,
          rondaNueva: nextRonda,
          newlySentRows: itemsRes.rows,
          pInfo: orderInfoRes.rows[0] || {},
        };
      });

      if (!rows.length) {
        return NextResponse.json({ error: "No hay productos nuevos para confirmar o enviar a cocina" }, { status: 409 });
      }

      return NextResponse.json({
        enviados: rows.length,
        ronda: rondaNueva,
        items: newlySentRows,
        pedido: {
          id,
          mesa_numero: pInfo?.mesa_numero,
          nombre_control: pInfo?.nombre_control,
          tipo_pedido: pInfo?.tipo_pedido,
        },
      });
    }
    if (body.accion === "cobrar") {
      if (!["efectivo", "tarjeta", "mixto"].includes(body.metodo_pago)) {
        return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 });
      }
      const { rows } = await withUser(user, async (c) => {
        // Validar que exista una caja abierta hoy
        const cajaCheck = await c.query(
          `SELECT id FROM public.caja WHERE fecha = CURRENT_DATE AND cierre IS NULL ORDER BY created_at DESC LIMIT 1`
        );
        if (!cajaCheck.rows[0]) {
          throw Object.assign(
            new Error("No se puede realizar el cobro: La caja del día no ha sido abierta o ya fue cerrada. Debe abrir la caja primero desde el módulo de Caja."),
            { code: "P0001" }
          );
        }

        await c.query(
          `UPDATE pedidos SET total = (
             SELECT COALESCE(SUM(precio_unitario * cantidad), 0)
             FROM detalle_pedidos
             WHERE id_pedido = $1 AND estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
           ) WHERE id = $1 AND estado_pago = 'pendiente'`,
          [id]
        );

        const orderRes = await c.query("SELECT total FROM pedidos WHERE id = $1 AND estado_pago = 'pendiente'", [id]);
        if (!orderRes.rows[0]) {
          throw Object.assign(new Error("Pedido no disponible para cobro"), { code: "P0001" });
        }
        const total = Number(orderRes.rows[0].total);
        let ef = 0;
        let tj = 0;
        let montoRecibido = Number(body.monto_recibido) || 0;
        let vuelto = Number(body.vuelto) || 0;

        if (body.metodo_pago === "efectivo") {
          ef = total;
          if (montoRecibido <= 0) montoRecibido = total;
          if (vuelto <= 0 && montoRecibido > total) vuelto = montoRecibido - total;
        } else if (body.metodo_pago === "tarjeta") {
          tj = total;
          montoRecibido = total;
          vuelto = 0;
        } else if (body.metodo_pago === "mixto") {
          ef = Number(body.pago_efectivo) || 0;
          tj = Number(body.pago_tarjeta) || 0;
          if (ef + tj < total) {
            throw Object.assign(new Error("Los montos ingresados no cubren el total de la cuenta"), { code: "P0001" });
          }
          if (montoRecibido <= 0) montoRecibido = ef + tj;
          // vuelto = lo que sobra del dinero recibido (efectivo + tarjeta) menos el total
          if (vuelto <= 0 && (ef + tj) > total) vuelto = (ef + tj) - total;
          // NOTA: NO se ajusta ef aquí. pago_efectivo = efectivo físico recibido (ej: $5),
          // aunque el total de efectivo que "corresponde" sea menor (ej: $4).
          // El vuelto ya refleja correctamente el cambio que se da al cliente.
        }


        return c.query(
          `UPDATE pedidos 
           SET estado_pago = 'pagada', fecha_pago = NOW(), metodo_pago = $2, pago_efectivo = $3, pago_tarjeta = $4, monto_recibido = $5, vuelto = $6
           WHERE id = $1 AND estado_pago = 'pendiente' RETURNING *`,
          [id, body.metodo_pago, ef, tj, montoRecibido, vuelto]
        );
      });
      return NextResponse.json({ pedido: rows[0] });
    }
    if (body.accion === "cambiar_metodo_pago") {
      return NextResponse.json({ error: "El método de pago no se puede modificar una vez cobrado el pedido." }, { status: 400 });
    }
    if (body.accion === "cancelar") {
      const { rows } = await withUser(user, async (c) => {
        const canForceCancel = ["superadmin", "admin", "gerente"].includes(user.rol);
        const chk = await c.query(
          `SELECT COUNT(*)::int AS n
           FROM detalle_pedidos
           WHERE id_pedido = $1 AND estado_cocina IN ('pendiente', 'preparacion', 'entregado')`,
          [id]
        );
        if (chk.rows[0].n > 0 && !canForceCancel) {
          throw Object.assign(
            new Error("No se puede cancelar: el pedido ya tiene productos enviados a cocina o entregados. Requiere autorización de Administrador o Gerente."),
            { code: "P0001" }
          );
        }
        if (canForceCancel) {
          // Como admin/superadmin/gerente, anular todos los ítems activos del pedido
          await c.query(
            `UPDATE detalle_pedidos
             SET estado_cocina = 'cancelado'
             WHERE id_pedido = $1 AND estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')`,
            [id]
          );
        }

        return c.query(
          `UPDATE pedidos SET estado_pago = 'cancelada' WHERE id = $1 AND estado_pago = 'pendiente' RETURNING *`,
          [id]
        );
      });
      return NextResponse.json({ pedido: rows[0] });
    }
    if (body.notas !== undefined) {
      const { rows } = await withUser(user, (c) =>
        c.query(
          `UPDATE pedidos SET notas = $2 WHERE id = $1 RETURNING *`,
          [id, body.notas || null]
        )
      );
      if (!rows[0]) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      return NextResponse.json({ pedido: rows[0] });
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}

export async function POST(request, context) {
  return PATCH(request, context);
}
