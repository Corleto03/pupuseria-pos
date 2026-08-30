"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import OrderTicket from "@/components/OrderTicket";
import CobroModal from "@/components/CobroModal";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { fmt } from "@/lib/formatters";
import { printTicket } from "@/lib/printTicket";

export default function LlevarPage() {
  const [pedidos, setPedidos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [activo, setActivo] = useState(null);
  const [nombre, setNombre] = useState("");
  const [cobro, setCobro] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/pedidos?estado=pendiente&tipo=llevar"),
      fetch("/api/productos"),
    ]);
    const da = await a.json();
    const db = await b.json();
    setPedidos(da.pedidos || []);
    setProductos(db.productos || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(load);

  useEffect(() => {
    if (activo) {
      const fresh = pedidos.find((p) => p.id === activo.id);
      if (fresh) setActivo(fresh);
    }
  }, [pedidos, activo?.id]);

  async function crear(e) {
    e.preventDefault();
    const res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo_pedido: "llevar", nombre_control: nombre }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "err");
    setNombre("");
    await load();
    const full = await fetch(`/api/pedidos/${data.pedido.id}`).then((r) => r.json());
    setActivo(full.pedido);
  }

  async function cobrar(_pedido, pago) {
    setSaving(true);
    const res = await fetch(`/api/pedidos/${activo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "cobrar", ...pago }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return toast(data.error, "err");
    if (pago.imprimir) await printTicket(activo.id);
    toast("Pedido cobrado");
    setCobro(false);
    setActivo(null);
    load();
    router.refresh();
  }

  return (
    <Shell title="Para llevar">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form onSubmit={crear} className="flex gap-2">
          <input
            className="input w-64"
            placeholder="Nombre de control"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
          <button className="btn-primary">Nuevo pedido</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {pedidos.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivo(p)}
              className={`rounded-full px-3 py-1.5 text-sm ${activo?.id === p.id ? "bg-ink text-paper" : "bg-white"}`}
            >
              {p.nombre_control} · {fmt.money(p.total)}
            </button>
          ))}
        </div>
      </div>
      {activo && (
        <>
          <div className="mb-4 flex justify-end">
            <button onClick={() => setCobro(true)} className="btn-clay">
              Cobrar
            </button>
          </div>
          <OrderTicket pedido={activo} productos={productos} onChanged={load} toast={toast} />
        </>
      )}
      {cobro && activo && (
        <CobroModal pedido={activo} onClose={() => setCobro(false)} onConfirm={cobrar} saving={saving} />
      )}
    </Shell>
  );
}
