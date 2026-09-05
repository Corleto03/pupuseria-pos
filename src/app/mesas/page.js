"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { fmt } from "@/lib/formatters";
import clsx from "clsx";
import { Utensils, Plus } from "lucide-react";
import { playNotificationSound } from "@/lib/sound";

export default function MesasPage() {
  const [mesas, setMesas] = useState([]);
  const [open, setOpen] = useState(null);
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingTable, setAddingTable] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/mesas");
    const data = await res.json();
    setMesas(data.mesas || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRealtime = useCallback((ev) => {
    load();
    if (ev?.table === "detalle_pedidos" && ev?.estado_cocina === "preparacion") {
      playNotificationSound("mesero");
      const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "Salón");
      toast(`Cocina inició preparación (${target})`);
    } else if (ev?.table === "detalle_pedidos" && ev?.estado_cocina === "entregado") {
      playNotificationSound("mesero");
      const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "Salón");
      toast(`Platillo listo en ${target}`);
    } else if (ev?.table === "pedidos" && ev?.estado_pago === "pagada") {
      const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "Pedido");
      toast(`${target} fue cobrada en Caja`);
    }
  }, [load, toast]);

  useRealtime(handleRealtime);

  async function crearMesa() {
    setAddingTable(true);
    try {
      const res = await fetch("/api/mesas", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al agregar mesa");
      toast(`Mesa ${data.mesa.numero} creada exitosamente`);
      load();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setAddingTable(false);
    }
  }

  async function abrir(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_pedido: "local",
        id_mesa: open.id,
        nombre_control: nombre,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast(data.error, "err");
      return;
    }
    setOpen(null);
    setNombre("");
    router.push(`/mesas/${open.id}?pedido=${data.pedido.id}`);
  }

  return (
    <Shell
      title="Mesas"
      actions={
        <button
          onClick={crearMesa}
          disabled={addingTable}
          className="btn-primary text-xs flex items-center gap-1.5 py-2 px-3.5 bg-ink text-paper hover:bg-stone-800 rounded-xl transition"
        >
          <Plus size={16} />
          {addingTable ? "Agregando..." : "Agregar Mesa"}
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {mesas.map((m) => {
          const ocupada = m.estado === "ocupada";
          return (
            <button
              key={m.id}
              onClick={() => {
                if (ocupada && m.pedido_id) router.push(`/mesas/${m.id}?pedido=${m.pedido_id}`);
                else setOpen(m);
              }}
              className="card group p-5 text-left transition hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <span className="font-display text-3xl">Mesa {m.numero}</span>
                <span
                  className={clsx(
                    "h-3 w-3 rounded-full",
                    ocupada ? "bg-wine" : "bg-moss"
                  )}
                />
              </div>
              <div className="flex items-center gap-2 mt-4 text-mute group-hover:text-ink transition-colors">
                <Utensils size={18} className={ocupada ? "text-wine" : "text-moss"} />
                <span className="text-xs font-semibold truncate">
                  {ocupada ? m.nombre_control : "Comedor"}
                </span>
              </div>
              <p className={clsx("mt-2 text-sm font-medium", ocupada ? "text-wine" : "text-moss")}>
                {ocupada ? `Ocupada · ${fmt.money(m.total)}` : "Disponible"}
              </p>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <form onSubmit={abrir} className="card w-full max-w-sm p-6">
            <h3 className="font-display text-xl">Abrir mesa {open.numero}</h3>
            <p className="mt-1 text-sm text-mute">Nombre de control del pedido</p>
            <input
              autoFocus
              className="input mt-4"
              placeholder="Familia Pérez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setOpen(null)} className="btn-ghost flex-1">
                Cancelar
              </button>
              <button disabled={saving || !nombre.trim()} className="btn-primary flex-1">
                Abrir
              </button>
            </div>
          </form>
        </div>
      )}
    </Shell>
  );
}
