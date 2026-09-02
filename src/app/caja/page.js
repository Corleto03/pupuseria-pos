"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import CobroModal from "@/components/CobroModal";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { fmt } from "@/lib/formatters";
import clsx from "clsx";
import { printTicket } from "@/lib/printTicket";
import { Lock, Unlock, DollarSign, Receipt, AlertTriangle, CheckCircle2 } from "lucide-react";

function ready(p) {
  const dets = p.detalles || [];
  const activeDets = dets.filter((d) => d.estado_cocina !== "cancelado");
  return activeDets.length > 0 && activeDets.every((d) => d.estado_cocina === "entregado");
}

export default function CajaPage() {
  const [mesas, setMesas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [cobrar, setCobrar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [turno, setTurno] = useState(null);
  const [showApertura, setShowApertura] = useState(false);
  const [showCierre, setShowCierre] = useState(false);
  const [montoInicialInput, setMontoInicialInput] = useState("");
  const [efectivoRealInput, setEfectivoRealInput] = useState("");
  const [notasTurnoInput, setNotasTurnoInput] = useState("");
  const toast = useToast();

  const loadTurno = useCallback(async () => {
    try {
      const res = await fetch("/api/caja/turno");
      const data = await res.json();
      setTurno(data.turno || null);
    } catch {
      setTurno(null);
    }
  }, []);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetch("/api/mesas"), fetch("/api/pedidos?estado=pendiente")]);
    const da = await a.json();
    const db = await b.json();
    setMesas(da.mesas || []);
    setPedidos(db.pedidos || []);
    await loadTurno();
  }, [loadTurno]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(load);

  async function handleAbrirTurno(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/caja/turno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto_inicial: montoInicialInput, notas: notasTurnoInput }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) return toast(data.error, "err");
      toast("Caja abierta exitosamente");
      setShowApertura(false);
      setMontoInicialInput("");
      setNotasTurnoInput("");
      loadTurno();
    } catch {
      setSaving(false);
      toast("Error de conexión", "err");
    }
  }

  async function handleCerrarTurno(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/caja/turno", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efectivo_real: efectivoRealInput, notas: notasTurnoInput }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) return toast(data.error, "err");
      toast("Arqueo y cierre de caja registrado");
      setShowCierre(false);
      setEfectivoRealInput("");
      setNotasTurnoInput("");
      loadTurno();
    } catch {
      setSaving(false);
      toast("Error de conexión", "err");
    }
  }

  async function confirmar(_pedido, pago) {
    if (pago?.refreshOnly) {
      load();
      return;
    }
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
      {/* Barra de Estado de Caja */}
      <div className="mb-6 rounded-2xl bg-paper p-4 border border-line flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={clsx("p-2.5 rounded-xl", turno ? "bg-moss/10 text-moss" : "bg-wine/10 text-wine")}>
            {turno ? <Unlock size={20} /> : <Lock size={20} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">
                {turno ? `Turno Abierto (${turno.usuario_apertura_nombre})` : "Caja Cerrada"}
              </span>
              <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", turno ? "bg-moss/20 text-moss" : "bg-wine/20 text-wine")}>
                {turno ? "Activo" : "Sin Apertura"}
              </span>
            </div>
            {turno ? (
              <p className="text-xs text-mute mt-0.5">
                Fondo Inicial: <span className="font-medium text-ink">{fmt.money(turno.monto_inicial)}</span> · Ventas Efectivo: <span className="font-medium text-ink">{fmt.money(turno.total_ventas_efectivo)}</span> · Ventas Tarjeta: <span className="font-medium text-ink">{fmt.money(turno.total_ventas_tarjeta)}</span>
              </p>
            ) : (
              <p className="text-xs text-mute mt-0.5">Debe abrir caja para iniciar operaciones del día.</p>
            )}
          </div>
        </div>

        <div>
          {turno ? (
            <button onClick={() => { loadTurno(); setShowCierre(true); }} className="btn-primary bg-wine hover:bg-wine/90 text-xs flex items-center gap-2">
              <Receipt size={14} /> Realizar Arqueo / Cierre de Caja
            </button>
          ) : (
            <button onClick={() => setShowApertura(true)} className="btn-primary text-xs flex items-center gap-2">
              <DollarSign size={14} /> Apertura de Caja
            </button>
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
          <Block title="Comer aquí" items={locales} onCobrar={setCobrar} turnoAbierto={!!turno} />
          <Block title="Para llevar" items={llevar} onCobrar={setCobrar} turnoAbierto={!!turno} />
        </section>
      </div>

      {/* Modal Apertura de Caja */}
      {showApertura && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <form onSubmit={handleAbrirTurno} className="card w-full max-w-sm p-5 space-y-4">
            <h3 className="font-display text-lg flex items-center gap-2">
              <DollarSign size={20} className="text-moss" /> Apertura de Caja
            </h3>
            <p className="text-xs text-mute">Ingrese el monto en efectivo con el que se inicia el turno en la caja registradora.</p>
            <div>
              <label className="block text-xs font-medium text-mute">Monto Inicial ($ Efectivo)</label>
              <input
                autoFocus
                type="number"
                step="0.01"
                min="0"
                required
                className="input mt-1 text-base font-semibold"
                placeholder="50.00"
                value={montoInicialInput}
                onChange={(e) => setMontoInicialInput(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-mute">Notas / Observaciones (Opcional)</label>
              <input
                type="text"
                className="input mt-1 text-xs"
                placeholder="Ej. Cambio de billetes de $20..."
                value={notasTurnoInput}
                onChange={(e) => setNotasTurnoInput(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowApertura(false)} className="btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Guardando..." : "Abrir Turno"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Cierre de Caja / Arqueo */}
      {showCierre && turno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <form onSubmit={handleCerrarTurno} className="card w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg flex items-center gap-2 text-wine">
              <Receipt size={20} /> Arqueo y Cierre de Caja
            </h3>

            <div className="rounded-xl bg-paper p-3 space-y-2 text-xs border border-line">
              <div className="flex justify-between">
                <span className="text-mute">Monto Inicial en Fondo:</span>
                <span className="font-semibold">{fmt.money(turno.monto_inicial)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mute">(+) Ventas en Efectivo:</span>
                <span className="font-semibold text-moss">{fmt.money(turno.total_ventas_efectivo)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-2 font-bold text-sm">
                <span>(=) Efectivo Esperado en Caja:</span>
                <span className="text-ink">{fmt.money(turno.efectivo_esperado)}</span>
              </div>
              <div className="flex justify-between text-mute pt-1 border-t border-dashed border-line">
                <span>Ventas en Tarjeta (Informativo):</span>
                <span className="font-semibold text-ink">{fmt.money(turno.total_ventas_tarjeta)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink">Conteo Físico de Efectivo Real en Caja</label>
              <input
                autoFocus
                type="number"
                step="0.01"
                min="0"
                required
                className="input mt-1 text-lg font-bold"
                placeholder="0.00"
                value={efectivoRealInput}
                onChange={(e) => setEfectivoRealInput(e.target.value)}
              />
            </div>

            {efectivoRealInput !== "" && !isNaN(parseFloat(efectivoRealInput)) && (
              <div className={clsx(
                "p-3 rounded-xl border text-xs flex items-center justify-between",
                (parseFloat(efectivoRealInput) - turno.efectivo_esperado) === 0
                  ? "bg-moss/10 border-moss/30 text-moss"
                  : (parseFloat(efectivoRealInput) - turno.efectivo_esperado) > 0
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-700"
                  : "bg-wine/10 border-wine/30 text-wine"
              )}>
                <div className="flex items-center gap-2">
                  {(parseFloat(efectivoRealInput) - turno.efectivo_esperado) === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span className="font-medium">
                    {(parseFloat(efectivoRealInput) - turno.efectivo_esperado) === 0
                      ? "Caja cuadrada exactamente"
                      : (parseFloat(efectivoRealInput) - turno.efectivo_esperado) > 0
                      ? "Sobrante de dinero"
                      : "Faltante de dinero"}
                  </span>
                </div>
                <span className="font-bold text-sm">
                  {fmt.money(Math.abs(parseFloat(efectivoRealInput) - turno.efectivo_esperado))}
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-mute">Notas de Arqueo / Cierre</label>
              <input
                type="text"
                className="input mt-1 text-xs"
                placeholder="Observaciones de cierre..."
                value={notasTurnoInput}
                onChange={(e) => setNotasTurnoInput(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowCierre(false)} className="btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary bg-wine flex-1">
                {saving ? "Cerrando..." : "Confirmar Cierre"}
              </button>
            </div>
          </form>
        </div>
      )}

      {cobrar && (
        <CobroModal pedido={cobrar} onClose={() => setCobrar(null)} onConfirm={confirmar} saving={saving} />
      )}
    </Shell>
  );
}

function Block({ title, items, onCobrar, turnoAbierto }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-mute">{title}</h2>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-mute">Sin pedidos abiertos.</p>}
        {items.map((p) => {
          const ok = ready(p);
          const activeDets = (p.detalles || []).filter((d) => d.estado_cocina !== "cancelado");
          const cocina = activeDets.filter((d) => d.estado_cocina !== "entregado").length;
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
              <button disabled={!ok || !turnoAbierto} onClick={() => onCobrar(p)} className="btn-primary text-xs">
                {!turnoAbierto ? "Abra caja primero" : "Cobrar"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
