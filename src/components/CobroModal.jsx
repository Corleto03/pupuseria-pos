"use client";

import { fmt } from "@/lib/formatters";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

export default function CobroModal({ pedido, onClose, onConfirm, saving }) {
  const [monto, setMonto] = useState("");
  const total = Number(pedido.total);
  const recibido = parseFloat(monto) || 0;
  const vuelto = recibido - total;
  const valido = recibido >= total;
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
        <label className="mt-4 block text-xs text-mute">Efectivo recibido</label>
        <input
          autoFocus
          type="number"
          min={total}
          step="0.25"
          className="input mt-1"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-mute">Vuelto</span>
          <span className={valido ? "text-moss" : "text-mute"}>{monto ? fmt.money(vuelto) : "—"}</span>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button
            disabled={!valido || pendientes > 0 || saving}
            onClick={() => onConfirm(pedido)}
            className="btn-primary flex-1"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
