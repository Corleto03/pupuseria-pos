"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { useRealtime } from "@/hooks/useRealtime";
import { fmt } from "@/lib/formatters";
import clsx from "clsx";
import { printTicket } from "@/lib/printTicket";

export default function HistorialPage() {
  const [pedidos, setPedidos] = useState([]);
  const [estado, setEstado] = useState("pagada"); // "pagada" | "cancelada"
  const [fechaFilter, setFechaFilter] = useState("hoy"); // "hoy" | "todos" | "custom"
  const [customDate, setCustomDate] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    const paramFecha = fechaFilter === "custom" ? customDate : fechaFilter;
    if (fechaFilter === "custom" && !customDate) return;
    const res = await fetch(`/api/pedidos?estado=${estado}&fecha=${paramFecha || "hoy"}`);
    const data = await res.json();
    setPedidos(data.pedidos || []);
  }, [estado, fechaFilter, customDate]);

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
          {/* Filter Status: Cobrados vs Cancelados */}
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

          {/* Filter Date: Hoy vs Todos vs DatePicker */}
          <div className="flex flex-col gap-2 bg-stone-50 p-2.5 rounded-2xl border border-line">
            <span className="text-[11px] font-semibold text-mute uppercase tracking-wider">Filtro por fecha:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFechaFilter("hoy");
                  setSelectedId(null);
                }}
                className={clsx(
                  "flex-1 rounded-lg py-1.5 text-xs font-medium border transition",
                  fechaFilter === "hoy"
                    ? "bg-clay text-white border-clay font-semibold"
                    : "bg-white text-mute border-line hover:text-ink"
                )}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  setFechaFilter("todos");
                  setSelectedId(null);
                }}
                className={clsx(
                  "flex-1 rounded-lg py-1.5 text-xs font-medium border transition",
                  fechaFilter === "todos"
                    ? "bg-clay text-white border-clay font-semibold"
                    : "bg-white text-mute border-line hover:text-ink"
                )}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => {
                  setFechaFilter("custom");
                  setSelectedId(null);
                }}
                className={clsx(
                  "flex-1 rounded-lg py-1.5 text-xs font-medium border transition",
                  fechaFilter === "custom"
                    ? "bg-clay text-white border-clay font-semibold"
                    : "bg-white text-mute border-line hover:text-ink"
                )}
              >
                Por Fecha
              </button>
            </div>
            {fechaFilter === "custom" && (
              <input
                type="date"
                className="input w-full mt-1 text-xs"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setSelectedId(null);
                }}
              />
            )}
          </div>

          <input
            className="input w-full"
            placeholder="Buscar por cliente, mesa o mesero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] pr-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-mute text-center py-6">No se encontraron pedidos.</p>
            ) : (
              filtered.map((p) => {
                const active = selectedPedido?.id === p.id;
                const hasUndelivered = (p.detalles || []).some((d) => ["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina));
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
                    {hasUndelivered && (
                      <div className="mt-1.5">
                        <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <span>⚠️</span> Con ítems no entregados
                        </span>
                      </div>
                    )}
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

              {/* Undelivered Warning Banner */}
              {(selectedPedido.detalles || []).some((d) => ["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)) && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs font-medium space-y-1">
                  <p className="font-bold flex items-center gap-1.5 text-rose-900">
                    <span>⚠️ Ítems No Entregados / Anulados en este pedido:</span>
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-700">
                    {selectedPedido.detalles.filter((d) => ["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)).map((d) => (
                      <li key={d.id}>
                        <span className="font-semibold">{d.cantidad}× {d.producto_nombre}</span>
                        {d.variante ? ` (${d.variante})` : ""}
                        {d.destino_servicio === "llevar" ? " [Para llevar]" : ""} — Marcado como no entregado (Descontado {fmt.money(d.precio_unitario * d.cantidad)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
                      {selectedPedido.detalles.map((d) => {
                        const isUndelivered = ["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina);
                        return (
                          <tr key={d.id} className={clsx("border-b border-line/60 last:border-0", isUndelivered && "bg-rose-50/60")}>
                            <td className="px-4 py-3 font-mono text-xs">{d.cantidad}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={clsx("font-medium", isUndelivered && "line-through text-rose-700")}>
                                  {d.producto_nombre}
                                </span>
                                {d.destino_servicio === "llevar" && (
                                  <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.5 rounded border border-amber-200">
                                    Para llevar
                                  </span>
                                )}
                                {isUndelivered && (
                                  <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded">
                                    No Entregado
                                  </span>
                                )}
                              </div>
                              {d.variante && <span className="ml-2 text-xs text-mute">({d.variante})</span>}
                              {d.notas && <p className="text-xs text-wine mt-0.5">Nota: {d.notas}</p>}
                            </td>
                            <td className="px-4 py-3 text-mute font-mono text-xs">{fmt.money(d.precio_unitario)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                              {isUndelivered ? (
                                <span className="text-rose-600 font-bold">$0.00</span>
                              ) : (
                                fmt.money(d.precio_unitario * d.cantidad)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary & Payment Info */}
              <div className="border-t border-line pt-4 flex flex-col md:flex-row justify-between items-start gap-4">
                <div className="text-sm space-y-1 text-mute">
                  <p className="font-semibold text-xs uppercase tracking-wider mb-2">Información de Pago</p>
                  {selectedPedido.estado_pago === "pagada" ? (
                    <div className="space-y-1 text-xs">
                      <p>
                        Método: <span className="font-semibold text-ink capitalize">{selectedPedido.metodo_pago || "efectivo"}</span>
                      </p>
                      {selectedPedido.metodo_pago === "mixto" && (
                        <div className="text-xs space-y-0.5 mt-1.5 pl-2 border-l border-line text-mute">
                          <p>Efectivo: <span className="font-mono font-medium text-ink">{fmt.money(selectedPedido.pago_efectivo)}</span></p>
                          <p>Tarjeta: <span className="font-mono font-medium text-ink">{fmt.money(selectedPedido.pago_tarjeta)}</span></p>
                        </div>
                      )}
                      {Number(selectedPedido.monto_recibido || 0) > 0 && (
                        <p>Monto Recibido: <span className="font-mono font-medium text-ink">{fmt.money(selectedPedido.monto_recibido)}</span></p>
                      )}
                      {Number(selectedPedido.vuelto || 0) > 0 && (
                        <p>Vuelto Entregado: <span className="font-mono font-bold text-moss">{fmt.money(selectedPedido.vuelto)}</span></p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-wine capitalize font-semibold">Estado: {selectedPedido.estado_pago}</p>
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
