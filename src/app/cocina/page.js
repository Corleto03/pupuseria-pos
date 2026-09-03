"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { ESTADO_COCINA, fmt } from "@/lib/formatters";
import clsx from "clsx";

function groupByEstado(detalles) {
  const map = {
    pendiente: new Map(),
    preparacion: new Map(),
    entregado: new Map(),
  };
  for (const d of detalles) {
    if (!map[d.estado_cocina]) continue;
    const key = `${d.id_producto}_${d.variante || ''}_${d.destino_servicio || ''}_${d.notas || ''}_${d.precio_unitario}`;
    if (map[d.estado_cocina].has(key)) {
      const existing = map[d.estado_cocina].get(key);
      existing.cantidad += d.cantidad;
    } else {
      map[d.estado_cocina].set(key, { ...d });
    }
  }
  return {
    pendiente: Array.from(map.pendiente.values()),
    preparacion: Array.from(map.preparacion.values()),
    entregado: Array.from(map.entregado.values()),
  };
}

export default function CocinaPage() {
  const toast = useToast();
  const [pedidos, setPedidos] = useState([]);
  const [selectedItems, setSelectedItems] = useState({}); // { [detalleId]: boolean }
  const [activeSplit, setActiveSplit] = useState(null); // detalleId
  const [splitQty, setSplitQty] = useState(1);

  const load = useCallback(async () => {
    const res = await fetch("/api/cocina");
    const data = await res.json();
    setPedidos(data.pedidos || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(load);

  async function avanzar(pedidoId, d) {
    const next = ESTADO_COCINA[d.estado_cocina]?.next;
    if (!next) return;
    await fetch(`/api/pedidos/${pedidoId}/items/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_cocina: next }),
    });
    load();
  }

  function toggleSelect(detalleId) {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[detalleId]) {
        delete next[detalleId];
      } else {
        next[detalleId] = true;
      }
      return next;
    });
  }

  async function ejecutarBulk(pedidoId, itemsToAdvance, colKey) {
    const next = colKey === "pendiente" ? "preparacion" : "entregado";
    await Promise.all(
      itemsToAdvance.map((d) =>
        fetch(`/api/pedidos/${pedidoId}/items/${d.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado_cocina: next }),
        })
      )
    );
    const updated = { ...selectedItems };
    itemsToAdvance.forEach((d) => delete updated[d.id]);
    setSelectedItems(updated);
    load();
  }

  async function confirmarAvanzar(pedidoId, d, qty) {
    const next = ESTADO_COCINA[d.estado_cocina]?.next;
    if (!next) return;
    await fetch(`/api/pedidos/${pedidoId}/items/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_cocina: next, cantidad: qty }),
    });
    setActiveSplit(null);
    load();
  }

  function handleItemClick(pedidoId, d) {
    if (d.estado_cocina === "entregado") return;
    if (d.cantidad > 1) {
      setActiveSplit(d.id);
      setSplitQty(1);
    } else {
      avanzar(pedidoId, d);
    }
  }

  const cols = [
    { key: "pendiente", title: "Pendiente" },
    { key: "preparacion", title: "En preparación" },
    { key: "entregado", title: "Entregado · pendiente de cobro" },
  ];

  return (
    <Shell title="Cocina" dark>
      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 lg:gap-4 pb-4">
        {cols.map((col) => (
          <div key={col.key} className="flex-1">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-stone-500">{col.title}</h2>
            <div className="space-y-4 lg:space-y-3">
              {pedidos.map((p) => {
                const g = groupByEstado(p.detalles || []);
                const items = g[col.key];
                if (!items.length) return null;

                const selectedInCard = items.filter((d) => selectedItems[d.id]);
                const showBulk = selectedInCard.length > 0;

                return (
                  <article key={`${p.id}-${col.key}`} className="rounded-2xl border border-white/10 bg-[#1c1b18] p-4">
                    <div className="mb-3 flex items-baseline justify-between">
                      <p className="font-display text-lg text-stone-100">
                        {p.tipo_pedido === "local" ? `Mesa ${p.mesa_numero}` : "Llevar"}
                      </p>
                      <p className="text-xs text-stone-500">
                        {p.nombre_control} · {fmt.time(p.fecha)}
                      </p>
                    </div>
                    {p.notas && (
                      <div className="mb-3 bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl p-2.5 text-xs font-semibold">
                        Nota pedido: {p.notas}
                      </div>
                    )}
                    <div className="space-y-2">
                      {items.map((d) => {
                        const isSelected = selectedItems[d.id] || false;
                        return (
                          <div
                            key={d.id}
                            className={clsx(
                              "group flex items-stretch rounded-xl border border-transparent overflow-hidden",
                              col.key === "pendiente" && "bg-amber-500/15 focus-within:bg-amber-500/25",
                              col.key === "preparacion" && "bg-sky-500/15 focus-within:bg-sky-500/25",
                              col.key === "entregado" && "bg-emerald-500/10"
                            )}
                          >
                            {col.key !== "entregado" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelect(d.id);
                                }}
                                className={clsx(
                                  "flex items-center justify-center px-3.5 border-r border-white/5 text-stone-400 hover:text-white transition",
                                  isSelected ? "bg-white/10 text-white" : ""
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="h-4 w-4 rounded border-white/20 bg-stone-900 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                              </button>
                            )}

                            {/* Main content */}
                            <div className="flex-1 p-3.5">
                              {col.key !== "entregado" && activeSplit === d.id ? (
                                <div className="flex flex-col gap-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-stone-400">
                                      Cantidad a {col.key === "pendiente" ? "preparar" : "entregar"}:
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSplitQty((q) => Math.max(1, q - 1))}
                                        className="h-10 w-10 md:h-8 md:w-8 rounded-lg bg-white/10 flex items-center justify-center font-bold hover:bg-white/20 text-stone-50 active:scale-95 transition-transform"
                                      >
                                        -
                                      </button>
                                      <span className="w-8 text-center text-base md:text-sm font-medium text-stone-50">
                                        {splitQty}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setSplitQty((q) => Math.min(d.cantidad, q + 1))}
                                        className="h-10 w-10 md:h-8 md:w-8 rounded-lg bg-white/10 flex items-center justify-center font-bold hover:bg-white/20 text-stone-50 active:scale-95 transition-transform"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 md:gap-1.5 text-sm md:text-xs">
                                    <button
                                      type="button"
                                      onClick={() => confirmarAvanzar(p.id, d, splitQty)}
                                      className="flex-1 bg-stone-100 text-stone-950 font-semibold py-2.5 md:py-1.5 rounded-lg hover:bg-stone-200 transition active:scale-95"
                                    >
                                      {col.key === "pendiente" ? "Preparar" : "Entregar"} {splitQty}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => confirmarAvanzar(p.id, d, d.cantidad)}
                                      className="flex-1 bg-white/10 text-stone-300 font-semibold py-2.5 md:py-1.5 rounded-lg hover:bg-white/20 transition active:scale-95"
                                    >
                                      Todo ({d.cantidad})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setActiveSplit(null)}
                                      className="px-4 md:px-3 bg-stone-800 text-stone-400 py-2.5 md:py-1.5 rounded-lg hover:bg-stone-700 transition active:scale-95"
                                    >
                                      X
                                    </button>
                                  </div>
                                </div>
                              ) : col.key !== "entregado" ? (
                                <button
                                  type="button"
                                  onClick={() => handleItemClick(p.id, d)}
                                  className="w-full text-left flex items-center justify-between min-h-[44px] py-1"
                                >
                                  <span>
                                    <span className="block text-base font-medium text-stone-50">
                                      {d.cantidad}× {d.producto_nombre}
                                    </span>
                                    <span className="block text-xs text-stone-400">
                                      {[d.variante, d.destino_servicio === "llevar" ? "Para llevar" : "Comer aquí"].filter(Boolean).join(" · ")}
                                    </span>
                                    {d.notas && (
                                      <span className="mt-1 block text-xs font-semibold text-amber-300">
                                        Nota: {d.notas}
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[11px] uppercase tracking-wide text-stone-400 opacity-60 group-hover:opacity-100 transition">
                                    Tocar
                                  </span>
                                </button>
                              ) : (
                                <div className="w-full text-left flex items-center justify-between min-h-[44px] py-1 cursor-default">
                                  <span>
                                    <span className="block text-base font-medium text-stone-50">
                                      {d.cantidad}× {d.producto_nombre}
                                    </span>
                                    <span className="block text-xs text-stone-400">
                                      {[d.variante, d.destino_servicio === "llevar" ? "Para llevar" : "Comer aquí"].filter(Boolean).join(" · ")}
                                    </span>
                                    {d.notas && (
                                      <span className="mt-1 block text-xs font-semibold text-amber-300">
                                        Nota: {d.notas}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {showBulk && (
                      <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => ejecutarBulk(p.id, selectedInCard, col.key)}
                          className={clsx(
                            "flex-1 text-center py-2 px-3 rounded-xl text-xs font-semibold text-stone-950 transition min-w-[120px]",
                            col.key === "pendiente" ? "bg-amber-400 hover:bg-amber-300" : "bg-sky-400 hover:bg-sky-300"
                          )}
                        >
                          {col.key === "pendiente" ? "Preparar" : "Entregar"} seleccionados ({selectedInCard.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...selectedItems };
                            items.forEach((d) => delete updated[d.id]);
                            setSelectedItems(updated);
                          }}
                          className="px-3 bg-stone-800 hover:bg-stone-700 rounded-xl text-xs text-stone-400 font-medium transition"
                        >
                          Deseleccionar
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
