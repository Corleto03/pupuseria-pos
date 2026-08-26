import { requireUser } from "@/lib/api";
import { withUser } from "@/lib/db";

function rango(periodo) {
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

export async function GET(request) {
  const { user, error } = await requireUser(["gerente"]);
  if (error) return error;
  const periodo = new URL(request.url).searchParams.get("periodo") || "dia";
  const { start, end } = rango(periodo);

  const { rows } = await withUser(user, (c) =>
    c.query(
      `SELECT p.id AS pedido_id, p.fecha, p.nombre_control, p.tipo_pedido, p.total AS total_pedido,
              m.numero AS mesa_numero, u.nombre AS mesero_nombre,
              pr.nombre AS producto, d.variante, d.cantidad, d.precio_unitario, d.notas,
              (d.cantidad * d.precio_unitario)::float AS subtotal
       FROM detalle_pedidos d
       JOIN pedidos p ON p.id = d.id_pedido
       JOIN productos pr ON pr.id = d.id_producto
       LEFT JOIN mesas m ON m.id = p.id_mesa
       LEFT JOIN usuarios u ON u.id = p.id_usuario
       WHERE p.estado_pago = 'pagada' AND p.fecha BETWEEN $1 AND $2
       ORDER BY p.fecha DESC, p.id, d.created_at`,
      [start.toISOString(), end.toISOString()]
    )
  );

  // Group rows by order ID
  const ordersMap = new Map();
  for (const r of rows) {
    if (!ordersMap.has(r.pedido_id)) {
      ordersMap.set(r.pedido_id, {
        fecha: r.fecha,
        nombre_control: r.nombre_control,
        tipo_pedido: r.tipo_pedido,
        total_pedido: Number(r.total_pedido),
        mesa_numero: r.mesa_numero,
        mesero_nombre: r.mesero_nombre,
        items: []
      });
    }
    ordersMap.get(r.pedido_id).items.push(r);
  }

  const orders = Array.from(ordersMap.values());
  const grandTotal = orders.reduce((sum, o) => sum + o.total_pedido, 0);
  const totalOrders = orders.length;

  const titlePeriod = periodo === "dia" ? "Hoy" : periodo === "semana" ? "Esta Semana" : "Este Mes";

  // Generate HTML formatted Excel file
  let html = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta http-equiv="Content-type" content="text/html;charset=utf-8" />
    <style>
      table { border-collapse: collapse; margin-top: 10px; }
      th { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; background-color: #1c1b18; color: #ffffff; font-weight: bold; text-align: left; padding: 6px; border: 1px solid #d1d5db; }
      td { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; padding: 6px; border: 1px solid #e5e7eb; }
      .title-cell { font-family: 'Segoe UI', sans-serif; font-size: 18px; font-weight: bold; color: #C2410C; text-align: left; }
      .meta-cell { font-family: 'Segoe UI', sans-serif; font-size: 10px; color: #6b7280; }
      .summary-label { font-weight: bold; background-color: #f9fafb; border: 1px solid #d1d5db; font-size: 11px; }
      .summary-val { font-weight: bold; text-align: right; background-color: #f9fafb; border: 1px solid #d1d5db; font-size: 11px; }
      .order-row { background-color: #f3f4f6; font-weight: bold; border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }
      .order-total-cell { text-align: right; color: #C2410C; font-weight: bold; }
      .currency { mso-number-format: "\\$\\#,##0.00"; text-align: right; }
      .number { mso-number-format: "\\#,\\#\#0"; text-align: center; }
      .date-cell { text-align: left; }
      .grand-total-row { background-color: #e5e7eb; font-weight: bold; font-size: 12px; }
      .text-center { text-align: center; }
    </style>
  </head>
  <body>
    <table>
      <tr>
        <td colspan="6" class="title-cell">REPORTE DE VENTAS DETALLADO - LA PUPUSA</td>
      </tr>
      <tr>
        <td colspan="6" class="meta-cell">Periodo: <b>${titlePeriod} (${periodo})</b> | Generado: ${new Date().toLocaleString()}</td>
      </tr>
      <tr><td colspan="6" style="border:none;"></td></tr>
      
      <!-- General Summary Cards -->
      <tr>
        <td colspan="2" class="summary-label">Monto Total Facturado:</td>
        <td class="summary-val currency">${grandTotal}</td>
        <td colspan="2" class="summary-label">Total Órdenes Cobradas:</td>
        <td class="summary-val number">${totalOrders}</td>
      </tr>
      <tr><td colspan="6" style="border:none; height: 10px;"></td></tr>
    </table>

    <table>
      <thead>
        <tr>
          <th style="width: 140px;">Fecha / Ref.</th>
          <th style="width: 220px;">Detalle del Producto</th>
          <th style="width: 100px; text-align: center;">Masa / Variedad</th>
          <th style="width: 60px; text-align: center;">Cant.</th>
          <th style="width: 90px; text-align: right;">Precio Unit.</th>
          <th style="width: 90px; text-align: right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const o of orders) {
    const mesaText = o.tipo_pedido === "local" ? `Mesa ${o.mesa_numero}` : "Para llevar";
    const refText = `${mesaText} [Ref: ${o.nombre_control}]`;
    const dateFormatted = new Intl.DateTimeFormat("es-SV", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(o.fecha));

    html += `
        <tr class="order-row">
          <td class="date-cell">${dateFormatted}</td>
          <td colspan="3">${refText} &nbsp;&nbsp;|&nbsp;&nbsp; <span style="font-weight: normal; color: #555555;">Atendido por: ${o.mesero_nombre || "N/A"}</span></td>
          <td style="text-align: right; font-weight: bold; background-color: #f3f4f6;">Total Orden:</td>
          <td class="currency order-total-cell" style="background-color: #f3f4f6;">${o.total_pedido}</td>
        </tr>
    `;

    for (const item of o.items) {
      html += `
        <tr>
          <td style="color: #9ca3af; font-family: monospace; font-size: 10px;">${item.pedido_id.slice(0, 8)}...</td>
          <td>
            ${item.producto}
            ${item.notas ? `<br/><span style="font-size: 9px; color: #dc2626; font-style: italic;">Nota: ${item.notas}</span>` : ""}
          </td>
          <td class="text-center">${item.variante || "-"}</td>
          <td class="number">${item.cantidad}</td>
          <td class="currency">${item.precio_unitario}</td>
          <td class="currency" style="font-weight: 500;">${item.subtotal}</td>
        </tr>
      `;
    }
  }

  html += `
        <tr class="grand-total-row">
          <td colspan="4" style="text-align: right; font-size: 11px; font-weight: bold; background-color: #e5e7eb; border-top: 2px solid #1c1b18;">TOTAL GENERAL FACTURADO:</td>
          <td colspan="2" class="currency" style="font-size: 11px; font-weight: bold; color: #C2410C; background-color: #e5e7eb; border-top: 2px solid #1c1b18;">${grandTotal}</td>
        </tr>
      </tbody>
    </table>
  </body>
  </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte_ventas_${periodo}.xls"`,
    },
  });
}
