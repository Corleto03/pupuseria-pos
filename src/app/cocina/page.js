"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { ESTADO_COCINA, fmt } from "@/lib/formatters";
import clsx from "clsx";
import ConfirmModal from "@/components/ConfirmModal";

function groupByEstado(detalles) {
  return {
    pendiente: detalles.filter((d) => d.estado_cocina === "pendiente"),
    preparacion: detalles.filter((d) => d.estado_cocina === "preparacion"),
    entregado: detalles.filter((d) => d.estado_cocina === "entregado"),
  };
}

export default function CocinaPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user && ["superadmin", "admin", "gerente"].includes(user.rol);
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

  // State for admin action modal (No entregado or Retirar, with quantity selection)
  const [adminActionModal, setAdminActionModal] = useState({
    isOpen: false,
    actionType: null, // "no_entregado" | "retirar"
    pedidoId: null,
    detalle: null,
    cantidad: 1,
  });

  function openAdminAction(actionType, pedidoId, d) {
    setAdminActionModal({
      isOpen: true,
      actionType,
      pedidoId,
      detalle: d,
      cantidad: d.cantidad > 1 ? d.cantidad : 1,
    });
  }

  function closeAdminModal() {
    setAdminActionModal({
      isOpen: false,
      actionType: null,
      pedidoId: null,
      detalle: null,
      cantidad: 1,
    });
  }

  async function confirmAdminAction() {
    const { actionType, pedidoId, detalle, cantidad } = adminActionModal;
    if (!detalle) return;

    if (actionType === "no_entregado") {
      const res = await fetch(`/api/pedidos/${pedidoId}/items/${detalle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_cocina: "no_entregado", cantidad }),
      });
      if (!res.ok) {
        const data = await res.json();
        return toast(data.error || "Error al marcar ítem", "err");
      }
      toast(`${cantidad} unidad(es) marcada(s) como No Entregado`);
    }
    closeAdminModal();
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
                              {activeSplit === d.id ? (
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
                              ) : (
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
                                  {col.key !== "entregado" && (
                                    <span className="text-[11px] uppercase tracking-wide text-stone-400 opacity-60 group-hover:opacity-100 transition">
                                      Tocar
                                    </span>
                                  )}
                                </button>
                              )}
                              {isAdmin && (
                                <div className="mt-2 pt-2 border-t border-white/5 flex gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => openAdminAction("no_entregado", p.id, d)}
                                    className="px-2 py-1 bg-red-950/60 hover:bg-red-900 text-red-300 rounded font-medium transition"
                                  >
                                    No Entregado
                                  </button>
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

      {adminActionModal.isOpen && adminActionModal.detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-5 border border-white/10 bg-[#1c1b18] text-stone-100 shadow-2xl rounded-2xl">
            <h3 className="font-display text-lg font-semibold">
              {adminActionModal.actionType === "no_entregado" ? "Marcar como No Entregado" : "Retirar ítem del pedido"}
            </h3>
            <p className="mt-1 text-xs text-stone-400">
              {adminActionModal.detalle.producto_nombre} ({adminActionModal.detalle.cantidad} disponible(s))
            </p>

            {adminActionModal.detalle.cantidad > 1 && (
              <div className="mt-4 flex flex-col gap-2 bg-stone-900/60 p-3 rounded-xl border border-white/5">
                <label className="text-xs text-stone-300 font-medium">Selecciona cuántas unidades procesar:</label>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      setAdminActionModal((prev) => ({ ...prev, cantidad: Math.max(1, prev.cantidad - 1) }))
                    }
                    className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-lg font-bold hover:bg-white/20 active:scale-95 transition"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-xl font-bold text-amber-400">
                    {adminActionModal.cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAdminActionModal((prev) => ({
                        ...prev,
                        cantidad: Math.min(prev.detalle.cantidad, prev.cantidad + 1),
                      }))
                    }
                    className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-lg font-bold hover:bg-white/20 active:scale-95 transition"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-stone-400 leading-relaxed">
              {adminActionModal.actionType === "no_entregado"
                ? `Se marcarán ${adminActionModal.cantidad} de ${adminActionModal.detalle.cantidad} unidad(es) como No Entregado y se descontarán del total a cobrar.`
                : `Se eliminarán ${adminActionModal.cantidad} de ${adminActionModal.detalle.cantidad} unidad(es) del pedido completamente.`}
            </p>

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={closeAdminModal} className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-xl flex-1 transition">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAdminAction}
                className={clsx(
                  "px-4 py-2.5 text-xs font-semibold rounded-xl flex-1 text-white transition active:scale-95",
                  adminActionModal.actionType === "no_entregado" ? "bg-red-600 hover:bg-red-500" : "bg-rose-700 hover:bg-rose-600"
                )}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
