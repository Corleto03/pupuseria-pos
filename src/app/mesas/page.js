"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { fmt } from "@/lib/formatters";
import clsx from "clsx";

export default function MesasPage() {
  const [mesas, setMesas] = useState([]);
  const [open, setOpen] = useState(null);
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
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
  useRealtime(load);

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
    <Shell title="Mesas">
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
                <span className="font-display text-3xl">{m.numero}</span>
                <span
                  className={clsx(
                    "h-3 w-3 rounded-full",
                    ocupada ? "bg-wine" : "bg-moss"
                  )}
                />
              </div>
              <p className="mt-6 text-sm text-mute">{ocupada ? m.nombre_control : `${m.capacidad} personas`}</p>
              <p className={clsx("mt-1 text-sm font-medium", ocupada ? "text-wine" : "text-moss")}>
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
