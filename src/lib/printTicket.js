export async function printTicket(pedidoId) {
  const res = await fetch(`/api/pedidos/${pedidoId}`);
  const { pedido } = await res.json();
  if (!pedido) return;
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const items = pedido.detalles.map((d) => `<tr><td>${d.cantidad}× ${esc(d.producto_nombre)}${d.variante ? ` · ${esc(d.variante)}` : ""}${d.notas ? `<br><small>Nota: ${esc(d.notas)}</small>` : ""}</td><td style="text-align:right">$${(Number(d.precio_unitario) * d.cantidad).toFixed(2)}</td></tr>`).join("");
  win.document.write(`<!doctype html><html><head><title>Ticket</title><style>body{font-family:Arial;width:72mm;margin:0;padding:8mm;font-size:12px}h2,p{margin:0 0 6px}table{width:100%;border-collapse:collapse}td{padding:4px 0;border-bottom:1px dashed #bbb}small{color:#555}.total{font-size:16px;font-weight:bold}</style></head><body><h2>La Pupusa</h2><p>${pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"}<br>${esc(pedido.nombre_control)}</p><table>${items}</table><p class="total">Total: $${Number(pedido.total).toFixed(2)}</p><p>Pago: ${esc(pedido.metodo_pago || "-")}<br>${new Date(pedido.fecha_pago || pedido.fecha).toLocaleString("es-SV")}</p></body></html>`);
  win.document.close(); win.focus(); win.print();
}
