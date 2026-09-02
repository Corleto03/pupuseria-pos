import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";

export async function GET() {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "cajero"]);
  if (error) return error;

  try {
    const data = await withUser(user, async (c) => {
      // Buscar la caja del día de hoy (abierta o más reciente)
      const cajaRes = await c.query(
        `SELECT * FROM public.caja WHERE fecha = CURRENT_DATE ORDER BY created_at DESC LIMIT 1`
      );
      
      const cajaActual = cajaRes.rows[0] || null;

      // Calcular acumulados de ventas del día
      let ventas = { efectivo: 0, tarjeta: 0 };
      if (cajaActual) {
        const ventasRes = await c.query(
          `SELECT 
            COALESCE(SUM(pago_efectivo), 0) AS total_efectivo,
            COALESCE(SUM(pago_tarjeta), 0) AS total_tarjeta
           FROM public.pedidos
           WHERE estado_pago = 'pagada' AND DATE(fecha_pago) = CURRENT_DATE`
        );
        ventas.efectivo = Number(ventasRes.rows[0].total_efectivo);
        ventas.tarjeta = Number(ventasRes.rows[0].total_tarjeta);
      }

      return { caja: cajaActual, ventas };
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}

export async function POST(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "cajero"]);
  if (error) return error;

  const body = await request.json();

  try {
    const data = await withUser(user, async (c) => {
      if (body.accion === "abrir") {
        // Si la caja más reciente de hoy sigue abierta, retornar esa misma
        const cajaMasReciente = await c.query(
          `SELECT * FROM public.caja WHERE fecha = CURRENT_DATE ORDER BY created_at DESC LIMIT 1`
        );
        if (cajaMasReciente.rows[0] && cajaMasReciente.rows[0].cierre === null) {
          return { caja: cajaMasReciente.rows[0] };
        }

        const apertura = Number(body.apertura) || 0;
        const res = await c.query(
          `INSERT INTO public.caja (fecha, apertura)
           VALUES (CURRENT_DATE, $1)
           RETURNING *`,
          [apertura]
        );
        return { caja: res.rows[0] };
      }

      if (body.accion === "cerrar") {
        // Buscar caja abierta de hoy
        const cajaRes = await c.query(
          `SELECT * FROM public.caja WHERE fecha = CURRENT_DATE AND cierre IS NULL ORDER BY created_at DESC LIMIT 1`
        );

        if (!cajaRes.rows[0]) {
          throw Object.assign(new Error("No hay una caja abierta para cerrar hoy"), { code: "P0001" });
        }

        // Calcular totales finales de ventas
        const ventasRes = await c.query(
          `SELECT 
            COALESCE(SUM(pago_efectivo), 0) AS total_efectivo,
            COALESCE(SUM(pago_tarjeta), 0) AS total_tarjeta
           FROM public.pedidos
           WHERE estado_pago = 'pagada' AND DATE(fecha_pago) = CURRENT_DATE`
        );
        const ef = Number(ventasRes.rows[0].total_efectivo);
        const tj = Number(ventasRes.rows[0].total_tarjeta);

        const apertura = Number(cajaRes.rows[0].apertura);
        const totalCierre = apertura + ef;

        const res = await c.query(
          `UPDATE public.caja
           SET cierre = $1, efectivo = $2, tarjeta = $3
           WHERE id = $4
           RETURNING *`,
          [totalCierre, ef, tj, cajaRes.rows[0].id]
        );
        return { caja: res.rows[0] };
      }

      throw Object.assign(new Error("Acción de caja no válida"), { code: "P0001" });
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
