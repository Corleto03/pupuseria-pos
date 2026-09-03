"use client";

import { fmt } from "@/lib/formatters";
import { X, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import clsx from "clsx";

export default function CobroModal({ pedido, onClose, onConfirm, saving, userRole }) {
  const [monto, setMonto] = useState("");
  const [montoEfectivo, setMontoEfectivo] = useState("");
  const [montoTarjeta, setMontoTarjeta] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [imprimir, setImprimir] = useState(true);
  const [detallesList, setDetallesList] = useState(pedido.detalles || []);
  const [deletingId, setDeletingId] = useState(null);

  // Custom confirmation modal state for cancellation
  const [anularModal, setAnularModal] = useState({
    isOpen: false,
    item: null,
    cantidad: 1,
  });

  const total = useMemo(() => {
    if (detallesList && detallesList.length > 0) {
      return detallesList.reduce((acc, d) => {
        if (["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)) return acc;
        return acc + (Number(d.precio_unitario ?? d.precio ?? 0) * d.cantidad);
      }, 0);
    }
    return Number(pedido.total) || 0;
  }, [detallesList, pedido.total]);

  const recibido = parseFloat(monto) || 0;
  const vueltoEfectivo = recibido - total;

  const recibidoEfectivo = parseFloat(montoEfectivo) || 0;
  const recibidoTarjeta = parseFloat(montoTarjeta) || 0;
  const totalMixtoIngresado = recibidoEfectivo + recibidoTarjeta;
  const vueltoMixto = Math.max(0, totalMixtoIngresado - total);

  const valido =
    metodo === "tarjeta" ||
    (metodo === "efectivo" && recibido >= total) ||
    (metodo === "mixto" && totalMixtoIngresado >= total);

  const pendientes = useMemo(
    () => detallesList.filter((d) => !["entregado", "no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)).length,
    [detallesList]
  );

  function abrirModalAnular(d) {
    setAnularModal({
      isOpen: true,
      item: d,
      cantidad: 1,
    });
  }

  async function confirmarAnulacion() {
    const { item, cantidad } = anularModal;
    if (!item) return;

    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_cocina: "no_entregado", cantidad }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Error al anular ítem");
        return;
      }

      // Update details list in local state: reduce active quantity or mark as no_entregado
      setDetallesList((prev) => {
        const next = [];
        for (const d of prev) {
          if (d.id === item.id) {
            if (cantidad < d.cantidad) {
              next.push({ ...d, cantidad: d.cantidad - cantidad });
              next.push({ ...d, id: `no_ent_${Date.now()}`, cantidad, estado_cocina: "no_entregado" });
            } else {
              next.push({ ...d, estado_cocina: "no_entregado" });
            }
          } else {
            next.push(d);
          }
        }
        return next;
      });

      // Refrescar desde el backend para sincronía completa
      try {
        const refRes = await fetch(`/api/pedidos/${pedido.id}`);
        if (refRes.ok) {
          const refData = await refRes.json();
          if (refData.pedido?.detalles) {
            setDetallesList(refData.pedido.detalles);
          }
        }
      } catch (e) {
        console.error("Error refreshing order details:", e);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
      setAnularModal({ isOpen: false, item: null, cantidad: 1 });
    }
  }

  const consolidatedDetalles = useMemo(() => {
    if (!detallesList) return [];
    const map = new Map();
    for (const d of detallesList) {
      const nombre = d.producto_nombre || d.producto?.nombre || d.nombre || "";
      const varName = d.variante || "";
      const estado = d.estado_cocina || "";
      const precio = Number(d.precio_unitario ?? d.precio ?? 0);
      const key = `${d.id_producto || nombre}_${varName}_${estado}_${precio}`;
      if (map.has(key)) {
        const item = map.get(key);
        item.cantidad += d.cantidad;
      } else {
        map.set(key, { ...d, producto_nombre: nombre, precio_unitario: precio, cantidad: d.cantidad });
      }
    }
    return Array.from(map.values());
  }, [detallesList]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 sm:p-4 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-4 sm:p-6 max-h-[90vh] flex flex-col overflow-hidden shadow-2xl rounded-2xl">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h3 className="font-display text-lg sm:text-xl font-bold">Cobrar Pedido</h3>
            <p className="text-xs text-mute">
              {pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"} · {pedido.nombre_control}
            </p>
          </div>
          <button onClick={onClose} className="text-mute hover:text-ink p-1 rounded-lg hover:bg-stone-100 transition">
            <X size={20} />
          </button>
        </div>

        {/* Middle Scrollable Section */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {/* Summary Box */}
          <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 border border-line">
            <span className="text-sm font-medium text-mute">Total a Cobrar</span>
            <span className="font-mono text-xl font-bold text-clay">{fmt.money(total)}</span>
          </div>

          {/* Detalle del pedido */}
          {consolidatedDetalles.length > 0 && (
            <div className="rounded-xl bg-stone-50 border border-line p-3">
              <h4 className="text-xs font-semibold text-mute uppercase tracking-wider mb-2">Detalle del pedido</h4>
              <ul className="space-y-2 text-xs max-h-40 overflow-y-auto pr-1">
                {consolidatedDetalles.map((d, i) => {
                  const isNoEntregado = ["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina);
                  return (
                    <li key={d.id || i} className="flex justify-between items-center py-1 border-b border-line/40 last:border-0">
                      <div>
                        <span className={clsx("font-medium block", isNoEntregado ? "line-through text-stone-400" : "text-ink")}>
                          {d.cantidad} × {d.producto_nombre}{d.variante ? ` (${d.variante})` : ""}
                        </span>
                        <span className="text-[10px] text-mute">
                          {isNoEntregado ? "No Entregado (Anulado)" : d.estado_cocina === "entregado" ? "Entregado" : "En cocina (" + d.estado_cocina + ")"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={clsx("font-mono font-medium", isNoEntregado ? "line-through text-stone-400" : "text-ink")}>
                          {isNoEntregado ? "$0.00" : fmt.money(d.precio_unitario * d.cantidad)}
                        </span>
                        {!isNoEntregado && ['superadmin', 'admin'].includes(userRole) && (
                          <button
                            type="button"
                            disabled={deletingId === d.id}
                            onClick={() => abrirModalAnular(d)}
                            title="Anular/Quitar del pedido"
                            className="text-wine hover:bg-wine/10 px-2 py-1 rounded transition text-xs font-semibold flex items-center gap-1 border border-wine/20"
                          >
                            <Trash2 size={13} />
                            <span>Anular</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {pendientes > 0 && (
            <p className="text-xs text-wine font-medium bg-wine/10 p-2.5 rounded-xl border border-wine/20">
              Aún hay {pendientes} producto(s) sin entregar en cocina. Puedes anularlos aquí si no se prepararán.
            </p>
          )}

          <div>
            <label className="block text-xs text-mute font-medium mb-1">Método de pago</label>
            <select className="input w-full" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="mixto">Mixto (Efectivo + Tarjeta)</option>
            </select>
          </div>

          {metodo === "efectivo" && (
            <div className="space-y-2">
              <label className="block text-xs text-mute font-medium">Efectivo recibido</label>
              <input
                autoFocus
                type="number"
                min={total}
                step="0.25"
                className="input w-full"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
              <div className="flex justify-between text-sm pt-1">
                <span className="text-mute font-medium">Vuelto</span>
                <span className={valido ? "text-moss font-bold font-mono text-base" : "text-mute font-mono"}>
                  {monto ? fmt.money(Math.max(0, vueltoEfectivo)) : "—"}
                </span>
              </div>
            </div>
          )}

          {metodo === "mixto" && (
            <div className="space-y-3 bg-stone-50 p-3.5 rounded-xl border border-line">
              <div>
                <label className="block text-xs text-mute font-medium">Monto en Efectivo ($)</label>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  className="input w-full mt-1"
                  placeholder="0.00"
                  value={montoEfectivo}
                  onChange={(e) => setMontoEfectivo(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-mute font-medium">Monto en Tarjeta ($)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input w-full mt-1"
                  placeholder="0.00"
                  value={montoTarjeta}
                  onChange={(e) => setMontoTarjeta(e.target.value)}
                />
              </div>
              <div className="pt-2 border-t border-line/60 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-mute">Total ingresado:</span>
                  <span className={totalMixtoIngresado >= total ? "text-moss font-semibold font-mono" : "text-wine font-semibold font-mono"}>
                    {fmt.money(totalMixtoIngresado)} / {fmt.money(total)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-line/40">
                  <span className="text-ink font-semibold">Vuelto a entregar:</span>
                  <span className={totalMixtoIngresado >= total ? "text-moss font-bold font-mono text-sm" : "text-mute font-mono"}>
                    {totalMixtoIngresado > total ? fmt.money(vueltoMixto) : "$0.00"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-mute cursor-pointer pt-1">
            <input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} className="rounded" /> Imprimir ticket al confirmar
          </label>
        </div>

        {/* Footer Actions - Fixed */}
        <div className="border-t border-line pt-3 flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-xs py-2.5">
            Cancelar
          </button>
          <button
            disabled={!valido || pendientes > 0 || saving}
            onClick={() => {
              const montoRecibidoVal = metodo === "efectivo"
                ? recibido
                : (metodo === "tarjeta" ? total : totalMixtoIngresado);

              const vueltoVal = metodo === "efectivo"
                ? Math.max(0, vueltoEfectivo)
                : (metodo === "mixto" ? vueltoMixto : 0);

              onConfirm(pedido, { 
                metodo_pago: metodo, 
                pago_efectivo: metodo === "efectivo" ? total : (metodo === "mixto" ? recibidoEfectivo : 0),
                pago_tarjeta: metodo === "tarjeta" ? total : (metodo === "mixto" ? recibidoTarjeta : 0),
                monto_recibido: montoRecibidoVal,
                vuelto: vueltoVal,
                imprimir 
              });
            }}
            className="btn-primary flex-1 text-xs py-2.5 font-semibold"
          >
            Confirmar Cobro
          </button>
        </div>
      </div>

      {/* Modal personalizado para Anular con selección de cantidad */}
      {anularModal.isOpen && anularModal.item && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-5 border border-line bg-paper text-ink shadow-2xl rounded-2xl">
            <div className="flex items-center gap-2 mb-2 text-wine font-display text-lg font-semibold">
              <Trash2 size={20} />
              <h3>Anular Platillo</h3>
            </div>
            <p className="text-xs text-mute mb-3">
              ¿Cuántas unidades deseas anular de <strong className="text-ink">{anularModal.item.producto_nombre}</strong>?
            </p>

            {anularModal.item.cantidad > 1 ? (
              <div className="bg-stone-50 p-3.5 rounded-xl border border-line mb-3 space-y-2">
                <div className="flex justify-between text-xs text-mute font-medium">
                  <span>Cantidad disponible:</span>
                  <span className="font-bold text-ink">{anularModal.item.cantidad} unidades</span>
                </div>
                <div className="flex items-center justify-center gap-4 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      setAnularModal((prev) => ({ ...prev, cantidad: Math.max(1, prev.cantidad - 1) }))
                    }
                    className="h-9 w-9 rounded-xl bg-white border border-line flex items-center justify-center text-lg font-bold hover:bg-stone-100 active:scale-95 transition shadow-sm"
                  >
                    -
                  </button>
                  <span className="w-10 text-center text-2xl font-display font-bold text-clay">
                    {anularModal.cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAnularModal((prev) => ({
                        ...prev,
                        cantidad: Math.min(prev.item.cantidad, prev.cantidad + 1),
                      }))
                    }
                    className="h-9 w-9 rounded-xl bg-white border border-line flex items-center justify-center text-lg font-bold hover:bg-stone-100 active:scale-95 transition shadow-sm"
                  >
                    +
                  </button>
                </div>
                <p className="text-[11px] text-center text-mute">
                  Se marcarán {anularModal.cantidad} de {anularModal.item.cantidad} unidades como No Entregado (
                  {fmt.money((anularModal.item.precio_unitario || 0) * anularModal.cantidad)} descontados).
                </p>
              </div>
            ) : (
              <p className="text-xs text-mute bg-stone-50 p-3 rounded-xl border border-line mb-3">
                Se marcará 1 unidad de {anularModal.item.producto_nombre} como No Entregado ({fmt.money(anularModal.item.precio_unitario || 0)} descontado).
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setAnularModal({ isOpen: false, item: null, cantidad: 1 })}
                className="btn-ghost flex-1 text-xs font-semibold py-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingId === anularModal.item.id}
                onClick={confirmarAnulacion}
                className="btn-primary flex-1 bg-wine hover:bg-wine/90 text-white text-xs font-semibold py-2"
              >
                {deletingId === anularModal.item.id
                  ? "Anulando..."
                  : `Anular ${anularModal.cantidad} unidad(es)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
