import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { pgError, withUser } from "@/lib/db";

export async function GET(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "cajero", "mesero"]);
  if (error) return error;

  try {
    const data = await withUser(user, async (c) => {
      // Find open shift
      const { rows } = await c.query(
        `SELECT c.*, u.nombre as usuario_apertura_nombre
         FROM cajas_turnos c
         JOIN usuarios u ON u.id = c.id_usuario_apertura
         WHERE c.estado = 'abierta'
         ORDER BY c.fecha_apertura DESC
         LIMIT 1`
      );

      if (!rows[0]) return { turno: null };

      const turno = rows[0];

      // Calculate totals for sales completed during this shift
      const salesRes = await c.query(
        `SELECT 
           COALESCE(SUM(pago_efectivo), 0) as total_efectivo,
           COALESCE(SUM(pago_tarjeta), 0) as total_tarjeta,
           COUNT(id) as total_pedidos
         FROM pedidos
         WHERE estado_pago = 'pagada'
           AND fecha_pago >= $1`,
        [turno.fecha_apertura]
      );

      const sales = salesRes.rows[0];
      const ventasEfectivo = parseFloat(sales.total_efectivo);
      const ventasTarjeta = parseFloat(sales.total_tarjeta);
      const montoInicial = parseFloat(turno.monto_inicial);
      const efectivoEsperado = montoInicial + ventasEfectivo;

      return {
        turno: {
          ...turno,
          total_ventas_efectivo: ventasEfectivo,
          total_ventas_tarjeta: ventasTarjeta,
          total_pedidos: parseInt(sales.total_pedidos, 10),
          efectivo_esperado: efectivoEsperado,
        },
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 500 });
  }
}

export async function POST(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "cajero"]);
  if (error) return error;

  const { monto_inicial, notas } = await request.json();
  const initialCash = parseFloat(monto_inicial);

  if (isNaN(initialCash) || initialCash < 0) {
    return NextResponse.json({ error: "El monto inicial de caja debe ser un número mayor o igual a 0" }, { status: 400 });
  }

  try {
    const turno = await withUser(user, async (c) => {
      // Check if there is already an open shift
      const openCheck = await c.query(`SELECT id FROM cajas_turnos WHERE estado = 'abierta' LIMIT 1`);
      if (openCheck.rows[0]) {
        throw Object.assign(new Error("Ya existe un turno de caja abierto"), { code: "P0001" });
      }

      const { rows } = await c.query(
        `INSERT INTO cajas_turnos (id_usuario_apertura, monto_inicial, notas, estado)
         VALUES ($1, $2, $3, 'abierta')
         RETURNING *`,
        [user.id, initialCash, notas || null]
      );
      return rows[0];
    });

    return NextResponse.json({ turno }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}

export async function PUT(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente", "cajero"]);
  if (error) return error;

  const { efectivo_real, notas } = await request.json();
  const realCash = parseFloat(efectivo_real);

  if (isNaN(realCash) || realCash < 0) {
    return NextResponse.json({ error: "Debe ingresar una cantidad válida de efectivo en caja" }, { status: 400 });
  }

  try {
    const turno = await withUser(user, async (c) => {
      const openCheck = await c.query(
        `SELECT * FROM cajas_turnos WHERE estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1`
      );
      if (!openCheck.rows[0]) {
        throw Object.assign(new Error("No hay ningún turno de caja abierto para cerrar"), { code: "P0001" });
      }

      const activeTurno = openCheck.rows[0];

      // Calculate totals for sales during shift
      const salesRes = await c.query(
        `SELECT 
           COALESCE(SUM(pago_efectivo), 0) as total_efectivo,
           COALESCE(SUM(pago_tarjeta), 0) as total_tarjeta
         FROM pedidos
         WHERE estado_pago = 'pagada'
           AND fecha_pago >= $1`,
        [activeTurno.fecha_apertura]
      );

      const sales = salesRes.rows[0];
      const ventasEfectivo = parseFloat(sales.total_efectivo);
      const ventasTarjeta = parseFloat(sales.total_tarjeta);
      const montoInicial = parseFloat(activeTurno.monto_inicial);
      const efectivoEsperado = montoInicial + ventasEfectivo;
      const diferencia = realCash - efectivoEsperado;

      const { rows } = await c.query(
        `UPDATE cajas_turnos
         SET id_usuario_cierre = $1,
             fecha_cierre = NOW(),
             total_ventas_efectivo = $2,
             total_ventas_tarjeta = $3,
             efectivo_esperado = $4,
             efectivo_real = $5,
             diferencia = $6,
             estado = 'cerrada',
             notas = COALESCE($7, notas)
         WHERE id = $8
         RETURNING *`,
        [user.id, ventasEfectivo, ventasTarjeta, efectivoEsperado, realCash, diferencia, notas || null, activeTurno.id]
      );

      return rows[0];
    });

    return NextResponse.json({ turno });
  } catch (err) {
    return NextResponse.json({ error: pgError(err) }, { status: 409 });
  }
}
