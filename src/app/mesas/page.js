"use client";

import { useCallback, useEffect, useState, useRef } from "react";

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

  const lastToastRef = useRef(new Map());
  const loadTimeoutRef = useRef(null);

  const debouncedLoad = useCallback(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = setTimeout(() => {
      load();
    }, 250);
  }, [load]);

  const handleRealtime = useCallback(() => {
    debouncedLoad();
  }, [debouncedLoad]);

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">

        {mesas.map((m) => {
          const ocupada = m.estado === "ocupada" || Boolean(m.pedido_id);
          return (
            <button
              key={m.id}
              onClick={() => {
                if (ocupada && m.pedido_id) router.push(`/mesas/${m.id}?pedido=${m.pedido_id}`);
                else setOpen(m);
              }}
              className={clsx(
                "card p-5 text-left transition flex flex-col justify-between min-h-[145px] shadow-card hover:border-stone-400",
                ocupada ? "border-rose-200/80 bg-white" : "border-line bg-white"
              )}
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl font-bold text-stone-900">Mesa {m.numero}</span>
                <span
                  className={clsx(
                    "text-[11px] font-bold px-2.5 py-0.5 rounded text-white tracking-wider uppercase",
                    ocupada ? "bg-rose-700" : "bg-emerald-700"
                  )}
                >
                  {ocupada ? "Ocupada" : "Libre"}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-line/60 flex flex-col justify-between">
                <span className="text-xs font-semibold text-stone-800 truncate">
                  {ocupada ? m.nombre_control : "Lista para abrir"}
                </span>
                <span className={clsx("text-sm font-mono font-bold mt-0.5", ocupada ? "text-stone-900" : "text-stone-400")}>
                  {ocupada ? fmt.money(m.total) : "Disponible"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={abrir} className="w-full max-w-sm p-6 bg-white border border-stone-300 shadow-xl rounded-xl">
            <h3 className="font-semibold text-lg text-stone-900">Abrir mesa {open.numero}</h3>
            <p className="mt-1 text-xs text-stone-500">Nombre de control o referencia del cliente</p>
            <input
              autoFocus
              className="input mt-4 text-sm"
              placeholder="Ej: Familia Pérez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(null);
                  setNombre("");
                }}
                className="btn-secondary flex-1 text-xs py-2"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !nombre.trim()}
                className="btn-primary flex-1 text-xs py-2 font-semibold"
              >
                {saving ? "Abriendo..." : "Abrir Mesa"}
              </button>
            </div>
          </form>
        </div>
      )}
    </Shell>
  );
}
