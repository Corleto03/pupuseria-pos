"use client";

import { fmt } from "@/lib/formatters";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

export default function CobroModal({ pedido, onClose, onConfirm, saving }) {
  const [monto, setMonto] = useState("");
  const [montoEfectivo, setMontoEfectivo] = useState("");
  const [montoTarjeta, setMontoTarjeta] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [imprimir, setImprimir] = useState(true);
  const total = Number(pedido.total);
  
  const recibido = parseFloat(monto) || 0;
  const vuelto = recibido - total;
  
  const recibidoEfectivo = parseFloat(montoEfectivo) || 0;
  const recibidoTarjeta = parseFloat(montoTarjeta) || 0;

  const valido =
    metodo === "tarjeta" ||
    (metodo === "efectivo" && recibido >= total) ||
    (metodo === "mixto" && (recibidoEfectivo + recibidoTarjeta) >= total);

  const pendientes = useMemo(
    () => (pedido.detalles || []).filter((d) => d.estado_cocina !== "entregado").length,
    [pedido]
  );

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
            <span>{pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"}</span>
            <span>{pedido.nombre_control}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-medium">
            <span>Total</span>
            <span>{fmt.money(total)}</span>
          </div>
        </div>
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
            onClick={() => onConfirm(pedido, { 
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
