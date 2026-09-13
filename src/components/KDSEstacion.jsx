"use client";

import { useCallback, useEffect, useState, useRef } from "react";

import Shell from "@/components/Shell";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/hooks/useAuth";
import { fmt } from "@/lib/formatters";
import { playNotificationSound } from "@/lib/sound";
import clsx from "clsx";
import { Check, Clock, UtensilsCrossed } from "lucide-react";

const COLORES = {
  pupusa: {
    border: "border-amber-400",
    badge: "bg-amber-100 text-amber-900 border border-amber-300",
    titulo: "text-amber-900",
    bgItem: "bg-amber-50/50 border-amber-200",
  },
  panes: {
    border: "border-purple-400",
    badge: "bg-purple-100 text-purple-900 border border-purple-300",
    titulo: "text-purple-900",
    bgItem: "bg-purple-50/50 border-purple-200",
  },
  bebida: {
    border: "border-sky-400",
    badge: "bg-sky-100 text-sky-900 border border-sky-300",
    titulo: "text-sky-900",
    bgItem: "bg-sky-50/50 border-sky-200",
  },
  extra: {
    border: "border-stone-300",
    badge: "bg-stone-100 text-stone-700 border border-stone-300",
    titulo: "text-stone-900",
    bgItem: "bg-stone-50 border-stone-200",
  },
};

const TITULOS = {
  pupusa: "Área 1 · Pupusas",
  panes:  "Área 2 · Panes con Gallina",
  bebida: "Área 3 · Bebidas y Postres",
  extra:  "Área Extras",
};


export default function KDSEstacion({ estacion }) {
  const toast = useToast();
  const { user } = useAuth();
  const esOperativo = ["superadmin", "admin", "gerente", "cocinero"].includes(user?.rol);

  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState({});

  const color = COLORES[estacion] || COLORES.extra;

  const load = useCallback(async () => {
    const res = await fetch(`/api/cocina/estacion/${estacion}`);
    const data = await res.json();
    setPedidos(data.pedidos || []);
  }, [estacion]);

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

  const handleRealtime = useCallback((ev) => {
    debouncedLoad();
    if (
      ev?.table === "detalle_pedidos" &&
      ev?.estado_cocina === "pendiente" &&
      ev?.estacion === estacion
    ) {
      const dedupeKey = `kds_${estacion}_${ev.id_pedido || ev.mesa_numero || ev.nombre_control}`;
      const now = Date.now();
      const last = lastToastRef.current.get(dedupeKey) || 0;
      if (now - last > 4000) {
        lastToastRef.current.set(dedupeKey, now);
        playNotificationSound("cocina");
        const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "");
        toast(`Orden / Adición recibida en ${TITULOS[estacion]}${target ? " — " + target : ""}`);
      }
    }
    if (ev?.table === "estaciones_pedido" && ev?.estacion === estacion) {
      debouncedLoad();
    }
  }, [estacion, debouncedLoad, toast]);

  useRealtime(handleRealtime);


  async function marcarLista(pedidoId) {
    if (!esOperativo) {
      toast("Tu rol actual no permite marcar órdenes como listas en cocina.", "err");
      return;
    }
    setLoading((prev) => ({ ...prev, [pedidoId]: true }));
    try {
      const res = await fetch(`/api/cocina/estacion/${estacion}/lista`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_pedido: pedidoId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Error al marcar lista", "err");
        return;
      }
      toast("Orden marcada como lista");
      load();
    } catch {
      toast("Error de conexión", "err");
    } finally {
      setLoading((prev) => ({ ...prev, [pedidoId]: false }));
    }
  }

  const pendientes = pedidos.filter((p) => !p.estacion_lista);
  const listas = pedidos.filter((p) => p.estacion_lista);

  return (
    <Shell title={TITULOS[estacion]}>
      <div className="space-y-6">
        {/* Sin Órdenes */}
        {pendientes.length === 0 && listas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-stone-400 bg-white border border-line rounded-xl shadow-card">
            <UtensilsCrossed size={40} className="mb-3 text-stone-300" />
            <p className="text-base font-semibold text-stone-700">Sin órdenes pendientes en esta estación</p>
            <p className="text-xs text-stone-500 mt-1">Las nuevas comandas aparecerán automáticamente aquí.</p>
          </div>
        )}

        {/* Órdenes Pendientes */}
        {pendientes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600">
                Órdenes en Preparación ({pendientes.length})
              </h2>
              <span className="text-xs text-stone-500">
                Pulsa "Orden Lista" cuando termines los platillos de tu área
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {pendientes.map((p) => (
                <article
                  key={p.id}
                  className={clsx(
                    "rounded-xl border-2 bg-white p-4 sm:p-5 flex flex-col gap-4 shadow-card",
                    color.border
                  )}
                >
                  {/* Cabecera de la Comanda */}
                  <div className="flex items-start justify-between border-b border-stone-200 pb-3">
                    <div>
                      <p className="text-2xl font-bold text-stone-900 leading-tight">
                        {p.tipo_pedido === "local" ? `Mesa ${p.mesa_numero}` : "Para Llevar"}
                      </p>
                      <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-stone-700">{p.nombre_control}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {fmt.time(p.fecha)}
                        </span>
                        {p.ronda_actual > 1 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            Ronda {p.ronda_actual}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={clsx("text-xs font-semibold px-2 py-1 rounded-md", color.badge)}>
                      {estacion === "pupusa" ? "Pupusas" : estacion === "panes" ? "Panes" : estacion === "bebida" ? "Bebidas" : "Extras"}
                    </span>
                  </div>

                  {/* Nota del pedido si existe */}
                  {p.notas && (
                    <div className="rounded-lg bg-rose-50 border border-rose-300 text-rose-900 px-3 py-2 text-xs font-semibold">
                      Nota de comanda: {p.notas}
                    </div>
                  )}

                  {/* Lista de Platillos para esta estación */}
                  <ul className="space-y-2">
                    {(p.detalles || []).filter((d) => d.estado_cocina !== "borrador").map((d) => (
                      <li
                        key={d.id}
                        className={clsx(
                          "flex items-start gap-3 rounded-lg px-3 py-2.5 border",
                          d.estado_cocina === "entregado"
                            ? "bg-stone-50 border-stone-200 opacity-60"
                            : color.bgItem
                        )}
                      >
                        <span className="text-2xl font-black text-stone-900 leading-none w-8 text-center shrink-0">
                          {d.cantidad}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold text-stone-900 leading-tight flex items-center gap-2 flex-wrap">
                            <span>{d.producto_nombre}</span>
                            {d.ronda > 1 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 border border-amber-400 uppercase tracking-wide">
                                Adición (R{d.ronda})
                              </span>
                            )}
                          </p>
                          {d.variante && (
                            <p className="text-xs text-stone-600 mt-0.5 font-medium">{d.variante}</p>
                          )}
                          {d.notas && (
                            <p className="text-xs font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 mt-1 inline-block">
                              Nota: {d.notas}
                            </p>
                          )}
                        </div>
                        {d.estado_cocina === "entregado" && (
                          <span className="text-white text-[11px] font-bold self-center bg-emerald-700 px-2.5 py-0.5 rounded uppercase tracking-wider">
                            Listo
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Botón Gigante Sólido de Orden Lista */}
                  <button
                    type="button"
                    disabled={loading[p.id]}
                    onClick={() => marcarLista(p.id)}
                    className={clsx(
                      "mt-auto w-full py-3.5 rounded-lg text-base font-bold uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-2",
                      esOperativo
                        ? "bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 active:scale-95"
                        : "bg-stone-200 text-stone-500 cursor-not-allowed border border-stone-300"
                    )}
                  >
                    <Check size={18} />
                    <span>
                      {loading[p.id]
                        ? "Enviando..."
                        : esOperativo
                        ? "Orden Lista"
                        : "Solo Lectura (Cocina)"}
                    </span>
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Órdenes Completadas / Listas */}
        {listas.length > 0 && (
          <div className="pt-4 border-t border-line">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
              Órdenes Despachadas ({listas.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {listas.map((p) => (
                <article
                  key={p.id}
                  className="rounded-lg border border-stone-200 bg-white p-3 flex items-center justify-between shadow-card opacity-70"
                >
                  <div>
                    <p className="font-semibold text-sm text-stone-900">
                      {p.tipo_pedido === "local" ? `Mesa ${p.mesa_numero}` : "Llevar"} — {p.nombre_control}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Despachada a meseros {p.ts_lista ? `· ${fmt.time(p.ts_lista)}` : ""}
                    </p>
                  </div>
                  <span className="p-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <Check size={16} />
                  </span>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}