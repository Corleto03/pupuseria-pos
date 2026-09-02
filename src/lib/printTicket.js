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

  const entregadosYCancelados = (pedido.detalles || []).filter((d) => d.estado_cocina === "entregado" || d.estado_cocina === "cancelado");
  const detallesAImprimir = entregadosYCancelados.length > 0 ? entregadosYCancelados : (pedido.detalles || []);
  const items = detallesAImprimir.map((d) => {
    if (d.estado_cocina === "cancelado") {
      return `<tr style="color: #888; text-decoration: line-through;"><td>${d.cantidad}× ${esc(d.producto_nombre)} [NE]</td><td style="text-align:right">$0.00</td></tr>`;
    }
    return `<tr><td>${d.cantidad}× ${esc(d.producto_nombre)}${d.variante ? ` · ${esc(d.variante)}` : ""}</td><td style="text-align:right">$${(Number(d.precio_unitario) * d.cantidad).toFixed(2)}</td></tr>`;
  }).join("");
  
  const logoHtml = logoUrl ? `<div style="text-align:center;margin-bottom:8px;"><img src="${logoUrl}" style="max-height:60px;max-width:100%;object-fit:contain;" /></div>` : "";
  
  const pagoTexto = pedido.metodo_pago === "mixto" 
    ? `Mixto (Efectivo: $${Number(pedido.pago_efectivo || 0).toFixed(2)} / Tarjeta: $${Number(pedido.pago_tarjeta || 0).toFixed(2)})` 
    : (pedido.metodo_pago === "efectivo" ? "Efectivo" : (pedido.metodo_pago === "tarjeta" ? "Tarjeta" : "-"));

  win.document.write(`<!doctype html><html><head><title>Ticket</title><style>body{font-family:Arial;width:72mm;margin:0;padding:8mm;font-size:12px}h2,p{margin:0 0 6px}table{width:100%;border-collapse:collapse}td{padding:4px 0;border-bottom:1px dashed #bbb}small{color:#555}.total{font-size:16px;font-weight:bold}</style></head><body>${logoHtml}<h2 style="text-align:center;font-size:16px;">${esc(restName)}</h2><p>${pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"}<br>${esc(pedido.nombre_control)}</p><table>${items}</table><p class="total">Total: $${Number(pedido.total).toFixed(2)}</p><p>Pago: ${esc(pagoTexto)}<br>${new Date(pedido.fecha_pago || pedido.fecha).toLocaleString("es-SV")}</p></body></html>`);
  win.document.close(); win.focus(); win.print();
}
