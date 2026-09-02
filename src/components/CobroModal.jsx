"use client";

import { fmt } from "@/lib/formatters";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

export default function CobroModal({ pedido, onClose, onConfirm, saving }) {
  const [localPedido, setLocalPedido] = useState(pedido);
  const [monto, setMonto] = useState("");
  const [montoEfectivo, setMontoEfectivo] = useState("");
  const [montoTarjeta, setMontoTarjeta] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [imprimir, setImprimir] = useState(true);
  const total = Number(localPedido.total);
  
  const recibido = parseFloat(monto) || 0;
  const vuelto = recibido - total;
  
  const recibidoEfectivo = parseFloat(montoEfectivo) || 0;
  const recibidoTarjeta = parseFloat(montoTarjeta) || 0;

  const valido =
    metodo === "tarjeta" ||
    (metodo === "efectivo" && recibido >= total) ||
    (metodo === "mixto" && (recibidoEfectivo + recibidoTarjeta) >= total);

  const [itemToCancel, setItemToCancel] = useState(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [qtyCancel, setQtyCancel] = useState(1);
  const [canceling, setCanceling] = useState(false);

  const pendientes = useMemo(
    () => (localPedido.detalles || []).filter((d) => !["entregado", "cancelado"].includes(d.estado_cocina)).length,
    [localPedido]
  );

  async function handleCancelItem() {
    if (!itemToCancel) return;
    setCanceling(true);
    try {
      const res = await fetch(`/api/pedidos/${localPedido.id}/items/${itemToCancel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado_cocina: "cancelado",
          cantidad: qtyCancel,
          motivo_cancelacion: motivoCancel || "Anulado desde caja por administración",
        }),
      });
      const data = await res.json();
      setCanceling(false);
      if (!res.ok) alert(data.error || "Error al anular ítem");
      else {
        setItemToCancel(null);
        setMotivoCancel("");
        setQtyCancel(1);
        
        // Fetch the fresh updated order
        const resPed = await fetch(`/api/pedidos/${localPedido.id}`);
        const dataPed = await resPed.json();
        if (dataPed.pedido) {
          setLocalPedido(dataPed.pedido);
        }
        
        if (onConfirm) onConfirm(null, { refreshOnly: true });
      }
    } catch {
      setCanceling(false);
      alert("Error de conexión");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="card w-full max-w-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg">Cobrar</h3>
          <button onClick={onClose} className="text-mute hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-1 rounded-xl bg-paper px-3 py-3 text-sm">
          <div className="flex justify-between text-mute">
            <span>{localPedido.tipo_pedido === "local" ? `Mesa ${localPedido.mesa_numero}` : "Para llevar"}</span>
            <span>{localPedido.nombre_control}</span>
          </div>
          <div className="mt-2 max-h-32 overflow-y-auto border-t border-b border-line py-2 space-y-1 text-xs">
            {(localPedido.detalles || []).map((d) => (
              <div key={d.id} className="flex items-center justify-between">
                <span className={d.estado_cocina === "cancelado" ? "line-through text-mute" : ""}>
                  {d.cantidad}x {d.producto_nombre || "Producto"} {d.variante ? `(${d.variante})` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <span className={d.estado_cocina === "cancelado" ? "text-wine" : "font-medium"}>
                    {d.estado_cocina === "cancelado" ? "Anulado" : fmt.money(d.precio_unitario * d.cantidad)}
                  </span>
                  {d.estado_cocina !== "cancelado" && (
                    <button
                      type="button"
                      title="Anular platillo"
                      onClick={() => {
                        setItemToCancel(d);
                        setQtyCancel(d.cantidad);
                      }}
                      className="text-wine text-[10px] underline hover:text-red-700"
                    >
                      Anular
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-1 font-medium">
            <span>Total a pagar</span>
            <span className="text-base text-wine">{fmt.money(total)}</span>
          </div>
        </div>

        {itemToCancel && (
          <div className="mt-3 rounded-lg border border-wine/30 bg-wine/5 p-3 text-xs">
            <p className="font-semibold text-wine">Anular: {itemToCancel.producto_nombre}</p>
            {itemToCancel.cantidad > 1 && (
              <div className="mt-2">
                <label className="block text-mute mb-1">Cantidad a anular:</label>
                <input
                  type="number"
                  min="1"
                  max={itemToCancel.cantidad}
                  className="input bg-white text-xs"
                  value={qtyCancel}
                  onChange={(e) => setQtyCancel(parseInt(e.target.value) || 1)}
                />
              </div>
            )}
            <input
              type="text"
              placeholder="Motivo (ej. Plato agotado, error de entrega)..."
              className="input mt-2 bg-white text-xs"
              value={motivoCancel}
              onChange={(e) => setMotivoCancel(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToCancel(null)}
                className="btn-ghost py-1 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={canceling}
                onClick={handleCancelItem}
                className="btn-primary bg-wine py-1 text-xs"
              >
                {canceling ? "Anulando..." : "Confirmar Anulación"}
              </button>
            </div>
          </div>
        )}

        {pendientes > 0 && (
          <p className="mt-3 text-xs text-wine">Aún hay {pendientes} producto(s) sin entregar. El cobro está bloqueado.</p>
        )}
        <label className="mt-4 block text-xs text-mute">Método de pago</label>
        <select className="input mt-1" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="mixto">Mixto (Efectivo + Tarjeta)</option>
        </select>
        {metodo === "efectivo" && (
          <>
            <label className="mt-4 block text-xs text-mute">Efectivo recibido</label>
            <input autoFocus type="number" min={total} step="0.25" className="input mt-1" value={monto} onChange={(e) => setMonto(e.target.value)} />
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-mute">Vuelto</span>
              <span className={valido ? "text-moss" : "text-mute"}>{monto ? fmt.money(vuelto) : "—"}</span>
            </div>
          </>
        )}
        {metodo === "mixto" && (
          <div className="space-y-3 mt-4">
            <div>
              <label className="block text-xs text-mute">Monto en Efectivo</label>
              <input
                autoFocus
                type="number"
                step="0.01"
                className="input mt-1"
                placeholder="0.00"
                value={montoEfectivo}
                onChange={(e) => setMontoEfectivo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-mute">Monto en Tarjeta</label>
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                placeholder="0.00"
                value={montoTarjeta}
                onChange={(e) => setMontoTarjeta(e.target.value)}
              />
            </div>
            <div className="mt-2 text-xs flex justify-between">
              <span className="text-mute">Total ingresado:</span>
              <span className={recibidoEfectivo + recibidoTarjeta >= total ? "text-moss font-semibold" : "text-wine font-semibold"}>
                {fmt.money(recibidoEfectivo + recibidoTarjeta)} / {fmt.money(total)}
              </span>
            </div>
          </div>
        )}
        <label className="mt-4 flex items-center gap-2 text-xs text-mute"><input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} /> Imprimir ticket al confirmar</label>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button
            disabled={!valido || pendientes > 0 || saving}
            onClick={() => onConfirm(localPedido, { 
              metodo_pago: metodo, 
              pago_efectivo: metodo === "efectivo" ? total : (metodo === "mixto" ? recibidoEfectivo : 0),
              pago_tarjeta: metodo === "tarjeta" ? total : (metodo === "mixto" ? recibidoTarjeta : 0),
              imprimir 
            })}
            className="btn-primary flex-1"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
