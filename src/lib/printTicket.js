export async function printTicket(pedidoId) {
  const [resPed, resConf] = await Promise.all([
    fetch(`/api/pedidos/${pedidoId}`),
    fetch("/api/ajustes").catch(() => null)
  ]);
  const { pedido } = await resPed.json();
  if (!pedido) return;

  const config = resConf ? await resConf.json().catch(() => ({})) : {};
  const restName = config.nombre_restaurante || "OceanSis";
  const logoUrl = config.logo_url || "";

  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  // Group items visually for ticket
  const map = new Map();
  for (const d of (pedido.detalles || [])) {
    const nombre = d.producto_nombre || "";
    const varName = d.variante || "";
    const estado = d.estado_cocina || "";
    const destino = d.destino_servicio || "";
    const precio = Number(d.precio_unitario || 0);
    const key = `${nombre}_${varName}_${estado}_${destino}_${precio}`;
    if (map.has(key)) {
      map.get(key).cantidad += d.cantidad;
    } else {
      map.set(key, { ...d, producto_nombre: nombre, precio_unitario: precio, cantidad: d.cantidad });
    }
  }
  const itemsList = Array.from(map.values());

  const itemsHtml = itemsList.map((d) => {
    const isNoEntregado = ["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina);
    const isLlevar = d.destino_servicio === "llevar";
    const subtotal = isNoEntregado ? "$0.00 (NO ENTREGADO)" : `$${(d.precio_unitario * d.cantidad).toFixed(2)}`;
    const textStyle = isNoEntregado ? "text-decoration:line-through;color:#888;" : "";
    const llevarTag = isLlevar ? " <b>[Para llevar]</b>" : "";
    return `<tr>
      <td style="${textStyle}">${d.cantidad}× ${esc(d.producto_nombre)}${d.variante ? ` · ${esc(d.variante)}` : ""}${llevarTag}${isNoEntregado ? " <small style='color:#c00;'>(No entregado)</small>" : ""}</td>
      <td style="text-align:right;${textStyle}">${subtotal}</td>
    </tr>`;
  }).join("");

  const logoHtml = logoUrl ? `<div style="text-align:center;margin-bottom:8px;"><img src="${logoUrl}" style="max-height:60px;max-width:100%;object-fit:contain;" /></div>` : "";

  const metodoLabel = pedido.metodo_pago === "mixto"
    ? "Mixto (Efectivo + Tarjeta)"
    : (pedido.metodo_pago === "efectivo" ? "Efectivo" : (pedido.metodo_pago === "tarjeta" ? "Tarjeta" : "-"));

  const totalVal = Number(pedido.total || 0);
  const recibidoVal = Number(pedido.monto_recibido || 0) > 0 
    ? Number(pedido.monto_recibido)
    : (pedido.metodo_pago === "efectivo" ? totalVal + Number(pedido.vuelto || 0) : totalVal);
  const vueltoVal = Number(pedido.vuelto || 0);

  win.document.write(`<!doctype html>
<html>
<head>
  <title>Ticket #${pedido.id.slice(0, 8)}</title>
  <style>
    body { font-family: Arial, sans-serif; width: 72mm; margin: 0; padding: 6mm; font-size: 12px; color: #111; }
    h2, p { margin: 0 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; margin-bottom: 8px; }
    td { padding: 4px 0; border-bottom: 1px dashed #ccc; }
    .totales { border-top: 2px solid #000; padding-top: 6px; margin-top: 6px; }
    .row-total { font-size: 15px; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 4px; }
    .row-detail { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
    .footer { font-size: 10px; color: #555; text-align: center; margin-top: 12px; border-top: 1px solid #ddd; padding-top: 6px; }
  </style>
</head>
<body>
  ${logoHtml}
  <h2 style="text-align:center;font-size:16px;">${esc(restName)}</h2>
  <p style="text-align:center;font-size:13px;font-weight:bold;">
    ${pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"} — ${esc(pedido.nombre_control)}
  </p>
  <table>${itemsHtml}</table>
  <div class="totales">
    <div class="row-total">
      <span>TOTAL:</span>
      <span>$${totalVal.toFixed(2)}</span>
    </div>
    <div class="row-detail">
      <span>Método de Pago:</span>
      <span><b>${esc(metodoLabel)}</b></span>
    </div>
    ${pedido.metodo_pago === "mixto" ? `
      <div class="row-detail" style="padding-left:8px;font-size:11px;color:#444;">
        <span>· Pago Efectivo:</span>
        <span>$${Number(pedido.pago_efectivo || 0).toFixed(2)}</span>
      </div>
      <div class="row-detail" style="padding-left:8px;font-size:11px;color:#444;">
        <span>· Pago Tarjeta:</span>
        <span>$${Number(pedido.pago_tarjeta || 0).toFixed(2)}</span>
      </div>
    ` : ""}
    ${pedido.metodo_pago === "efectivo" || (pedido.metodo_pago === "mixto" && recibidoVal > 0) ? `
      <div class="row-detail" style="margin-top:4px;">
        <span>Monto Recibido:</span>
        <span>$${recibidoVal.toFixed(2)}</span>
      </div>
      <div class="row-detail" style="font-weight:bold;">
        <span>VUELTO / CAMBIO:</span>
        <span>$${vueltoVal.toFixed(2)}</span>
      </div>
    ` : ""}
  </div>
  <div class="footer">
    <p>Fecha: ${new Date(pedido.fecha_pago || pedido.fecha).toLocaleString("es-SV")}</p>
    <p>¡Gracias por su compra!</p>
  </div>
</body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
}
