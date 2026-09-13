/**
 * Módulo de comunicación con hardware POS local.
 * Soporta hasta 3 impresoras térmicas independientes por estación:
 *   - "pupusa"  → impresora en área de pupusas
 *   - "panes"   → impresora en área de panes
 *   - "caja"    → impresora en caja (también maneja bebidas y apertura de gaveta)
 *
 * Si una impresora de área falla y fallback_a_caja=true, la comanda
 * se reenvía automáticamente a la impresora de caja.
 *
 * Configuración persistida en localStorage del navegador de cada dispositivo.
 */

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  impresoras: {
    pupusa: { url: "http://localhost:8085", enabled: false },
    panes:  { url: "http://localhost:8086", enabled: false },
    caja:   { url: "http://localhost:8087", enabled: false },
  },
  fallback_a_caja: true,
  imprimir_todo_en_caja: false, // opción: enviar copia de toda la comanda a caja también
};

// ─── Config helpers ────────────────────────────────────────────────────────────

export function getHardwareConfig() {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem("pos_hardware_config");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge con defaults para retrocompatibilidad
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        impresoras: {
          ...DEFAULT_CONFIG.impresoras,
          ...(parsed.impresoras || {}),
        },
      };
    }
  } catch {
    // localStorage corrupto → ignorar
  }
  return { ...DEFAULT_CONFIG };
}

export function saveHardwareConfig(config) {
  if (typeof window === "undefined") return;
  localStorage.setItem("pos_hardware_config", JSON.stringify(config));

  // Compatibilidad con código legado que leía pos_bridge_enabled / pos_bridge_url
  const cajaConfig = config?.impresoras?.caja;
  if (cajaConfig) {
    localStorage.setItem("pos_bridge_enabled", cajaConfig.enabled ? "true" : "false");
    localStorage.setItem("pos_bridge_url", cajaConfig.url || "http://localhost:8087");
  }
}

// ─── Función interna: enviar a un bridge específico ───────────────────────────

async function _enviarABridge({ url, payload, timeoutMs = 2500 }) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(tid);
    return res.ok;
  } catch {
    clearTimeout(tid);
    return false;
  }
}

// ─── Imprimir por estación ────────────────────────────────────────────────────

/**
 * Envía un trabajo de impresión a la impresora de la estación correspondiente.
 * Si falla y fallback_a_caja=true, reintenta con la impresora de caja.
 *
 * @param {Object} params
 * @param {'pupusa'|'panes'|'caja'|'bebida'} params.estacion
 *   'bebida' siempre va a la impresora de caja.
 * @param {string}  params.html           HTML del ticket a imprimir
 * @param {Object}  params.data           Datos estructurados del ticket
 * @param {boolean} [params.abrirGaveta]  Si debe abrir la gaveta (solo caja/ticket)
 * @returns {{ ok: boolean, method: string, fallback?: boolean }}
 */
export async function imprimirPorEstacion({ estacion, html, data, abrirGaveta = false }) {
  const config = getHardwareConfig();

  // Bebidas siempre van a la impresora de caja
  const targetEstacion = estacion === "bebida" ? "caja" : estacion;
  const impresoraConfig = config.impresoras?.[targetEstacion];

  if (!impresoraConfig?.enabled) {
    return { ok: false, fallback: true, method: "disabled" };
  }

  const payload = {
    tipo: targetEstacion === "caja" && abrirGaveta ? "ticket" : "comanda",
    abrir_gaveta: targetEstacion === "caja" && abrirGaveta,
    cortar_papel: true,
    html,
    data,
  };

  const ok = await _enviarABridge({ url: impresoraConfig.url, payload });
  if (ok) return { ok: true, method: targetEstacion };

  // Fallback a caja si la impresora de área falla
  if (config.fallback_a_caja && targetEstacion !== "caja") {
    const cajaConfig = config.impresoras?.caja;
    if (cajaConfig?.enabled) {
      const okFallback = await _enviarABridge({
        url: cajaConfig.url,
        payload: { ...payload, tipo: "comanda" },
      });
      if (okFallback) return { ok: true, method: "caja_fallback", fallback: true };
    }
  }

  return { ok: false, fallback: true, method: "none" };
}

/**
 * Envía una copia completa de la comanda a la impresora de caja.
 * Usado cuando imprimir_todo_en_caja=true.
 */
export async function imprimirComandaEnCaja({ html, data }) {
  const config = getHardwareConfig();
  const cajaConfig = config.impresoras?.caja;
  if (!cajaConfig?.enabled) return { ok: false };

  const payload = {
    tipo: "comanda",
    abrir_gaveta: false,
    cortar_papel: true,
    html,
    data,
  };

  const ok = await _enviarABridge({ url: cajaConfig.url, payload });
  return { ok, method: "caja_copia" };
}

// ─── Ticket de cobro (con apertura de gaveta) ─────────────────────────────────

/**
 * Imprime el ticket final de cobro en la impresora de caja y abre la gaveta.
 * @param {Object} params
 * @param {string} params.html
 * @param {Object} params.data
 */
export async function imprimirTicketCobro({ html, data }) {
  return imprimirPorEstacion({ estacion: "caja", html, data, abrirGaveta: true });
}

// ─── Apertura manual de gaveta ────────────────────────────────────────────────

/**
 * Abre la gaveta de dinero físicamente + registra en auditoría del backend.
 * @param {string} motivo
 */
export async function dispararAperturaGaveta(motivo = "manual") {
  try {
    // 1. Registrar en auditoría del backend
    const auditRes = await fetch("/api/caja/gaveta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    const auditData = await auditRes.json();
    if (!auditRes.ok) {
      throw new Error(auditData.error || "No autorizado para abrir la gaveta");
    }

    // 2. Enviar pulso físico a la impresora de caja
    const config = getHardwareConfig();
    const cajaConfig = config.impresoras?.caja;
    if (cajaConfig?.enabled) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${cajaConfig.url}/drawer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "kick" }),
          signal: controller.signal,
        });
        clearTimeout(tid);
        if (res.ok) return { ok: true, method: "bridge", mensaje: "Gaveta abierta" };
      } catch {
        // El agente local no responde; la auditoría ya quedó registrada
      }
    }

    return { ok: true, method: "audit_only", mensaje: "Apertura registrada en auditoría" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Probar una impresora individual ──────────────────────────────────────────

/**
 * Envía un ticket de prueba a la impresora indicada.
 * @param {'pupusa'|'panes'|'caja'} estacion
 */
export async function probarImpresora(estacion) {
  const config = getHardwareConfig();
  const impresoraConfig = config.impresoras?.[estacion];
  if (!impresoraConfig?.enabled) return { ok: false, error: "Impresora deshabilitada" };

  const htmlPrueba = `<!doctype html><html><head><meta charset="UTF-8">
    <style>body{font-family:monospace;width:72mm;padding:5mm;font-size:13px;}
    .center{text-align:center;}</style></head><body>
    <div class="center"><b>*** PRUEBA DE IMPRESORA ***</b></div>
    <div class="center">Estación: ${estacion.toUpperCase()}</div>
    <div class="center">${new Date().toLocaleTimeString("es-SV")}</div>
    <div class="center">--- OK ---</div>
    </body></html>`;

  const payload = {
    tipo: "comanda",
    abrir_gaveta: estacion === "caja",
    cortar_papel: true,
    html: htmlPrueba,
    data: { prueba: true, estacion },
  };

  const ok = await _enviarABridge({ url: impresoraConfig.url, payload, timeoutMs: 3000 });
  return ok
    ? { ok: true, mensaje: `Ticket de prueba enviado a impresora ${estacion}` }
    : { ok: false, error: `No se pudo conectar con la impresora ${estacion} en ${impresoraConfig.url}` };
}

// ─── Compatibilidad con código legado ─────────────────────────────────────────

/**
 * @deprecated Usar imprimirPorEstacion o imprimirTicketCobro en su lugar.
 */
export async function imprimirViaBridge({ tipo, html, data }) {
  if (tipo === "ticket") {
    return imprimirTicketCobro({ html, data });
  }
  // Comanda genérica → caja (fallback legado)
  const config = getHardwareConfig();
  const cajaConfig = config.impresoras?.caja;
  if (!cajaConfig?.enabled) return { ok: false, fallback: true };
  const payload = { tipo: "comanda", abrir_gaveta: false, cortar_papel: true, html, data };
  const ok = await _enviarABridge({ url: cajaConfig.url, payload });
  return ok ? { ok: true, method: "bridge" } : { ok: false, fallback: true };
}
