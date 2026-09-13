"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";

import Shell from "@/components/Shell";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/hooks/useAuth";
import { fmt } from "@/lib/formatters";
import clsx from "clsx";
import { playNotificationSound } from "@/lib/sound";
import Link from "next/link";
import { Monitor, CheckCircle2, Clock, UtensilsCrossed, Check } from "lucide-react";

const ESTACIONES = [
  { key: "pupusa", label: "Área 1 · Pupusas", shortLabel: "Área 1", href: "/cocina/pupusas", badgeCls: "bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100" },
  { key: "panes", label: "Área 2 · Panes", shortLabel: "Área 2", href: "/cocina/panes", badgeCls: "bg-purple-50 text-purple-900 border border-purple-300 hover:bg-purple-100" },
  { key: "bebida", label: "Área 3 · Bebidas/Postres", shortLabel: "Área 3", href: "/cocina/bebidas", badgeCls: "bg-sky-50 text-sky-900 border border-sky-300 hover:bg-sky-100" },
];


export default function CocinaMonitorPage() {
  const toast = useToast();
  const { user } = useAuth();
  const esOperativo = ["superadmin", "admin", "gerente", "cocinero"].includes(user?.rol);

  const [pedidos, setPedidos] = useState([]);
  const [filtroEstacion, setFiltroEstacion] = useState("todas");

  const load = useCallback(async () => {
    const res = await fetch("/api/cocina");
    const data = await res.json();
    setPedidos(data.pedidos || []);
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

  const handleRealtime = useCallback((ev) => {
    debouncedLoad();
    if (ev?.table === "detalle_pedidos" && ev?.estado_cocina === "pendiente") {
      const dedupeKey = `comanda_${ev.id_pedido || ev.mesa_numero || ev.nombre_control}`;
      const now = Date.now();
      const last = lastToastRef.current.get(dedupeKey) || 0;
      if (now - last > 4000) {
        lastToastRef.current.set(dedupeKey, now);
        playNotificationSound("cocina");
        const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "Cocina");
        toast(`Nueva orden recibida en Cocina (${target})`);
      }
    }
    if (ev?.table === "comanda_lista" && ev?.todas_listas) {
      const dedupeKey = `lista_${ev.id_pedido || ev.mesa_numero || ev.nombre_control}`;
      const now = Date.now();
      const last = lastToastRef.current.get(dedupeKey) || 0;
      if (now - last > 4000) {
        lastToastRef.current.set(dedupeKey, now);
        const target = ev.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev.nombre_control || "");
        toast(`Comanda completa lista${target ? " — " + target : ""}`);
      }
    }
  }, [debouncedLoad, toast]);

  useRealtime(handleRealtime);


  const [markingAll, setMarkingAll] = useState({});

  async function despacharComandaCompleta(pedidoId, targetName) {
    setMarkingAll((prev) => ({ ...prev, [pedidoId]: true }));
    try {
      const res = await fetch(`/api/cocina/pedidos/${pedidoId}/lista-todo`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo despachar la comanda");
      toast(`Comanda de ${targetName} marcada como lista al 100%`);
      load();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setMarkingAll((prev) => ({ ...prev, [pedidoId]: false }));
    }
  }

  async function marcarPlatilloListo(pedidoId, detalleId, nombrePlatillo) {
    if (!esOperativo) {
      toast("Tu rol no permite marcar platillos como listos en cocina.", "err");
      return;
    }
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/items/${detalleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_cocina: "entregado" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar el platillo");
      toast(`${nombrePlatillo} marcado como listo`);
      load();
    } catch (err) {
      toast(err.message, "err");
    }
  }

  // Filtrado de pedidos según estación seleccionada
  const filteredPedidos = useMemo(() => {
    if (filtroEstacion === "todas") return pedidos;
    return pedidos.filter((p) =>
      (p.detalles || []).some(
        (d) =>
          d.estacion === filtroEstacion &&
          !["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)
      )
    );
  }, [pedidos, filtroEstacion]);


  // Métricas de supervisión
  const metrics = useMemo(() => {
    let totalPlatillos = 0;
    let totalPendientes = 0;
    for (const p of pedidos) {
      for (const d of (p.detalles || [])) {
        if (!["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)) {
          totalPlatillos += d.cantidad;
          if (d.estado_cocina !== "entregado") {
            totalPendientes += d.cantidad;
          }
        }
      }
    }
    return {
      totalComandas: pedidos.length,
      totalPlatillos,
      totalPendientes,
    };
  }, [pedidos]);

  return (
    <Shell
      title="Monitor General de Cocina"
      actions={
        esOperativo ? (
          <span className="rounded-lg bg-emerald-50 border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 flex items-center gap-1.5 shadow-sm">
            <UtensilsCrossed size={14} className="text-emerald-600" />
            Control Operativo de Cocina
          </span>
        ) : (
          <span className="rounded-lg bg-stone-100 border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 flex items-center gap-1.5 shadow-sm">
            <Monitor size={14} className="text-stone-500" />
            Modo Consulta (Solo Lectura)
          </span>
        )
      }
    >
      {/* Banner Informativo y Enlaces a Pantallas KDS Operativas */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3.5 shadow-card">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Estaciones KDS Operativas:
            </span>
            <span className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white">
              Monitor Central
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ESTACIONES.map((est) => (
              <Link
                key={est.key}
                href={est.href}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition border shadow-sm",
                  est.badgeCls
                )}
              >
                KDS {est.label} →
              </Link>
            ))}
          </div>
        </div>

        {/* Barra de métricas y filtro */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-line rounded-xl px-4 py-2.5 text-xs text-stone-600 shadow-card">
          <div className="flex items-center gap-4">
            <span>
              Comandas activas: <strong className="text-stone-900 font-bold">{metrics.totalComandas}</strong>
            </span>
            <span>
              Platillos en preparación: <strong className="text-amber-800 font-bold">{metrics.totalPendientes}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
              Filtrar vista:
            </span>
            <button
              onClick={() => setFiltroEstacion("todas")}
              className={clsx(
                "px-2.5 py-1 rounded-lg text-xs font-semibold transition border",
                filtroEstacion === "todas"
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-700 border-stone-300 hover:bg-stone-100"
              )}
            >
              Todas
            </button>
            {ESTACIONES.map((est) => (
              <button
                key={est.key}
                onClick={() => setFiltroEstacion(est.key)}
                className={clsx(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold transition border",
                  filtroEstacion === est.key
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-700 border-stone-300 hover:bg-stone-100"
                )}
              >
                {est.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid de Comandas en Pantalla */}
      {filteredPedidos.length === 0 ? (
        <div className="text-center py-20 bg-white border border-line rounded-xl shadow-card">
          <UtensilsCrossed size={40} className="mx-auto text-stone-400 mb-3" />
          <p className="text-stone-800 text-base font-semibold">No hay comandas activas en cocina</p>
          <p className="text-stone-500 text-xs mt-1">
            Los nuevos pedidos enviados por los meseros aparecerán automáticamente aquí.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {filteredPedidos.map((p) => {
            const detalles = (p.detalles || []).filter(
              (d) =>
                !["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina) &&
                d.estacion !== "extra" &&
                (filtroEstacion === "todas" || d.estacion === filtroEstacion)
            );
            if (detalles.length === 0) return null;

            // Estaciones que participan en esta comanda (nombres oficiales)
            const estacionesPresentes = [
              { key: "pupusa", label: "Área 1 · Pupusas", present: (p.detalles || []).some((d) => d.estacion === "pupusa") },
              { key: "panes", label: "Área 2 · Panes", present: (p.detalles || []).some((d) => d.estacion === "panes") },
              { key: "bebida", label: "Área 3 · Bebidas/Postres", present: (p.detalles || []).some((d) => d.estacion === "bebida") },
            ].filter((e) => e.present);

            const estacionesInfo = p.estaciones_info || {};
            const todasListas = estacionesPresentes.length > 0 && estacionesPresentes.every(
              (e) => estacionesInfo[e.key]?.lista === true
            );


            return (
              <article
                key={p.id}
                className={clsx(
                  "rounded-xl border bg-white p-4 flex flex-col justify-between transition shadow-card",
                  todasListas ? "border-emerald-500 bg-emerald-50/20" : "border-line"
                )}
              >
                <div>
                  {/* Encabezado de la comanda */}
                  <div className="flex items-start justify-between border-b border-line pb-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-stone-900">
                          {p.tipo_pedido === "local" ? `Mesa ${p.mesa_numero}` : "Para Llevar"}
                        </span>
                        {p.ronda_actual > 1 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wider">
                            Ronda {p.ronda_actual} (Adición)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-300 uppercase tracking-wider">
                            Ronda 1
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {p.nombre_control} {p.mesero_nombre ? `· Mesero: ${p.mesero_nombre}` : ""}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 text-xs text-stone-500">
                        <Clock size={12} />
                        <span>{fmt.time(p.fecha)}</span>
                      </div>
                      <span className="text-[11px] text-stone-400 font-mono">
                        #{String(p.id).slice(-4)}
                      </span>
                    </div>
                  </div>

                  {/* Estado por estaciones KDS */}
                  <div className="mb-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                        Estado de Estaciones:
                      </span>
                      {todasListas && (
                        <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 size={13} className="text-emerald-700" />
                          Comanda Completa Lista
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {estacionesPresentes.map((e) => {
                        const isLista = estacionesInfo[e.key]?.lista === true;
                        return (
                          <div
                            key={e.key}
                            className={clsx(
                              "rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold border flex flex-col items-center justify-center",
                              isLista
                                ? "bg-emerald-700 text-white border-transparent"
                                : "bg-amber-600 text-white border-transparent"
                            )}
                          >
                            <span className="font-bold">{e.label}</span>
                            <span className="text-[10px] opacity-90">
                              {isLista ? "Lista" : "En proceso"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Nota especial del pedido */}
                  {p.notas && (
                    <div className="mb-3 bg-stone-900 text-white rounded-lg p-2.5 text-xs font-semibold">
                      Nota de orden: {p.notas}
                    </div>
                  )}

                  {/* Lista de platillos (100% Solo Lectura) */}
                  <div className="space-y-1.5 pt-1">
                    {detalles.map((d) => (
                      <div
                        key={d.id}
                        className={clsx(
                          "flex items-center justify-between p-2.5 rounded-lg border",
                          d.estado_cocina === "entregado"
                            ? "bg-emerald-50/50 border-emerald-200"
                            : "bg-stone-50 border-stone-200"
                        )}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-stone-900 text-sm">
                              {d.cantidad}× {d.producto_nombre}
                            </span>
                            {d.estacion && (
                              <span
                                className={clsx(
                                  "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border",
                                  d.estacion === "pupusa"
                                    ? "bg-amber-100 text-amber-900 border-amber-300"
                                    : d.estacion === "panes"
                                    ? "bg-purple-100 text-purple-900 border-purple-300"
                                    : d.estacion === "bebida"
                                    ? "bg-sky-100 text-sky-900 border-sky-300"
                                    : "bg-stone-100 text-stone-700 border-stone-300"
                                )}
                              >
                                {d.estacion === "pupusa"
                                  ? "Pupusas"
                                  : d.estacion === "panes"
                                  ? "Panes"
                                  : d.estacion === "bebida"
                                  ? "Bebidas"
                                  : d.estacion}
                              </span>
                            )}
                            {d.ronda > 1 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wider">
                                R{d.ronda}
                              </span>
                            )}
                          </div>
                          <span className="block text-[11px] text-stone-500 mt-0.5">
                            {[d.variante, d.destino_servicio === "llevar" ? "Para llevar" : "Comer aquí"]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {d.notas && (
                            <span className="mt-1 block text-xs font-semibold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Nota: {d.notas}
                            </span>
                          )}
                        </div>

                        <div>
                          {d.estado_cocina === "entregado" ? (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider border bg-emerald-100 text-emerald-800 border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 size={12} /> Listo
                            </span>
                          ) : esOperativo ? (
                            <button
                              type="button"
                              onClick={() => marcarPlatilloListo(p.id, d.id, d.producto_nombre)}
                              className="text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider border bg-stone-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-stone-800 border-stone-300 transition active:scale-95 flex items-center gap-1 shadow-sm"
                            >
                              <Check size={12} /> Marcar Listo
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider border bg-stone-200 text-stone-800 border-stone-300">
                              En proceso
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pie de tarjeta de comanda */}
                <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] text-stone-500 font-medium">
                    {detalles.reduce((acc, d) => acc + d.cantidad, 0)} platillo(s)
                    {filtroEstacion !== "todas" && (
                      <span className="ml-1 text-[10px] text-stone-400">
                        (filtrados)
                      </span>
                    )}
                  </span>
                  {!todasListas ? (
                    esOperativo ? (
                      <button
                        disabled={markingAll[p.id]}
                        onClick={() =>
                          despacharComandaCompleta(
                            p.id,
                            p.tipo_pedido === "local" ? `Mesa ${p.mesa_numero}` : (p.nombre_control || "Para Llevar")
                          )
                        }
                        className="btn-emerald py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition"
                      >
                        <Check size={14} />
                        {markingAll[p.id] ? "Despachando..." : "Marcar Todo Listo"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-stone-400 italic">
                        Solo lectura (Cocina / Admin)
                      </span>
                    )
                  ) : (
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <CheckCircle2 size={14} /> Comanda Despachada
                    </span>
                  )}
                </div>

              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
