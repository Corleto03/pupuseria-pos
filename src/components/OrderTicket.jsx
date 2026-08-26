"use client";

import { useMemo, useState } from "react";
import { MASAS, fmt } from "@/lib/formatters";
import { Minus, Plus, Trash2, X, ShoppingBag } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import clsx from "clsx";

export default function OrderTicket({ pedido, productos, onChanged, toast }) {
  const [masa, setMasa] = useState("Maíz");
  const [destino, setDestino] = useState(pedido.tipo_pedido === "llevar" ? "llevar" : "local");
  const [tab, setTab] = useState("pupusa");
  const [saving, setSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  const cartItemCount = (pedido.detalles || []).reduce((acc, d) => acc + d.cantidad, 0);

  const byCat = useMemo(() => {
    const g = { pupusa: [], bebida: [], extra: [] };
    for (const p of productos) (g[p.categoria] || g.extra).push(p);
    return g;
  }, [productos]);

  async function add(prod) {
    setSaving(true);
    const res = await fetch(`/api/pedidos/${pedido.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_producto: prod.id,
        cantidad: 1,
        variante: prod.categoria === "pupusa" ? masa : null,
        destino_servicio: destino,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return toast(data.error, "err");
    onChanged();
  }

  async function patchItem(detalleId, body) {
    const res = await fetch(`/api/pedidos/${pedido.id}/items/${detalleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "err");
    onChanged();
  }

  async function remove(detalleId) {
    const res = await fetch(`/api/pedidos/${pedido.id}/items/${detalleId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error, "err");
    onChanged();
  }

  function handlePedirCancelar() {
    const hasItemsInPrep = (pedido.detalles || []).some((d) => ["preparacion", "entregado"].includes(d.estado_cocina));
    if (hasItemsInPrep) {
      return toast("No se puede cancelar: hay productos en preparación o entregados", "err");
    }
    setShowCancelModal(true);
  }

  async function ejecutarCancelarPedido() {
    setSaving(true);
    const res = await fetch(`/api/pedidos/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "cancelar" }),
    });
    const data = await res.json();
    setSaving(false);
    
    if (!res.ok) return toast(data.error || "No se pudo cancelar el pedido", "err");
    toast("Pedido cancelado y mesa liberada");
    onChanged();
    
    if (pedido.tipo_pedido === "local") {
      window.location.href = "/mesas";
    } else {
      window.location.href = "/llevar";
    }
  }

  async function enviarACocina() {
    setSaving(true);
    const res = await fetch(`/api/pedidos/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "enviar_cocina" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return toast(data.error, "err");
    toast(`${data.enviados} platillo(s) enviado(s) a cocina`);
    onChanged();
  }


  const tabs = [
    { id: "pupusa", label: "Pupusas" },
    { id: "bebida", label: "Bebidas" },
    { id: "extra", label: "Extras" },
  ];

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[1fr_340px] gap-6 pb-24 lg:pb-0 relative">
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "rounded-full px-4 py-2 md:py-1.5 text-sm md:font-normal font-medium transition-colors active:scale-95",
                tab === t.id ? "bg-ink text-paper" : "bg-white text-mute border border-line"
              )}
            >
              {t.label}
            </button>
          ))}
          {tab === "pupusa" && (
            <div className="ml-auto flex rounded-full bg-white p-1 border border-line">
              {MASAS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMasa(m)}
                  className={clsx(
                    "rounded-full px-4 py-1.5 md:py-1 text-sm md:text-xs transition-colors active:scale-95",
                    masa === m ? "bg-clay text-white font-medium" : "text-mute"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          {pedido.tipo_pedido === "local" && (
            <div className="flex rounded-full bg-white p-1 border border-line">
              <button onClick={() => setDestino("local")} className={clsx("rounded-full px-3 py-1.5 text-xs", destino === "local" ? "bg-ink text-paper" : "text-mute")}>Comer aquí</button>
              <button onClick={() => setDestino("llevar")} className={clsx("rounded-full px-3 py-1.5 text-xs", destino === "llevar" ? "bg-clay text-white" : "text-mute")}>Para llevar</button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
          {byCat[tab].map((p) => (
            <button
              key={p.id}
              disabled={saving}
              onClick={() => add(p)}
              className="card p-3 md:p-4 text-left transition hover:-translate-y-0.5 active:scale-95 flex flex-col justify-between min-h-[90px]"
            >
              <p className="font-medium text-sm md:text-base leading-tight">{p.especialidad || p.nombre}</p>
              <p className="mt-2 text-sm text-mute font-medium">{fmt.money(p.precio)}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Mobile Overlay for Bottom Sheet Cart */}
      {isMobileCartOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileCartOpen(false)}
        />
      )}

      {/* Cart Aside (Sticky on Desktop, Bottom Sheet on Mobile) */}
      <aside className={clsx(
        "flex flex-col bg-paper lg:card transition-transform duration-300 ease-in-out",
        // Mobile styles: fixed bottom sheet
        "fixed inset-x-0 bottom-0 z-50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] h-[85vh] lg:h-fit",
        // Desktop styles: static card
        "lg:static lg:z-auto lg:rounded-2xl lg:shadow-none lg:border-line lg:p-5 lg:translate-y-0",
        isMobileCartOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0"
      )}>
        
        {/* Mobile Drag Handle & Header */}
        <div className="flex flex-col items-center pt-3 pb-2 px-5 border-b border-line lg:hidden shrink-0 bg-paper rounded-t-3xl">
          <div className="w-12 h-1.5 bg-line rounded-full mb-3" />
          <div className="flex items-center justify-between w-full">
            <div>
              <h2 className="font-display text-xl">{pedido.nombre_control}</h2>
              <p className="text-sm text-mute">
                {pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"}
              </p>
            </div>
            <button onClick={() => setIsMobileCartOpen(false)} className="p-2 bg-black/5 hover:bg-black/10 transition-colors rounded-full text-ink">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:block shrink-0">
          <p className="text-xs uppercase tracking-wide text-mute">Cuenta</p>
          <h2 className="font-display mt-1 text-xl">{pedido.nombre_control}</h2>
          <p className="text-sm text-mute">
            {pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"}
          </p>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-5 lg:p-0 min-h-0">
          <ul className="space-y-4 lg:mt-4 lg:space-y-3">
            {pedido.detalles?.length === 0 && (
              <li className="text-center text-mute py-8 text-sm">
                No hay productos en la orden
              </li>
            )}
            {(pedido.detalles || []).map((d) => {
              const editable = ["borrador", "pendiente"].includes(d.estado_cocina);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line pb-4 lg:pb-3 last:border-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {d.producto_nombre}
                      {d.variante ? ` · ${d.variante}` : ""}
                    </p>
                    <p className="text-xs text-mute">
                      {d.estado_cocina === "borrador" ? "Sin enviar a cocina" : d.estado_cocina === "pendiente" ? "En cocina · aún no iniciada" : d.estado_cocina}
                      {" · "}{d.destino_servicio === "llevar" ? "Para llevar" : "Comer aquí"}
                    </p>
                    {editable && d.variante && (
                      <select
                        aria-label="Masa"
                        value={d.variante}
                        onChange={(e) => patchItem(d.id, { variante: e.target.value })}
                        className="mt-1 rounded border border-line bg-white px-1.5 py-1 text-[11px] text-mute"
                      >
                        {MASAS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    )}
                    {pedido.tipo_pedido === "local" && (
                      <select
                        aria-label="Destino del platillo"
                        value={d.destino_servicio || pedido.tipo_pedido}
                        onChange={(e) => patchItem(d.id, { destino_servicio: e.target.value })}
                        className="mt-1 ml-1 rounded border border-line bg-white px-1.5 py-1 text-[11px] text-mute"
                      >
                        <option value="local">Comer aquí</option>
                        <option value="llevar">Para llevar</option>
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 bg-white lg:bg-transparent rounded-xl border border-line lg:border-0 p-1 lg:p-0">
                    <button
                      disabled={!editable}
                      onClick={() =>
                        d.cantidad <= 1 ? remove(d.id) : patchItem(d.id, { cantidad: d.cantidad - 1 })
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-black/5 disabled:opacity-30 active:scale-95 transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{d.cantidad}</span>
                    <button
                      disabled={!editable}
                      onClick={() => patchItem(d.id, { cantidad: d.cantidad + 1 })}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-black/5 disabled:opacity-30 active:scale-95 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                    <div className="w-px h-5 bg-line mx-1 hidden lg:block" />
                    <button
                      disabled={!editable}
                      onClick={() => remove(d.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-wine hover:bg-wine/10 disabled:opacity-30 active:scale-95 transition-colors ml-1 lg:ml-0"
                      title={editable ? "Quitar" : "Ya comenzó la preparación"}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Cart Footer */}
        <div className="shrink-0 p-5 lg:p-0 lg:mt-4 bg-paper lg:bg-transparent border-t border-line lg:border-0">
          <div className="flex justify-between font-display text-lg lg:text-base lg:font-medium mb-4 lg:mb-0">
            <span>Total</span>
            <span>{fmt.money(pedido.total)}</span>
          </div>
          {pedido.estado_pago === "pendiente" && (
            <div className="mt-0 space-y-2 lg:mt-4">
              {(pedido.detalles || []).some((d) => d.estado_cocina === "borrador") && (
                <button type="button" disabled={saving} onClick={enviarACocina} className="btn-primary w-full py-3.5 text-sm font-semibold lg:py-2.5 lg:text-xs">
                  Enviar nuevos platillos a cocina
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={handlePedirCancelar}
                className="btn-ghost w-full text-sm lg:text-xs text-wine border border-wine/20 hover:bg-wine/5 rounded-xl py-3.5 lg:py-2.5 font-semibold transition active:scale-95"
              >
                Cancelar Pedido
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Sticky Mobile Floating Button */}
      {!isMobileCartOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-30 lg:hidden pointer-events-none flex justify-center">
          <button 
            onClick={() => setIsMobileCartOpen(true)} 
            className="w-full max-w-sm bg-ink text-paper rounded-2xl p-4 flex items-center justify-between shadow-2xl pointer-events-auto active:scale-95 transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag size={24} className="text-paper/80" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-clay text-white text-[10px] font-bold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center">
                    {cartItemCount}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-start leading-tight">
                <span className="font-semibold text-sm">Ver orden</span>
                <span className="text-xs text-paper/70">
                  {pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"}
                </span>
              </div>
            </div>
            <div className="text-lg font-bold">{fmt.money(pedido.total)}</div>
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={showCancelModal}
        title="¿Cancelar Pedido?"
        message="¿Está seguro de que desea cancelar este pedido? Se liberará la mesa inmediatamente."
        confirmText="Sí, cancelar"
        onConfirm={ejecutarCancelarPedido}
        onClose={() => setShowCancelModal(false)}
      />
    </div>
  );
}
