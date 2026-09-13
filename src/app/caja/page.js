"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import CobroModal from "@/components/CobroModal";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/hooks/useAuth";
import { fmt } from "@/lib/formatters";
import clsx from "clsx";
import { printTicket } from "@/lib/printTicket";
import { playNotificationSound } from "@/lib/sound";
import { printComandaCocina } from "@/lib/printComanda";
import { dispararAperturaGaveta } from "@/lib/hardwareBridge";
import { Printer, X, Unlock } from "lucide-react";

function ready(p) {
  const dets = p.detalles || [];
  return dets.length > 0 && dets.every((d) => ["entregado", "no_entregado", "anulado", "cancelado"].includes(d.estado_cocina));
}

export default function CajaPage() {
  const [mesas, setMesas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [caja, setCaja] = useState(null);
  const [ventas, setVentas] = useState({ efectivo: 0, tarjeta: 0 });
  const [montoApertura, setMontoApertura] = useState("");
  const [montoContado, setMontoContado] = useState("");
  const [cobrar, setCobrar] = useState(null);
  const [reimprimirPedido, setReimprimirPedido] = useState(null);
  const [selectedRonda, setSelectedRonda] = useState("1");
  const [showCerrar, setShowCerrar] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      fetch("/api/mesas"),
      fetch("/api/pedidos?estado=pendiente"),
      fetch("/api/caja"),
    ]);
    const da = await a.json();
    const db = await b.json();
    const dc = await c.json();
    setMesas(da.mesas || []);
    setPedidos(db.pedidos || []);
    setCaja(dc.caja || null);
    setVentas(dc.ventas || { efectivo: 0, tarjeta: 0 });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRealtime = useCallback((ev) => {
    load();
    if (ev?.table === "detalle_pedidos" && ev?.estado_cocina === "entregado") {
      playNotificationSound("cobro");
      const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "Cliente");
      toast(`Orden lista para cobro (${target})`);
    } else if (ev?.table === "comanda_lista" && ev?.todas_listas) {
      playNotificationSound("cobro");
      const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "Cliente");
      toast(`¡Comanda completa lista para cobrar (${target})!`);
    } else if (ev?.table === "detalle_pedidos" && ev?.estado_cocina === "pendiente") {
      const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "Cliente");
      toast(`Nuevo pedido enviado a cocina (${target})`);
    }
  }, [load, toast]);

  useRealtime(handleRealtime);

  async function abrirCaja(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/caja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "abrir", apertura: Number(montoApertura) }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json();
      return toast(err.error, "err");
    }
    toast("Caja abierta correctamente");
    setMontoApertura("");
    load();
  }

  async function cerrarCaja() {
    setSaving(true);
    const res = await fetch("/api/caja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "cerrar",
        efectivo_real: montoContado !== "" ? Number(montoContado) : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json();
      return toast(err.error, "err");
    }
    toast("Caja cerrada correctamente");
    setShowCerrar(false);
    setMontoContado("");
    load();
  }

  async function confirmar(_pedido, pago) {
    setSaving(true);
    const res = await fetch(`/api/pedidos/${cobrar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "cobrar", ...pago }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return toast(data.error, "err");
    if (pago.imprimir) await printTicket(cobrar.id);
    toast("Cobro registrado");
    setCobrar(null);
    load();
  }

  async function handleReimprimir(p) {
    const set = new Set();
    for (const d of (p.detalles || [])) {
      if (d.estado_cocina !== "borrador" && d.ronda) {
        set.add(Number(d.ronda));
      }
    }
    const rondas = Array.from(set).sort((a, b) => a - b);
    if (rondas.length === 0) {
      const items = (p.detalles || []).filter((d) => d.estado_cocina !== "borrador");
      if (items.length === 0) return toast("No hay productos enviados a cocina", "err");
      await printComandaCocina({ items, ronda: 1, pedido: p });
      return toast("Comanda enviada a impresion");
    }

    if (rondas.length === 1) {
      const items = (p.detalles || []).filter((d) => (d.ronda || 1) === rondas[0] && d.estado_cocina !== "borrador");
      await printComandaCocina({ items, ronda: rondas[0], pedido: p });
      return toast(`Comanda (Ronda ${rondas[0]}) enviada a impresion`);
    }

    setSelectedRonda(String(rondas[rondas.length - 1]));
    setReimprimirPedido(p);
  }

  async function ejecutarReimpresion() {
    if (!reimprimirPedido) return;
    let items = [];
    let targetRonda = selectedRonda;
    if (selectedRonda === "todas") {
      items = (reimprimirPedido.detalles || []).filter((d) => d.estado_cocina !== "borrador");
      targetRonda = "COMPLETA";
    } else {
      const rNum = Number(selectedRonda);
      items = (reimprimirPedido.detalles || []).filter((d) => (d.ronda || 1) === rNum && d.estado_cocina !== "borrador");
      targetRonda = rNum;
    }
    await printComandaCocina({ items, ronda: targetRonda, pedido: reimprimirPedido });
    toast(`Reimprimiendo comanda ${targetRonda === "COMPLETA" ? "completa" : `(Ronda ${targetRonda})`}`);
    setReimprimirPedido(null);
  }

  const [openingGaveta, setOpeningGaveta] = useState(false);

  async function handleAbrirGaveta() {
    setOpeningGaveta(true);
    try {
      const res = await dispararAperturaGaveta("apertura_manual_pantalla");
      if (!res.ok) {
        toast(res.error || "No se pudo abrir la gaveta", "err");
      } else {
        toast("Comando enviado: Gaveta de dinero abierta");
      }
    } catch {
      toast("Error al comunicarse con la gaveta", "err");
    } finally {
      setOpeningGaveta(false);
    }
  }

  const cajaAbierta = Boolean(caja && caja.cierre === null);

  function handleCobrar(p) {
    if (!cajaAbierta) {
      toast("No se puede cobrar: Debe abrir la caja del día primero antes de registrar cobros.", "err");
      return;
    }
    setCobrar(p);
  }

  const locales = pedidos.filter((p) => p.tipo_pedido === "local");
  const llevar = pedidos.filter((p) => p.tipo_pedido === "llevar");

  return (
    <Shell
      title="Caja"
      actions={
        <button
          type="button"
          onClick={handleAbrirGaveta}
          disabled={openingGaveta}
          className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl font-semibold text-stone-800 transition active:scale-95 shadow-sm"
        >
          <Unlock size={14} />
          <span>{openingGaveta ? "Abriendo..." : "Abrir Gaveta"}</span>
        </button>
      }
    >
      {/* Resumen del Día */}
      <div className="card mb-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Caja del Día</h2>
            <p className="text-xs text-mute">
              Estado:{" "}
              {caja ? (
                caja.cierre !== null ? (
                  <span className="font-semibold text-amber-500">Cerrada</span>
                ) : (
                  <span className="font-semibold text-emerald-500">Abierta</span>
                )
              ) : (
                <span className="font-semibold text-rose-500">No iniciada</span>
              )}
            </p>
          </div>

          {!caja || caja.cierre !== null ? (
            <form onSubmit={abrirCaja} className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                required
                placeholder="Monto inicial ($)"
                value={montoApertura}
                onChange={(e) => setMontoApertura(e.target.value)}
                className="input text-xs w-36"
              />
              <button type="submit" disabled={saving} className="btn-primary text-xs">
                Abrir Caja
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
              <div>
                <span className="text-mute block">Apertura:</span>
                <span className="font-semibold">{fmt.money(caja.apertura)}</span>
              </div>
              <div>
                <span className="text-mute block">Efectivo hoy:</span>
                <span className="font-semibold">{fmt.money(ventas.efectivo)}</span>
              </div>
              <div>
                <span className="text-mute block">Tarjeta hoy:</span>
                <span className="font-semibold">{fmt.money(ventas.tarjeta)}</span>
              </div>
              <div>
                <span className="text-mute block">Esperado en Caja:</span>
                <span className="font-semibold text-emerald-400">
                  {fmt.money(Number(caja.apertura) + Number(ventas.efectivo))}
                </span>
              </div>
              <button onClick={() => setShowCerrar(true)} disabled={saving} className="btn-secondary text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium px-4 py-2 rounded-xl transition active:scale-95 shadow-sm">
                Cerrar Caja
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Mesas en tiempo real</h2>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {mesas.map((m) => {
              const ocupada = m.estado === "ocupada" || Boolean(m.pedido_id);
              return (
                <div key={m.id} className="card p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base text-stone-900">Mesa {m.numero}</span>
                    <span
                      className={clsx(
                        "text-[10px] font-bold px-2 py-0.5 rounded text-white tracking-wider uppercase",
                        ocupada ? "bg-rose-700" : "bg-emerald-700"
                      )}
                    >
                      {ocupada ? "Ocupada" : "Libre"}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-stone-500 font-medium">{ocupada ? (m.nombre_control || "Ocupada") : "Disponible"}</p>
                </div>
              );
            })}
          </div>
        </section>
        <section className="space-y-6">
          <Block title="Comer aquí" items={locales} onCobrar={handleCobrar} onReimprimir={handleReimprimir} cajaAbierta={cajaAbierta} />
          <Block title="Para llevar" items={llevar} onCobrar={handleCobrar} onReimprimir={handleReimprimir} cajaAbierta={cajaAbierta} />
        </section>
      </div>
      {cobrar && (
        <CobroModal pedido={cobrar} onClose={() => setCobrar(null)} onConfirm={confirmar} saving={saving} userRole={user?.rol} cajaAbierta={cajaAbierta} />
      )}

      {/* Modal para selección de ronda al reimprimir comanda desde caja */}
      {reimprimirPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm p-5 shadow-xl rounded-xl bg-white border border-stone-300">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-semibold text-sm text-stone-900">Reimprimir Comanda de Cocina</h3>
              <button onClick={() => setReimprimirPedido(null)} className="text-stone-400 hover:text-stone-700">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-stone-500 mt-2 mb-4">
              {reimprimirPedido.tipo_pedido === "local" ? `Mesa ${reimprimirPedido.mesa_numero}` : "Para llevar"} · {reimprimirPedido.nombre_control}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-stone-600 font-semibold mb-1.5">Seleccionar Ronda a Imprimir</label>
                <select
                  value={selectedRonda}
                  onChange={(e) => setSelectedRonda(e.target.value)}
                  className="input w-full text-xs"
                >
                  {Array.from(
                    new Set(
                      (reimprimirPedido.detalles || [])
                        .filter((d) => d.estado_cocina !== "borrador" && d.ronda)
                        .map((d) => Number(d.ronda))
                    )
                  )
                    .sort((a, b) => a - b)
                    .map((r) => (
                      <option key={r} value={r}>
                        Ronda {r} {r === 1 ? "(Inicial)" : "(Adición)"}
                      </option>
                    ))}
                  <option value="todas">Todas las rondas (Comanda Completa)</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReimprimirPedido(null)}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={ejecutarReimpresion}
                  className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5 font-semibold"
                >
                  <Printer size={14} />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cerrar Caja */}
      {showCerrar && caja && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm p-6 border border-stone-300 bg-white text-stone-900 shadow-xl rounded-xl">
            <h3 className="font-semibold text-lg text-stone-900 mb-1">Cerrar Caja</h3>
            <p className="text-xs text-stone-500 mb-4">
              Ingresa el dinero físico contado en el cajón para verificar si la caja cuadra exacto o presenta diferencias.
            </p>
            
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 mb-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-stone-600 font-medium">Total Efectivo Esperado:</span>
                <span className="font-bold text-stone-900 font-mono">
                  {fmt.money(Number(caja.apertura) + Number(ventas.efectivo))}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stone-600 font-medium">Total Tarjeta:</span>
                <span className="font-bold text-stone-900 font-mono">{fmt.money(Number(ventas.tarjeta))}</span>
              </div>
            </div>

            <div className="mb-5 space-y-2">
              <label className="block text-xs font-semibold text-stone-700">
                Dinero Físico en Caja ($):
              </label>
              <input
                type="number"
                step="0.01"
                placeholder={`Ej: ${(Number(caja.apertura) + Number(ventas.efectivo)).toFixed(2)}`}
                value={montoContado}
                onChange={(e) => setMontoContado(e.target.value)}
                className="input text-base font-mono font-bold text-stone-900"
              />
              {montoContado !== "" && (() => {
                const diff = Number(montoContado) - (Number(caja.apertura) + Number(ventas.efectivo));
                if (Math.abs(diff) < 0.01) {
                  return <p className="text-xs text-white bg-emerald-700 font-bold text-center py-2 rounded-lg">Caja Cuadrada Exacta</p>;
                } else if (diff < 0) {
                  return <p className="text-xs text-white bg-rose-700 font-bold text-center py-2 rounded-lg">Faltante: {fmt.money(Math.abs(diff))}</p>;
                } else {
                  return <p className="text-xs text-white bg-amber-600 font-bold text-center py-2 rounded-lg">Sobrante: {fmt.money(diff)}</p>;
                }
              })()}
            </div>

            <div className="flex gap-2.5">
              <button 
                disabled={saving} 
                onClick={() => { setShowCerrar(false); setMontoContado(""); }} 
                className="btn-secondary flex-1 text-xs py-2.5"
              >
                Cancelar
              </button>
              <button 
                disabled={saving} 
                onClick={cerrarCaja} 
                className="btn-danger flex-1 text-xs py-2.5 font-semibold"
              >
                {saving ? "Cerrando..." : "Sí, Cerrar Caja"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Block({ title, items, onCobrar, onReimprimir, cajaAbierta }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h2>
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-stone-400 bg-white p-4 rounded-xl border border-line shadow-card">
            Sin pedidos abiertos en esta sección.
          </p>
        )}
        {items.map((p) => {
          const cocina = (p.detalles || []).filter((d) => !["entregado", "no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)).length;
          return (
            <div key={p.id} className="card flex items-center justify-between p-4 shadow-card">
              <div>
                <p className="font-bold text-stone-900 text-base">
                  {p.tipo_pedido === "local" ? `Mesa ${p.mesa_numero}` : p.nombre_control}
                </p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {p.nombre_control} · {cocina ? <span className="text-amber-700 font-semibold">{cocina} en cocina</span> : <span className="text-emerald-700 font-semibold">Listo para cobro</span>} · <strong className="font-mono text-stone-900 font-bold">{fmt.money(p.total)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Reimprimir comanda de cocina"
                  onClick={() => onReimprimir(p)}
                  className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                >
                  <Printer size={13} />
                  <span className="hidden sm:inline">Comanda</span>
                </button>
                <button
                  onClick={() => onCobrar(p)}
                  className={clsx(
                    "text-xs py-2 px-4 font-semibold rounded-lg transition active:scale-95 shadow-sm",
                    cajaAbierta
                      ? "btn-emerald"
                      : "bg-stone-200 text-stone-500 hover:bg-stone-300 border border-stone-300"
                  )}
                  title={cajaAbierta ? "Cobrar pedido" : "Abre la caja para poder cobrar"}
                >
                  Cobrar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
