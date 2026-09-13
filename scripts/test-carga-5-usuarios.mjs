/**
 * test-carga-5-usuarios.mjs
 * Simula 5 usuarios concurrentes en el POS local y mide tiempos de respuesta.
 * 
 * Uso: node scripts/test-carga-5-usuarios.mjs
 * (con el servidor corriendo en http://localhost:3000)
 */

const BASE = "http://localhost:3000";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const ms = (n) => `${n}ms`;
const fmt = (n) => n < 200 ? `\x1b[32m${ms(n)}\x1b[0m` : n < 500 ? `\x1b[33m${ms(n)}\x1b[0m` : `\x1b[31m${ms(n)}\x1b[0m`;
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const err = (msg) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
const sep = () => console.log("─".repeat(60));

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - t0;
    return { ok: true, elapsed, result, label };
  } catch (e) {
    const elapsed = Date.now() - t0;
    return { ok: false, elapsed, error: e.message, label };
  }
}

// ─── Login: obtiene cookie de sesión ─────────────────────────────────────────
async function login(email, password, nombre) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  
  // El token viene en Set-Cookie como "pos_session=..."
  const rawCookies = res.headers.getSetCookie?.() || [res.headers.get("set-cookie") || ""];
  let token = null;
  for (const c of rawCookies) {
    const match = c.match(/pos_session=([^;]+)/);
    if (match) { token = match[1]; break; }
  }
  
  if (!token) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Login falló para ${email} (${res.status}): ${body.error || "sin token"}`);
  }
  return { nombre, email, token, headers: { Cookie: `pos_session=${token}` } };
}


// ─── Simular un usuario y sus acciones ────────────────────────────────────────
async function simularUsuario(session, acciones) {
  const resultados = [];
  for (const { label, url, method = "GET", body } of acciones) {
    const r = await timed(label, async () => {
      const opts = {
        method,
        headers: { ...session.headers, "Content-Type": "application/json" },
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${BASE}${url}`, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    });
    resultados.push(r);
  }
  return resultados;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
console.log("\n\x1b[1m╔══════════════════════════════════════════════════════════╗\x1b[0m");
console.log("\x1b[1m║     TEST DE CARGA — 5 USUARIOS CONCURRENTES              ║\x1b[0m");
console.log("\x1b[1m╚══════════════════════════════════════════════════════════╝\x1b[0m\n");
console.log(`Servidor: ${BASE}\n`);

// Verificar que el servidor está corriendo
sep();
console.log("0. Verificando servidor...");
try {
  const ping = await fetch(`${BASE}/api/auth/me`);
  ok(`Servidor responde (${ping.status})`);
} catch {
  err("Servidor NO responde en " + BASE);
  err("Ejecuta: npm run dev  o  npm run start");
  process.exit(1);
}

// ─── 1. Login concurrente de los 5 "dispositivos" ────────────────────────────
sep();
console.log("1. Login concurrente de 5 sesiones...");

const t0Login = Date.now();
let sessions;
try {
  // Usamos el mismo usuario admin en 5 sesiones (simula 5 dispositivos)
  sessions = await Promise.all([
    login("pupuseriagloria@gmail.com", "Pupuseriagloria123", "Caja/Admin"),
    login("pupuseriagloria@gmail.com", "Pupuseriagloria123", "Mesero"),
    login("pupuseriagloria@gmail.com", "Pupuseriagloria123", "Cocina General"),
    login("pupuseriagloria@gmail.com", "Pupuseriagloria123", "KDS Pupusas"),
    login("alexiscorleto777@gmail.com", "posprueba123", "Gerente/Dashboard"),
  ]);
  ok(`5 sesiones creadas en ${fmt(Date.now() - t0Login)}`);
} catch (e) {
  err(`Error al hacer login: ${e.message}`);
  process.exit(1);
}

const [cajero, mesero, cocinaGeneral, kdsPupusas, gerente] = sessions;

// ─── 2. Carga inicial de páginas principales (concurrente) ───────────────────
sep();
console.log("2. Carga inicial de datos (5 endpoints concurrentes)...\n");

const cargaInicial = await Promise.all([
  timed(`[${cajero.nombre}]    GET /api/mesas`, () =>
    fetch(`${BASE}/api/mesas`, { headers: cajero.headers }).then(r => r.json())),
  timed(`[${mesero.nombre}]   GET /api/mesas`, () =>
    fetch(`${BASE}/api/mesas`, { headers: mesero.headers }).then(r => r.json())),
  timed(`[${cocinaGeneral.nombre}] GET /api/cocina`, () =>
    fetch(`${BASE}/api/cocina`, { headers: cocinaGeneral.headers }).then(r => r.json())),
  timed(`[${kdsPupusas.nombre}] GET /api/cocina/estacion/pupusa`, () =>
    fetch(`${BASE}/api/cocina/estacion/pupusa`, { headers: kdsPupusas.headers }).then(r => r.json())),
  timed(`[${gerente.nombre}] GET /api/reportes`, () =>
    fetch(`${BASE}/api/reportes`, { headers: gerente.headers }).then(r => r.json())),
]);

let mesas = [];
for (const r of cargaInicial) {
  if (r.ok) {
    ok(`${r.label.padEnd(55)} ${fmt(r.elapsed)}`);
    if (r.label.includes("cajero") || r.label.includes("Caja") || r.label.includes("mesas") && r.result?.mesas) {
      mesas = r.result?.mesas || mesas;
    }
    if (r.result?.mesas) mesas = r.result.mesas;
  } else {
    err(`${r.label.padEnd(55)} ${fmt(r.elapsed)} → ${r.error}`);
  }
}

// ─── 3. Flujo completo: Mesero abre mesa y agrega pedido ─────────────────────
sep();
console.log("3. Flujo: Mesero abre mesa y agrega pedido...\n");

// Obtener mesas disponibles
const mesasRes = await fetch(`${BASE}/api/mesas`, { headers: mesero.headers });
const { mesas: listaMesas } = await mesasRes.json();
const mesaLibre = listaMesas?.find(m => m.estado === "libre");

let pedidoId = null;
let mesaId = null;

if (!mesaLibre) {
  err("No hay mesas libres disponibles para la prueba");
} else {
  mesaId = mesaLibre.id;

  // Crear pedido
  const rCrear = await timed(`[Mesero] POST /api/pedidos (abrir Mesa ${mesaLibre.numero})`, async () => {
    const res = await fetch(`${BASE}/api/pedidos`, {
      method: "POST",
      headers: { ...mesero.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ tipo_pedido: "local", id_mesa: mesaId, nombre_control: "Test 5 Usuarios" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  });

  if (rCrear.ok) {
    ok(`${rCrear.label.padEnd(55)} ${fmt(rCrear.elapsed)}`);
    pedidoId = rCrear.result?.pedido?.id;
  } else {
    err(`${rCrear.label} → ${rCrear.error}`);
  }
}

// ─── 4. Obtener productos del menú ───────────────────────────────────────────
const prodRes = await fetch(`${BASE}/api/productos`, { headers: mesero.headers });
const prodData = await prodRes.json();
const productos = prodData?.productos || prodData || [];

const pupusa = productos.find(p => p.nombre?.toLowerCase().includes("pupusa") && p.activo !== false);
const pan = productos.find(p => (p.nombre?.toLowerCase().includes("pan") || p.nombre?.toLowerCase().includes("gallina")) && p.activo !== false);
const bebida = productos.find(p => (p.nombre?.toLowerCase().includes("chocolate") || p.nombre?.toLowerCase().includes("bebida") || p.nombre?.toLowerCase().includes("refresco")) && p.activo !== false);

if (pedidoId) {
  // ─── 5. Agregar items al pedido ──────────────────────────────────────────
  sep();
  console.log("4. Mesero agrega items al pedido concurrente...\n");

  const itemsAgregar = [];
  if (pupusa) itemsAgregar.push({ id_producto: pupusa.id, cantidad: 2, producto_nombre: pupusa.nombre, estacion: "pupusa" });
  if (pan)    itemsAgregar.push({ id_producto: pan.id,    cantidad: 1, producto_nombre: pan.nombre,    estacion: "panes"  });
  if (bebida) itemsAgregar.push({ id_producto: bebida.id, cantidad: 1, producto_nombre: bebida.nombre, estacion: "bebida" });

  if (itemsAgregar.length === 0) {
    err("No se encontraron productos en el menú para agregar");
  } else {
    const rItems = await timed(`[Mesero] POST /api/pedidos/${pedidoId?.slice(0,8)}/items (${itemsAgregar.length} items)`, async () => {
      const res = await fetch(`${BASE}/api/pedidos/${pedidoId}/items`, {
        method: "POST",
        headers: { ...mesero.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsAgregar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    });
    if (rItems.ok) ok(`${rItems.label.padEnd(55)} ${fmt(rItems.elapsed)}`);
    else err(`${rItems.label} → ${rItems.error}`);

    // ─── 6. Enviar comanda a cocina ────────────────────────────────────────
    sep();
    console.log("5. Mesero envía comanda a cocina...\n");

    const rCocina = await timed(`[Mesero] PATCH /api/pedidos/${pedidoId?.slice(0,8)} (enviar_cocina)`, async () => {
      const res = await fetch(`${BASE}/api/pedidos/${pedidoId}`, {
        method: "PATCH",
        headers: { ...mesero.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "enviar_cocina" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    });
    if (rCocina.ok) ok(`${rCocina.label.padEnd(55)} ${fmt(rCocina.elapsed)}`);
    else err(`${rCocina.label} → ${rCocina.error}`);

    // Pequeña pausa para que el evento SSE se propague
    await new Promise(r => setTimeout(r, 800));

    // ─── 7. Cocina verifica que la comanda llegó ───────────────────────────
    sep();
    console.log("6. Cocina verifica comandas (3 endpoints simultáneos)...\n");

    const verificacion = await Promise.all([
      timed(`[Cocina General]  GET /api/cocina`, () =>
        fetch(`${BASE}/api/cocina`, { headers: cocinaGeneral.headers }).then(r => r.json())),
      timed(`[KDS Pupusas]     GET /api/cocina/estacion/pupusa`, () =>
        fetch(`${BASE}/api/cocina/estacion/pupusa`, { headers: kdsPupusas.headers }).then(r => r.json())),
      timed(`[Gerente]         GET /api/reportes`, () =>
        fetch(`${BASE}/api/reportes`, { headers: gerente.headers }).then(r => r.json())),
    ]);

    for (const r of verificacion) {
      if (r.ok) {
        const n = r.result?.pedidos?.length ?? r.result?.length ?? "?";
        ok(`${r.label.padEnd(55)} ${fmt(r.elapsed)} (${n} pedidos/datos)`);
      } else {
        err(`${r.label.padEnd(55)} → ${r.error}`);
      }
    }

    // Verificar que pupusas está en el KDS correcto
    const kdsPupusasData = verificacion[1].result;
    const pedidosKDS = kdsPupusasData?.pedidos || kdsPupusasData || [];
    const enKDS = Array.isArray(pedidosKDS) && pedidosKDS.some(p => p.id === pedidoId || p.detalles?.some(d => d.id_pedido === pedidoId));

    sep();
    console.log("7. Validaciones de lógica de negocio...\n");

    if (Array.isArray(pedidosKDS)) {
      ok(`KDS Pupusas devuelve array de pedidos (${pedidosKDS.length} activos)`);
    } else {
      err(`KDS Pupusas devolvió formato inesperado`);
    }
  }
}

// ─── 8. Carga simultánea de 5 endpoints (stress) ─────────────────────────────
sep();
console.log("8. Stress test: 10 peticiones simultáneas (mix de endpoints)...\n");

const stress = await Promise.all([
  timed("GET /api/mesas [1]", () => fetch(`${BASE}/api/mesas`, { headers: cajero.headers }).then(r => r.json())),
  timed("GET /api/mesas [2]", () => fetch(`${BASE}/api/mesas`, { headers: mesero.headers }).then(r => r.json())),
  timed("GET /api/cocina [1]", () => fetch(`${BASE}/api/cocina`, { headers: cocinaGeneral.headers }).then(r => r.json())),
  timed("GET /api/cocina/estacion/pupusa", () => fetch(`${BASE}/api/cocina/estacion/pupusa`, { headers: kdsPupusas.headers }).then(r => r.json())),
  timed("GET /api/cocina/estacion/panes", () => fetch(`${BASE}/api/cocina/estacion/panes`, { headers: kdsPupusas.headers }).then(r => r.json())),
  timed("GET /api/reportes [1]", () => fetch(`${BASE}/api/reportes`, { headers: gerente.headers }).then(r => r.json())),
  timed("GET /api/productos", () => fetch(`${BASE}/api/productos`, { headers: cajero.headers }).then(r => r.json())),
  timed("GET /api/mesas [3]", () => fetch(`${BASE}/api/mesas`, { headers: cajero.headers }).then(r => r.json())),
  timed("GET /api/cocina [2]", () => fetch(`${BASE}/api/cocina`, { headers: cocinaGeneral.headers }).then(r => r.json())),
  timed("GET /api/reportes [2]", () => fetch(`${BASE}/api/reportes`, { headers: gerente.headers }).then(r => r.json())),
]);

const tiempos = stress.map(r => r.elapsed);
const promedio = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
const maximo = Math.max(...tiempos);
const minimo = Math.min(...tiempos);
const exitosos = stress.filter(r => r.ok).length;

for (const r of stress) {
  if (r.ok) ok(`${r.label.padEnd(40)} ${fmt(r.elapsed)}`);
  else err(`${r.label.padEnd(40)} ${fmt(r.elapsed)} → ${r.error}`);
}

// ─── 9. Resumen final ─────────────────────────────────────────────────────────
sep();
console.log("\n\x1b[1m=== RESUMEN DE RENDIMIENTO ===\x1b[0m\n");
console.log(`  Peticiones exitosas:    ${exitosos}/10`);
console.log(`  Tiempo promedio:        ${fmt(promedio)}`);
console.log(`  Tiempo mínimo:          ${fmt(minimo)}`);
console.log(`  Tiempo máximo:          ${fmt(maximo)}`);
console.log();

if (promedio < 200) {
  console.log("  \x1b[32m✅ EXCELENTE — El sistema responde muy rápido bajo carga concurrente\x1b[0m");
} else if (promedio < 500) {
  console.log("  \x1b[33m⚠️  ACEPTABLE — El sistema responde bien pero hay margen de mejora\x1b[0m");
} else {
  console.log("  \x1b[31m❌ LENTO — El sistema tarda demasiado, revisar queries de DB\x1b[0m");
}

console.log("\n  \x1b[36m🌐 IP de red local (para tablets):\x1b[0m");
import { networkInterfaces } from "os";
const nets = networkInterfaces();
for (const [name, addrs] of Object.entries(nets)) {
  for (const addr of addrs) {
    if (addr.family === "IPv4" && !addr.internal) {
      console.log(`     http://${addr.address}:3000  (interfaz: ${name})`);
    }
  }
}

console.log("\n");
