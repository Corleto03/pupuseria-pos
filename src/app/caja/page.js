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
  useRealtime(load);

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

  const locales = pedidos.filter((p) => p.tipo_pedido === "local");
  const llevar = pedidos.filter((p) => p.tipo_pedido === "llevar");

  return (
    <Shell title="Caja">
      {/* Panel de Gestión de Caja */}
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
            <div className="flex items-center gap-4 text-xs">
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
          <h2 className="mb-3 text-sm font-medium text-mute">Mesas en tiempo real</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {mesas.map((m) => (
              <div key={m.id} className="card p-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xl">{m.numero}</span>
                  <span className={clsx("h-2.5 w-2.5 rounded-full", m.estado === "ocupada" ? "bg-wine" : "bg-moss")} />
                </div>
                <p className="mt-2 truncate text-xs text-mute">{m.nombre_control || "Libre"}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-6">
          <Block title="Comer aquí" items={locales} onCobrar={setCobrar} />
          <Block title="Para llevar" items={llevar} onCobrar={setCobrar} />
        </section>
      </div>
      {cobrar && (
        <CobroModal pedido={cobrar} onClose={() => setCobrar(null)} onConfirm={confirmar} saving={saving} userRole={user?.rol} />
      )}

      {showCerrar && caja && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 border border-white/10 bg-[#1c1b18] text-stone-100 shadow-2xl rounded-2xl">
            <h3 className="font-display text-xl font-semibold mb-2">Cerrar Caja</h3>
            <p className="text-sm text-stone-400 mb-4">
              Ingresa el dinero físico contado en el cajón para verificar si la caja cuadra exacto o presenta diferencias.
            </p>
            
            <div className="bg-stone-900/60 p-4 rounded-xl border border-white/5 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-stone-400">Total Efectivo Esperado:</span>
                <span className="font-semibold text-emerald-400">
                  {fmt.money(Number(caja.apertura) + Number(ventas.efectivo))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-400">Total Tarjeta:</span>
                <span className="font-semibold text-emerald-400">{fmt.money(Number(ventas.tarjeta))}</span>
              </div>
            </div>

            <div className="mb-6 space-y-2">
              <label className="block text-xs font-medium text-stone-300">
                Dinero Físico en Caja ($):
              </label>
              <input
                type="number"
                step="0.01"
                placeholder={`Ej: ${(Number(caja.apertura) + Number(ventas.efectivo)).toFixed(2)}`}
                value={montoContado}
                onChange={(e) => setMontoContado(e.target.value)}
                className="input text-sm w-full font-mono bg-stone-900 text-white border-white/10"
              />
              {montoContado !== "" && (() => {
                const diff = Number(montoContado) - (Number(caja.apertura) + Number(ventas.efectivo));
                if (Math.abs(diff) < 0.01) {
                  return <p className="text-xs text-emerald-400 font-semibold text-center">Caja Cuadrada Exacta</p>;
                } else if (diff < 0) {
                  return <p className="text-xs text-rose-400 font-semibold text-center">Faltante: {fmt.money(Math.abs(diff))}</p>;
                } else {
                  return <p className="text-xs text-amber-400 font-semibold text-center">Sobrante: {fmt.money(diff)}</p>;
                }
              })()}
            </div>

            <div className="flex gap-3">
              <button 
                disabled={saving} 
                onClick={() => { setShowCerrar(false); setMontoContado(""); }} 
                className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-semibold rounded-xl flex-1 transition"
              >
                Cancelar
              </button>
              <button 
                disabled={saving} 
                onClick={cerrarCaja} 
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl flex-1 transition active:scale-95 shadow-sm"
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

function Block({ title, items, onCobrar }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-mute">{title}</h2>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-mute">Sin pedidos abiertos.</p>}
        {items.map((p) => {
          const ok = ready(p);
          const cocina = (p.detalles || []).filter((d) => !["entregado", "no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)).length;
          return (
            <div key={p.id} className="card flex items-center justify-between p-4">
              <div>
                <p className="font-medium">
                  {p.tipo_pedido === "local" ? `Mesa ${p.mesa_numero}` : p.nombre_control}
                </p>
                <p className="text-xs text-mute">
                  {p.nombre_control} · {cocina ? `${cocina} en cocina` : "Listo para cobro"} · {fmt.money(p.total)}
                </p>
              </div>
              <button onClick={() => onCobrar(p)} className="btn-primary text-xs">
                Cobrar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
