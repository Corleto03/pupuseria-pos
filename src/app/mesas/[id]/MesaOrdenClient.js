"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import OrderTicket from "@/components/OrderTicket";
import CobroModal from "@/components/CobroModal";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { printTicket } from "@/lib/printTicket";

export default function MesaOrdenPage() {
  const search = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const pedidoId = search.get("pedido");
  const [pedido, setPedido] = useState(null);
  const [productos, setProductos] = useState([]);
  const [cobro, setCobro] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!pedidoId) return;
    const [a, b] = await Promise.all([fetch(`/api/pedidos/${pedidoId}`), fetch("/api/productos")]);
    const da = await a.json();
    const db = await b.json();
    setPedido(da.pedido);
    setProductos(db.productos || []);
  }, [pedidoId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(load);

  async function cobrar(_pedido, pago) {
    setSaving(true);
    const res = await fetch(`/api/pedidos/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "cobrar", ...pago }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return toast(data.error, "err");
    if (pago.imprimir) await printTicket(pedido.id);
    toast("Mesa cobrada");
    setCobro(false);
    router.push("/mesas");
  }

  return (
    <Shell
      title={pedido ? `Mesa ${pedido.mesa_numero}` : "Mesa"}
      actions={
        pedido && (
          <button onClick={() => setCobro(true)} className="btn-clay">
            Cobrar
          </button>
        )
      }
    >
      {pedido && <OrderTicket pedido={pedido} productos={productos} onChanged={load} toast={toast} />}
      {cobro && pedido && (
        <CobroModal pedido={pedido} onClose={() => setCobro(false)} onConfirm={cobrar} saving={saving} />
      )}
    </Shell>
  );
}
