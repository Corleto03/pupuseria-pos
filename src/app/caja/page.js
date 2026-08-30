"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import CobroModal from "@/components/CobroModal";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { fmt } from "@/lib/formatters";
import clsx from "clsx";
import { printTicket } from "@/lib/printTicket";

function ready(p) {
  const dets = p.detalles || [];
  return dets.length > 0 && dets.every((d) => d.estado_cocina === "entregado");
}

export default function CajaPage() {
  const [mesas, setMesas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [cobrar, setCobrar] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetch("/api/mesas"), fetch("/api/pedidos?estado=pendiente")]);
    const da = await a.json();
    const db = await b.json();
    setMesas(da.mesas || []);
    setPedidos(db.pedidos || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(load);

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
        <CobroModal pedido={cobrar} onClose={() => setCobrar(null)} onConfirm={confirmar} saving={saving} />
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
          const cocina = (p.detalles || []).filter((d) => d.estado_cocina !== "entregado").length;
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
              <button disabled={!ok} onClick={() => onCobrar(p)} className="btn-primary text-xs">
                Cobrar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
