"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { useRealtime } from "@/hooks/useRealtime";
import { fmt } from "@/lib/formatters";
import clsx from "clsx";
import { printTicket } from "@/lib/printTicket";
import { useToast } from "@/components/Toast";

export default function HistorialPage() {
  const [pedidos, setPedidos] = useState([]);
  const [estado, setEstado] = useState("pagada"); // "pagada" | "cancelada"
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const res = await fetch(`/api/pedidos?estado=${estado}`);
    const data = await res.json();
    setPedidos(data.pedidos || []);
  }, [estado]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(load);

  // Filter orders by search query
  const filtered = pedidos.filter((p) => {
    const q = search.toLowerCase();
    const nombre = (p.nombre_control || "").toLowerCase();
    const mesa = p.mesa_numero ? `mesa ${p.mesa_numero}` : "llevar";
    const mesero = (p.mesero_nombre || "").toLowerCase();
    return nombre.includes(q) || mesa.includes(q) || mesero.includes(q);
  });

  const selectedPedido = pedidos.find((p) => p.id === selectedId) || filtered[0];

  return (
    <Shell title="Historial de Pedidos">
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left Side: Filter and List */}
        <section className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEstado("pagada");
                setSelectedId(null);
              }}
              className={clsx(
                "flex-1 rounded-xl py-2 text-xs font-semibold border transition",
                estado === "pagada"
                  ? "bg-ink text-paper border-ink"
                  : "bg-white text-mute border-line hover:text-ink"
              )}
            >
              Cobrados
            </button>
            <button
              onClick={() => {
                setEstado("cancelada");
                setSelectedId(null);
              }}
              className={clsx(
                "flex-1 rounded-xl py-2 text-xs font-semibold border transition",
                estado === "cancelada"
                  ? "bg-ink text-paper border-ink"
                  : "bg-white text-mute border-line hover:text-ink"
              )}
            >
              Cancelados
            </button>
          </div>

          <input
            className="input w-full"
            placeholder="Buscar por cliente, mesa o mesero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-270px)] pr-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-mute text-center py-6">No se encontraron pedidos.</p>
            ) : (
              filtered.map((p) => {
                const active = selectedPedido?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={clsx(
                      "w-full card p-4 text-left transition hover:bg-stone-50",
                      active ? "ring-2 ring-ink bg-stone-50" : ""
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">
                        {p.tipo_pedido === "local" ? `Mesa ${p.mesa_numero}` : "Para llevar"}
                      </span>
                      <span className="text-xs text-mute">{fmt.time(p.fecha)}</span>
                    </div>
                    <p className="text-sm text-mute truncate mt-1">{p.nombre_control}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-xs">
                      <span className="text-mute capitalize">Por: {p.mesero_nombre}</span>
                      <span className="font-medium text-sm text-ink">{fmt.money(p.total)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right Side: Detail Receipt */}
        <section>
          {selectedPedido ? (
            <div className="card p-6 md:p-8 space-y-6">
              {/* Header */}
              <div className="border-b border-line pb-4 flex flex-wrap justify-between items-start gap-4">
                <div>
                  <span className={clsx(
                    "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider mb-2",
                    selectedPedido.estado_pago === "pagada" ? "bg-moss/10 text-moss" : "bg-wine/10 text-wine"
                  )}>
                    Pedido {selectedPedido.estado_pago === "pagada" ? "Cobrado" : "Cancelado"}
                  </span>
                  <h2 className="font-display text-2xl">
                    {selectedPedido.tipo_pedido === "local" ? `Mesa ${selectedPedido.mesa_numero}` : "Para llevar"}
                  </h2>
                  <p className="text-sm text-mute mt-1">Cliente: <span className="font-medium text-ink">{selectedPedido.nombre_control}</span></p>
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <button
                    onClick={() => printTicket(selectedPedido.id)}
                    className="btn-clay text-xs flex items-center gap-1.5 px-3 py-1.5 font-semibold active:scale-95 transition-transform"
                  >
                    Imprimir Ticket
                  </button>
                  <div className="text-xs text-mute space-y-1">
                    <p>Fecha: <span className="font-medium text-ink">{fmt.date(selectedPedido.fecha)}</span></p>
                    <p>Mesero: <span className="font-medium text-ink">{selectedPedido.mesero_nombre}</span></p>
                    <p>ID: <span className="font-mono text-[10px]">{selectedPedido.id}</span></p>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <p className="text-xs uppercase tracking-wider text-mute mb-3 font-semibold">Detalle de Consumo</p>
                <div className="border border-line rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 border-b border-line text-left text-xs text-mute">
                        <th className="px-4 py-2.5">Cant.</th>
                        <th className="px-4 py-2.5">Descripción</th>
                        <th className="px-4 py-2.5">Precio Unit.</th>
                        <th className="px-4 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPedido.detalles.map((d) => (
                        <tr key={d.id} className="border-b border-line/60 last:border-0">
                          <td className="px-4 py-3 font-mono text-xs">{d.cantidad}</td>
                          <td className="px-4 py-3">
                            <span className="font-medium">{d.producto_nombre}</span>
                            {d.variante && <span className="ml-2 text-xs text-mute">({d.variante})</span>}
                            {d.notas && <p className="text-xs text-wine mt-0.5">Nota: {d.notas}</p>}
                          </td>
                          <td className="px-4 py-3 text-mute font-mono text-xs">{fmt.money(d.precio_unitario)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                            {fmt.money(d.precio_unitario * d.cantidad)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary & Payment Info */}
              <div className="border-t border-line pt-4 flex flex-col md:flex-row justify-between items-start gap-4">
                <div className="text-sm space-y-1 text-mute">
                  <p className="font-semibold text-xs uppercase tracking-wider mb-2">Información de Pago</p>
                  {selectedPedido.estado_pago === "pagada" ? (
                    <div className="flex items-center gap-2">
                      <span>Método:</span>
                      <select
                        value={selectedPedido.metodo_pago || "efectivo"}
                        onChange={async (e) => {
                          const newMetodo = e.target.value;
                          let body = { accion: "cambiar_metodo_pago", metodo_pago: newMetodo };
                          if (newMetodo === "mixto") {
                            const efVal = window.prompt(`Total es ${fmt.money(selectedPedido.total)}. ¿Cuánto pagó en Efectivo?`);
                            if (efVal === null) return;
                            const ef = parseFloat(efVal) || 0;
                            const tj = Math.max(0, Number(selectedPedido.total) - ef);
                            body.pago_efectivo = ef;
                            body.pago_tarjeta = tj;
                          }
                          const res = await fetch(`/api/pedidos/${selectedPedido.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body)
                          });
                          const data = await res.json();
                          if (!res.ok) return toast(data.error || "No se pudo cambiar el método de pago", "err");
                          toast("Método de pago actualizado");
                          load();
                        }}
                        className="rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-clay"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="mixto">Mixto (Efectivo + Tarjeta)</option>
                      </select>
                    </div>
                  ) : (
                    <p className="text-xs text-wine capitalize">Estado: {selectedPedido.estado_pago}</p>
                  )}
                  {selectedPedido.estado_pago === "pagada" && selectedPedido.metodo_pago === "mixto" && (
                    <div className="text-xs space-y-0.5 mt-1.5 pl-2 border-l border-line">
                      <p>Efectivo: <span className="font-mono font-medium text-ink">{fmt.money(selectedPedido.pago_efectivo)}</span></p>
                      <p>Tarjeta: <span className="font-mono font-medium text-ink">{fmt.money(selectedPedido.pago_tarjeta)}</span></p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 w-full md:w-64">
                  <div className="flex justify-between w-full text-sm text-mute">
                    <span>Subtotal</span>
                    <span className="font-mono">{fmt.money(selectedPedido.total)}</span>
                  </div>
                  <div className="flex justify-between w-full text-base font-bold text-ink border-t border-line/60 pt-2">
                    <span>Total</span>
                    <span className="font-mono text-lg">{fmt.money(selectedPedido.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center py-20 text-mute">
              <p className="text-sm">Seleccione un pedido para ver su detalle de consumo.</p>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
