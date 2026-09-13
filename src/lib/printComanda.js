import { imprimirPorEstacion, imprimirComandaEnCaja, getHardwareConfig } from "@/lib/hardwareBridge";


/**
 * Imprime tickets de comanda física desglosados por estación para una impresora central.
 * @param {Object} data
 * @param {Array} data.items - Items recién enviados a cocina en esta ronda
 * @param {number} data.ronda - Número de ronda (1 = Inicial, 2+ = Adición)
 * @param {Object} data.pedido - Información del pedido (mesa_numero, nombre_control, tipo_pedido, etc.)
 */
export async function printComandaCocina({ items = [], ronda = 1, pedido = {} }) {
  if (!items || items.length === 0) return;

  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  // Agrupar items por estación de cocina (Área 1, 2 y 3). Los productos extras de mostrador no se imprimen en cocina.
  const estacionesMap = {
    pupusa: { label: "ÁREA 1 · PUPUSAS", items: [] },
    panes:  { label: "ÁREA 2 · PANES CON GALLINA", items: [] },
    bebida: { label: "ÁREA 3 · BEBIDAS Y POSTRES", items: [] },
  };

  for (const item of items) {
    const est = item.estacion || item.categoria || "";
    if (est === "extra" || !estacionesMap[est]) continue;
    estacionesMap[est].items.push(item);
  }

  // Filtrar solo estaciones que tengan items en esta ronda
  const estacionesConItems = Object.entries(estacionesMap).filter(
    ([, data]) => data.items.length > 0
  );

  if (estacionesConItems.length === 0) return;

  const esTodas = ronda === "todas" || ronda === "COMPLETA";
  const esAdicion = !esTodas && Number(ronda) > 1;
  const rondaTitle = esTodas
    ? "COMANDA COMPLETA (TODAS LAS RONDAS)"
    : esAdicion
    ? `*** ADICION (RONDA ${ronda}) ***`
    : "COMANDA INICIAL (RONDA 1)";

  const horaStr = new Date().toLocaleTimeString("es-SV", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const mesaLabel =
    pedido.tipo_pedido === "local"
      ? `MESA ${pedido.mesa_numero}`
      : "PARA LLEVAR";

  // Generar HTML de cada mini-ticket por estación
  const ticketsHtml = estacionesConItems
    .map(([estacionKey, estData], index) => {
      const isLast = index === estacionesConItems.length - 1;

      const itemsHtml = estData.items
        .map((item) => {
          const varianteStr = item.variante ? ` · ${esc(item.variante)}` : "";
          const rondaTag = esTodas && item.ronda > 1 ? ` <span class='tag-llevar'>[Ronda ${item.ronda}]</span>` : "";
          const llevarTag =
            item.destino_servicio === "llevar"
              ? " <span class='tag-llevar'>[LLEVAR]</span>"
              : "";
          const notasHtml = item.notas
            ? `<div class='item-nota'>* NOTA: ${esc(item.notas)}</div>`
            : "";

          return `
            <div class="item-row">
              <div class="item-main">
                <span class="item-qty">${item.cantidad}×</span>
                <span class="item-name">${esc(item.producto_nombre)}${varianteStr}${rondaTag}${llevarTag}</span>
              </div>
              ${notasHtml}
            </div>
          `;
        })
        .join("");

      return `
        <div class="mini-ticket ${!isLast ? 'page-break' : ''}">
          <div class="ticket-header">
            <div class="station-banner">*** AREA: ${esc(estData.label)} ***</div>
            <div class="order-dest">${esc(mesaLabel)}</div>
            <div class="order-control">${esc(pedido.nombre_control || "")}</div>
            <div class="ronda-badge ${esAdicion ? 'ronda-adicion' : 'ronda-inicial'}">
              ${rondaTitle}
            </div>
            <div class="order-time">Hora de envio: ${horaStr}</div>
            ${pedido.notas ? `<div class="order-nota">Nota General: ${esc(pedido.notas)}</div>` : ""}
          </div>

          <div class="divider">================================</div>
          <div class="items-container">
            ${itemsHtml}
          </div>
          <div class="divider">================================</div>

          <div class="cut-indicator">
            ---------------- [ CORTAR AQUI ] ----------------
          </div>
        </div>
      `;
    })
    .join("");

  const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Comanda Cocina - ${mesaLabel} (Ronda ${ronda})</title>
  <style>
    @page {
      margin: 0;
      size: auto;
    }
    body {
      font-family: 'Courier New', Courier, monospace, monospace;
      width: 72mm;
      margin: 0;
      padding: 4mm 5mm;
      font-size: 13px;
      color: #000;
      background: #fff;
    }
    .mini-ticket {
      margin-bottom: 8mm;
      padding-bottom: 6mm;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    .ticket-header {
      text-align: center;
      margin-bottom: 4px;
    }
    .station-banner {
      font-size: 16px;
      font-weight: 900;
      border: 2px solid #000;
      padding: 4px 2px;
      margin-bottom: 4px;
      letter-spacing: 0.05em;
    }
    .order-dest {
      font-size: 20px;
      font-weight: 900;
      line-height: 1.1;
    }
    .order-control {
      font-size: 13px;
      font-weight: bold;
      margin-top: 2px;
    }
    .ronda-badge {
      font-size: 12px;
      font-weight: 900;
      margin-top: 4px;
      padding: 2px;
    }
    .ronda-adicion {
      border: 1px dashed #000;
      background: #eee;
    }
    .order-time {
      font-size: 11px;
      margin-top: 2px;
    }
    .order-nota {
      font-size: 12px;
      font-weight: bold;
      border: 1px solid #000;
      padding: 3px;
      margin-top: 4px;
      text-align: left;
    }
    .divider {
      text-align: center;
      font-size: 11px;
      font-weight: bold;
      margin: 4px 0;
    }
    .items-container {
      margin: 6px 0;
    }
    .item-row {
      margin-bottom: 6px;
      padding-bottom: 3px;
      border-bottom: 1px dotted #888;
    }
    .item-main {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 14px;
    }
    .item-qty {
      font-size: 18px;
      font-weight: 900;
      min-width: 28px;
    }
    .item-name {
      font-weight: 900;
      line-height: 1.15;
    }
    .tag-llevar {
      font-size: 11px;
      font-weight: bold;
      border: 1px solid #000;
      padding: 1px 3px;
    }
    .item-nota {
      font-size: 12px;
      font-weight: bold;
      padding-left: 34px;
      margin-top: 2px;
    }
    .cut-indicator {
      text-align: center;
      font-size: 10px;
      letter-spacing: 0.05em;
      margin-top: 6px;
      color: #333;
    }
  </style>
</head>
<body>
  ${ticketsHtml}
</body>
</html>`;

  // ─── Envío por estación a su impresora correspondiente ─────────────────────
  // Cada estación recibe solo SU mini-ticket en lugar de todo el HTML.
  // Se envían en paralelo para minimizar la latencia.

  const config = getHardwareConfig();
  const hayAlgunaBridgeActiva = Object.values(config.impresoras || {}).some((p) => p.enabled);

  if (hayAlgunaBridgeActiva) {
    // Construir mini-HTMLs individuales por estación para enviar a cada impresora
    const envios = estacionesConItems.map(([estacionKey, estData]) => {
      const isLast = true; // Cada mini-ticket es el único → no necesita page-break
      const itemsHtmlEst = estData.items
        .map((item) => {
          const varianteStr = item.variante ? ` · ${String(item.variante)}` : "";
          const llevarTag = item.destino_servicio === "llevar" ? " [LLEVAR]" : "";
          const notasHtml = item.notas ? `<div class='item-nota'>* NOTA: ${String(item.notas)}</div>` : "";
          return `<div class="item-row">
            <div class="item-main">
              <span class="item-qty">${item.cantidad}×</span>
              <span class="item-name">${String(item.producto_nombre ?? "")}${varianteStr}${llevarTag}</span>
            </div>${notasHtml}</div>`;
        })
        .join("");

      const miniHtml = `<!doctype html><html><head><meta charset="UTF-8">
<style>
@page{margin:0;size:auto;}
body{font-family:'Courier New',monospace;width:72mm;margin:0;padding:4mm 5mm;font-size:13px;color:#000;}
.station-banner{font-size:16px;font-weight:900;border:2px solid #000;padding:4px 2px;text-align:center;margin-bottom:4px;}
.order-dest{font-size:20px;font-weight:900;text-align:center;}
.order-control{font-size:13px;font-weight:bold;text-align:center;margin-top:2px;}
.ronda-badge{font-size:12px;font-weight:900;text-align:center;margin-top:4px;padding:2px;}
.ronda-adicion{border:1px dashed #000;background:#eee;}
.order-time{font-size:11px;text-align:center;margin-top:2px;}
.order-nota{font-size:12px;font-weight:bold;border:1px solid #000;padding:3px;margin-top:4px;}
.divider{text-align:center;font-size:11px;font-weight:bold;margin:4px 0;}
.item-row{margin-bottom:6px;padding-bottom:3px;border-bottom:1px dotted #888;}
.item-main{display:flex;align-items:baseline;gap:6px;font-size:14px;}
.item-qty{font-size:18px;font-weight:900;min-width:28px;}
.item-name{font-weight:900;line-height:1.15;}
.item-nota{font-size:12px;font-weight:bold;padding-left:34px;margin-top:2px;}
.cut-indicator{text-align:center;font-size:10px;margin-top:6px;color:#333;}
</style></head><body>
<div class="station-banner">*** ${String(estData.label)} ***</div>
<div class="order-dest">${mesaLabel}</div>
<div class="order-control">${String(pedido.nombre_control || "")}</div>
<div class="ronda-badge ${esAdicion ? "ronda-adicion" : ""}">${rondaTitle}</div>
<div class="order-time">Hora: ${horaStr}</div>
${pedido.notas ? `<div class="order-nota">Nota: ${String(pedido.notas)}</div>` : ""}
<div class="divider">================================</div>
<div class="items-container">${itemsHtmlEst}</div>
<div class="divider">================================</div>
<div class="cut-indicator">---------------- [ CORTAR AQUI ] ----------------</div>
</body></html>`;

      return imprimirPorEstacion({
        estacion: estacionKey, // 'pupusa', 'panes', 'bebida', 'extra'
        html: miniHtml,
        data: { items: estData.items, ronda, pedido, estacion: estacionKey },
      });
    });

    // Copia completa en impresora de caja (si está habilitada la opción)
    if (config.imprimir_todo_en_caja) {
      envios.push(imprimirComandaEnCaja({ html: fullHtml, data: { items, ronda, pedido } }));
    }

    const resultados = await Promise.all(envios);
    const alguienOk = resultados.some((r) => r.ok);
    if (alguienOk) return; // Al menos una impresora recibió su ticket → éxito
  }

  // ─── Fallback: diálogo de impresión del navegador ──────────────────────────
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  win.document.write(fullHtml);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 250);
}