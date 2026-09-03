import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

function rango(periodo, fechaParam) {
  if (fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
    const start = new Date(`${fechaParam}T00:00:00-06:00`);
    const end = new Date(`${fechaParam}T23:59:59.999-06:00`);
    return { start, end };
  }
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (periodo === "semana") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (periodo === "mes") {
    start.setDate(1);
  }
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function GET(request) {
  const { user, error } = await requireUser(["superadmin", "admin", "gerente"]);
  if (error) return error;
  const searchParams = new URL(request.url).searchParams;
  const periodo = searchParams.get("periodo") || "dia";
  const fecha = searchParams.get("fecha") || "";
  const { start, end } = rango(periodo, fecha);

  const [resRows, resAjustes] = await Promise.all([
    withUser(user, (c) =>
      c.query(
        `SELECT p.id AS pedido_id, COALESCE(p.fecha_pago, p.fecha) AS fecha, 
                p.nombre_control, p.tipo_pedido, p.metodo_pago,
                COALESCE(p.pago_efectivo, 0)::float AS pago_efectivo,
                COALESCE(p.pago_tarjeta, 0)::float AS pago_tarjeta,
                COALESCE(p.total, 0)::float AS total_pedido,
                m.numero AS mesa_numero, u.nombre AS mesero_nombre,
                pr.nombre AS producto, pr.categoria AS producto_categoria,
                d.variante, d.cantidad, d.precio_unitario::float AS precio_unitario, d.notas,
                COALESCE(d.destino_servicio, 'local') AS destino_servicio,
                COALESCE(d.estado_cocina, 'borrador') AS estado_cocina,
                CASE 
                  WHEN d.estado_cocina IN ('no_entregado', 'anulado', 'cancelado') THEN 0
                  ELSE (d.cantidad * d.precio_unitario)::float
                END AS subtotal,
                (d.cantidad * d.precio_unitario)::float AS monto_original
         FROM detalle_pedidos d
         JOIN pedidos p ON p.id = d.id_pedido
         JOIN productos pr ON pr.id = d.id_producto
         LEFT JOIN mesas m ON m.id = p.id_mesa
         LEFT JOIN usuarios u ON u.id = p.id_usuario
         WHERE p.estado_pago = 'pagada' AND COALESCE(p.fecha_pago, p.fecha) BETWEEN $1 AND $2
         ORDER BY COALESCE(p.fecha_pago, p.fecha) ASC, p.id, d.created_at`,
        [start.toISOString(), end.toISOString()]
      )
    ),
    withUser(user, (c) => c.query("SELECT clave, valor FROM public.ajustes").catch(() => ({ rows: [] }))),
  ]);

  const rows = resRows.rows;
  const configMap = {};
  (resAjustes.rows || []).forEach((r) => {
    configMap[r.clave] = r.valor;
  });
  const nombreRestaurante = configMap.nombre_restaurante || "OceanSis";

  // Group rows by order ID
  const ordersMap = new Map();
  for (const r of rows) {
    if (!ordersMap.has(r.pedido_id)) {
      ordersMap.set(r.pedido_id, {
        pedido_id: r.pedido_id,
        fecha: r.fecha,
        nombre_control: r.nombre_control,
        tipo_pedido: r.tipo_pedido,
        metodo_pago: r.metodo_pago,
        pago_efectivo: Number(r.pago_efectivo || 0),
        pago_tarjeta: Number(r.pago_tarjeta || 0),
        total_pedido: Number(r.total_pedido || 0),
        mesa_numero: r.mesa_numero,
        mesero_nombre: r.mesero_nombre,
        items: []
      });
    }
    ordersMap.get(r.pedido_id).items.push(r);
  }

  const orders = Array.from(ordersMap.values());

  // Recalculate each order total strictly from delivered items (excluding undelivered/anulados)
  for (const o of orders) {
    const deliveredSum = o.items.reduce((acc, item) => {
      const isUndelivered = ["no_entregado", "anulado", "cancelado"].includes(item.estado_cocina);
      if (isUndelivered) return acc;
      return acc + (Number(item.precio_unitario) * Number(item.cantidad));
    }, 0);

    if (o.items.length > 0) {
      o.total_pedido = Number(deliveredSum.toFixed(2));
    }

    // Ensure payments match order total exactly
    if (o.metodo_pago === "tarjeta") {
      o.pago_tarjeta = o.total_pedido;
      o.pago_efectivo = 0;
    } else if (o.metodo_pago === "efectivo") {
      o.pago_efectivo = o.total_pedido;
      o.pago_tarjeta = 0;
    } else {
      // mixto
      const tar = Math.min(o.total_pedido, Number(o.pago_tarjeta || 0));
      o.pago_tarjeta = Number(tar.toFixed(2));
      o.pago_efectivo = Number(Math.max(0, o.total_pedido - o.pago_tarjeta).toFixed(2));
    }
  }

  // Aggregate stats per day (column by column)
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const dailyStats = new Map();

  for (const o of orders) {
    const dayKey = dayFormatter.format(new Date(o.fecha));
    if (!dailyStats.has(dayKey)) {
      dailyStats.set(dayKey, {
        dayKey,
        totalFacturado: 0,
        efectivo: 0,
        tarjeta: 0,
        ordenes: 0,
        pupusasQty: 0,
        bebidasQty: 0,
        extrasQty: 0,
        llevarQty: 0,
        anuladoMonto: 0,
      });
    }

    const st = dailyStats.get(dayKey);
    st.totalFacturado += o.total_pedido;
    st.efectivo += o.pago_efectivo;
    st.tarjeta += o.pago_tarjeta;
    st.ordenes += 1;

    for (const item of o.items) {
      const isUndelivered = ["no_entregado", "anulado", "cancelado"].includes(item.estado_cocina);
      if (isUndelivered) {
        st.anuladoMonto += item.monto_original;
      } else {
        if (item.producto_categoria === "pupusa") st.pupusasQty += item.cantidad;
        else if (item.producto_categoria === "bebida") st.bebidasQty += item.cantidad;
        else st.extrasQty += item.cantidad;

        if (item.destino_servicio === "llevar") {
          st.llevarQty += item.cantidad;
        }
      }
    }
  }

  const sortedDays = Array.from(dailyStats.keys()).sort();

  // Grand totals
  const grandTotal = orders.reduce((sum, o) => sum + o.total_pedido, 0);
  const grandEfectivo = orders.reduce((sum, o) => sum + o.pago_efectivo, 0);
  const grandTarjeta = orders.reduce((sum, o) => sum + o.pago_tarjeta, 0);
  const totalOrders = orders.length;
  const grandPupusas = Array.from(dailyStats.values()).reduce((sum, s) => sum + s.pupusasQty, 0);
  const grandBebidas = Array.from(dailyStats.values()).reduce((sum, s) => sum + s.bebidasQty, 0);
  const grandExtras = Array.from(dailyStats.values()).reduce((sum, s) => sum + s.extrasQty, 0);
  const grandLlevar = Array.from(dailyStats.values()).reduce((sum, s) => sum + s.llevarQty, 0);
  const grandAnulado = Array.from(dailyStats.values()).reduce((sum, s) => sum + s.anuladoMonto, 0);

  const titlePeriod = fecha
    ? `Día: ${fecha}`
    : (periodo === "dia" ? "Hoy" : periodo === "semana" ? "Esta Semana" : "Este Mes");
  const filename = fecha ? `reporte_ventas_${fecha}.xls` : `reporte_ventas_${periodo}.xls`;

  // Helper to format short date for column headers
  const formatDayHeader = (dateStr) => {
    try {
      const [y, m, d] = dateStr.split("-");
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  // Generate HTML formatted Excel file
  let html = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta http-equiv="Content-type" content="text/html;charset=utf-8" />
    <style>
      table { border-collapse: collapse; margin-top: 10px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
      th { font-size: 11px; background-color: #1c1b18; color: #ffffff; font-weight: bold; text-align: left; padding: 6px; border: 1px solid #d1d5db; }
      td { font-size: 11px; padding: 6px; border: 1px solid #e5e7eb; }
      .title-cell { font-size: 17px; font-weight: bold; color: #C2410C; text-align: left; }
      .meta-cell { font-size: 10px; color: #6b7280; }
      .matrix-header { background-color: #1f2937; color: #ffffff; font-weight: bold; text-align: center; font-size: 11px; border: 1px solid #374151; padding: 6px; }
      .matrix-metric { font-weight: bold; background-color: #f9fafb; font-size: 11px; border: 1px solid #d1d5db; white-space: nowrap; }
      .matrix-val { font-size: 11px; text-align: right; border: 1px solid #e5e7eb; }
      .matrix-total-header { background-color: #C2410C; color: #ffffff; font-weight: bold; text-align: center; font-size: 11px; border: 1px solid #9a3412; }
      .matrix-total-val { background-color: #fed7aa; color: #7c2d12; font-weight: bold; text-align: right; font-size: 11px; border: 1px solid #f97316; }
      .order-row { background-color: #f3f4f6; font-weight: bold; border-top: 2px solid #9ca3af; border-bottom: 1px solid #d1d5db; }
      .order-total-cell { text-align: right; color: #C2410C; font-weight: bold; }
      .currency { mso-number-format: "\\$\\#,##0.00"; text-align: right; }
      .number { mso-number-format: "\\#,\\#\#0"; text-align: center; }
      .date-cell { text-align: left; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .badge-llevar { color: #b45309; font-weight: bold; }
      .badge-anulado { color: #dc2626; font-style: italic; font-weight: bold; text-decoration: line-through; }
    </style>
  </head>
  <body>
    <!-- Encabezado general -->
    <table>
      <tr>
        <td colspan="${Math.max(6, sortedDays.length + 2)}" class="title-cell">REPORTE CONSOLIDADO DE VENTAS — ${escapeHtml(nombreRestaurante.toUpperCase())}</td>
      </tr>
      <tr>
        <td colspan="${Math.max(6, sortedDays.length + 2)}" class="meta-cell">Periodo: <b>${escapeHtml(titlePeriod)}</b> | Generado: ${new Date().toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}</td>
      </tr>
      <tr><td colspan="${Math.max(6, sortedDays.length + 2)}" style="border:none; height: 8px;"></td></tr>
    </table>

    <!-- 1. RESUMEN HORIZONTAL COLUMNA POR COLUMNA POR DÍA Y TOTAL -->
    <h3 style="font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #1c1b18; margin-bottom: 4px;">
      1. RESUMEN EJECUTIVO (CONSOLIDADO ${sortedDays.length > 1 ? "POR DÍA" : "DEL PERIODO"})
    </h3>
    <table>
      <thead>
        <tr>
          <th style="width: 220px; background-color: #111827; color: #fff;">Indicador / Métrica</th>
          ${sortedDays.map((d) => `<th class="matrix-header" style="min-width: 100px;">${formatDayHeader(d)}</th>`).join("")}
          <th class="matrix-total-header" style="min-width: 120px;">TOTAL GENERAL</th>
        </tr>
      </thead>
      <tbody>
        <!-- Fila: Total Facturado -->
        <tr style="background-color: #fff7ed;">
          <td class="matrix-metric" style="color: #9a3412; font-size: 11px;"><b>TOTAL FACTURADO ($)</b></td>
          ${sortedDays.map((d) => `<td class="currency matrix-val" style="font-weight: bold; color: #9a3412;">${dailyStats.get(d).totalFacturado.toFixed(2)}</td>`).join("")}
          <td class="currency matrix-total-val" style="font-size: 12px;"><b>${grandTotal.toFixed(2)}</b></td>
        </tr>

        <!-- Fila: Ventas Efectivo -->
        <tr>
          <td class="matrix-metric">Ventas en Efectivo ($)</td>
          ${sortedDays.map((d) => `<td class="currency matrix-val">${dailyStats.get(d).efectivo.toFixed(2)}</td>`).join("")}
          <td class="currency matrix-total-val">${grandEfectivo.toFixed(2)}</td>
        </tr>

        <!-- Fila: Ventas Tarjeta -->
        <tr>
          <td class="matrix-metric">Ventas en Tarjeta ($)</td>
          ${sortedDays.map((d) => `<td class="currency matrix-val">${dailyStats.get(d).tarjeta.toFixed(2)}</td>`).join("")}
          <td class="currency matrix-total-val">${grandTarjeta.toFixed(2)}</td>
        </tr>

        <!-- Fila: Órdenes Cobradas -->
        <tr>
          <td class="matrix-metric">Órdenes Cobradas (Cant.)</td>
          ${sortedDays.map((d) => `<td class="number matrix-val">${dailyStats.get(d).ordenes}</td>`).join("")}
          <td class="number matrix-total-val">${totalOrders}</td>
        </tr>

        <!-- Fila: Ticket Promedio -->
        <tr>
          <td class="matrix-metric">Ticket Promedio ($)</td>
          ${sortedDays.map((d) => {
            const st = dailyStats.get(d);
            const prom = st.ordenes ? (st.totalFacturado / st.ordenes).toFixed(2) : "0.00";
            return `<td class="currency matrix-val">${prom}</td>`;
          }).join("")}
          <td class="currency matrix-total-val">${totalOrders ? (grandTotal / totalOrders).toFixed(2) : "0.00"}</td>
        </tr>

        <!-- Fila: Pupusas Vendidas -->
        <tr>
          <td class="matrix-metric">Pupusas Vendidas (Uds.)</td>
          ${sortedDays.map((d) => `<td class="number matrix-val">${dailyStats.get(d).pupusasQty}</td>`).join("")}
          <td class="number matrix-total-val">${grandPupusas}</td>
        </tr>

        <!-- Fila: Bebidas Vendidas -->
        <tr>
          <td class="matrix-metric">Bebidas Vendidas (Uds.)</td>
          ${sortedDays.map((d) => `<td class="number matrix-val">${dailyStats.get(d).bebidasQty}</td>`).join("")}
          <td class="number matrix-total-val">${grandBebidas}</td>
        </tr>

        <!-- Fila: Otros / Extras -->
        <tr>
          <td class="matrix-metric">Otros / Extras Vendidos (Uds.)</td>
          ${sortedDays.map((d) => `<td class="number matrix-val">${dailyStats.get(d).extrasQty}</td>`).join("")}
          <td class="number matrix-total-val">${grandExtras}</td>
        </tr>

        <!-- Fila: Ítems Para Llevar -->
        <tr>
          <td class="matrix-metric">Ítems Para Llevar (Uds.)</td>
          ${sortedDays.map((d) => `<td class="number matrix-val">${dailyStats.get(d).llevarQty}</td>`).join("")}
          <td class="number matrix-total-val">${grandLlevar}</td>
        </tr>

        <!-- Fila: Descontado por Anulaciones -->
        <tr style="background-color: #fef2f2;">
          <td class="matrix-metric" style="color: #991b1b;">Monto Anulado / No Entregado ($)</td>
          ${sortedDays.map((d) => `<td class="currency matrix-val" style="color: #991b1b;">${dailyStats.get(d).anuladoMonto.toFixed(2)}</td>`).join("")}
          <td class="currency matrix-total-val" style="color: #991b1b; background-color: #fee2e2;">${grandAnulado.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <br/>

    <!-- 2. DETALLE INDIVIDUAL DE PEDIDOS -->
    <h3 style="font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #1c1b18; margin-bottom: 4px;">
      2. DETALLE DE COMANDAS Y CONSUMO
    </h3>
    <table>
      <thead>
        <tr>
          <th style="width: 120px;">Fecha / Hora</th>
          <th style="width: 140px;">Mesa / Destino</th>
          <th style="width: 160px;">Cliente / Control</th>
          <th style="width: 130px;">Mesero</th>
          <th style="width: 130px;">Método de Pago</th>
          <th style="width: 220px;">Platillo / Producto</th>
          <th style="width: 100px; text-align: center;">Variedad</th>
          <th style="width: 90px; text-align: center;">Servicio</th>
          <th style="width: 50px; text-align: center;">Cant.</th>
          <th style="width: 80px; text-align: right;">Precio Unit.</th>
          <th style="width: 100px; text-align: center;">Estado</th>
          <th style="width: 90px; text-align: right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const o of orders) {
    const mesaLabel = o.tipo_pedido === "local" ? `Mesa ${o.mesa_numero}` : "Para llevar";
    let metodoText = "Efectivo";
    if (o.metodo_pago === "tarjeta") metodoText = "Tarjeta";
    else if (o.metodo_pago === "mixto") {
      metodoText = `Mixto (Ef: $${o.pago_efectivo.toFixed(2)} / Tarj: $${o.pago_tarjeta.toFixed(2)})`;
    }

    const dateFormatted = new Intl.DateTimeFormat("es-SV", {
      timeZone: "America/El_Salvador",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(o.fecha));

    html += `
        <tr class="order-row">
          <td class="date-cell">${dateFormatted}</td>
          <td><b>${escapeHtml(mesaLabel)}</b></td>
          <td>${escapeHtml(o.nombre_control)}</td>
          <td>${escapeHtml(o.mesero_nombre || "N/A")}</td>
          <td>${escapeHtml(metodoText)}</td>
          <td colspan="6" style="text-align: right; font-weight: bold; background-color: #f3f4f6;">Total de la Orden:</td>
          <td class="currency order-total-cell" style="background-color: #f3f4f6; font-size: 12px;">${o.total_pedido.toFixed(2)}</td>
        </tr>
    `;

    for (const item of o.items) {
      const isUndelivered = ["no_entregado", "anulado", "cancelado"].includes(item.estado_cocina);
      const rowStyle = isUndelivered ? 'style="background-color: #fff1f2; color: #991b1b;"' : "";
      const textStyle = isUndelivered ? 'style="text-decoration: line-through; color: #991b1b;"' : "";
      const subtotalDisplay = isUndelivered ? "0.00" : item.subtotal.toFixed(2);
      const estadoLabel = isUndelivered ? '<span style="color: #dc2626; font-weight: bold;">NO ENTREGADO</span>' : "Entregado";
      const servicioLabel = item.destino_servicio === "llevar"
        ? '<span class="badge-llevar">[Llevar]</span>'
        : "Comer aquí";

      html += `
        <tr ${rowStyle}>
          <td style="color: #9ca3af; font-family: monospace; font-size: 10px;">${item.pedido_id.slice(0, 8)}</td>
          <td colspan="4" style="color: #6b7280; font-size: 10px;">${escapeHtml(item.notas ? `Nota: ${item.notas}` : "")}</td>
          <td ${textStyle}>${escapeHtml(item.producto)}</td>
          <td class="text-center">${escapeHtml(item.variante || "-")}</td>
          <td class="text-center">${servicioLabel}</td>
          <td class="number">${item.cantidad}</td>
          <td class="currency">${item.precio_unitario.toFixed(2)}</td>
          <td class="text-center">${estadoLabel}</td>
          <td class="currency" style="font-weight: 500;">${subtotalDisplay}</td>
        </tr>
      `;
    }
  }

  html += `
        <tr style="background-color: #1c1b18; color: #ffffff; font-weight: bold; font-size: 12px;">
          <td colspan="10" style="text-align: right; background-color: #1c1b18; color: #ffffff; padding: 8px;">
            TOTAL FACTURADO DEL PERIODO (${orders.length} ÓRDENES):
          </td>
          <td colspan="2" class="currency" style="background-color: #1c1b18; color: #fb923c; font-size: 13px; font-weight: bold; padding: 8px;">
            ${grandTotal.toFixed(2)}
          </td>
        </tr>
      </tbody>
    </table>
  </body>
  </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
