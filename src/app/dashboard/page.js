"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { fmt } from "@/lib/formatters";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, TrendingUp, Receipt, Store, ShoppingBag } from "lucide-react";

const PERIODS = [
  { id: "dia", label: "Hoy" },
  { id: "semana", label: "Esta Semana" },
  { id: "mes", label: "Este Mes" },
];

export default function DashboardPage() {
  const [periodo, setPeriodo] = useState("dia");
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reportes?periodo=${periodo}`);
    setData(await res.json());
  }, [periodo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell
      title="Reportes de Venta"
      actions={
        <div className="flex items-center gap-3">
          <div className="flex rounded-full bg-stone-100 p-1 border border-line">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className={`rounded-full px-4 py-1 text-xs font-semibold transition-all duration-150 ${
                  periodo === p.id ? "bg-ink text-paper shadow-sm" : "text-mute hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <a
            href={`/api/reportes/export?periodo=${periodo}`}
            className="btn-primary text-xs flex items-center gap-1.5 py-2 px-3.5 bg-ink text-paper hover:bg-stone-800 rounded-xl transition"
          >
            <Download size={14} />
            Exportar Excel
          </a>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-6 bg-white border border-line relative overflow-hidden group hover:shadow-md transition">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">Total Facturado</p>
          <p className="font-display mt-3 text-4xl font-bold text-ink">{fmt.money(data?.total || 0)}</p>
          <div className="absolute right-6 bottom-6 opacity-5 group-hover:scale-110 transition-transform duration-300">
            <TrendingUp size={64} className="text-ink" />
          </div>
        </div>
        <div className="card p-6 bg-white border border-line relative overflow-hidden group hover:shadow-md transition">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">Órdenes Completadas</p>
          <p className="font-display mt-3 text-4xl font-bold text-ink">{data?.ordenes ?? 0}</p>
          <div className="absolute right-6 bottom-6 opacity-5 group-hover:scale-110 transition-transform duration-300">
            <TrendingUp size={64} className="text-ink" />
          </div>
        </div>
        <div className="card p-6 bg-white border border-line relative overflow-hidden group hover:shadow-md transition">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">Ticket promedio</p>
          <p className="font-display mt-3 text-4xl font-bold text-ink">{fmt.money(data?.promedio || 0)}</p>
          <div className="absolute right-6 bottom-6 opacity-5 group-hover:scale-110 transition-transform duration-300"><Receipt size={64} /></div>
        </div>
        <div className="card p-6 bg-white border border-line relative overflow-hidden group hover:shadow-md transition">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">Para llevar</p>
          <p className="font-display mt-3 text-4xl font-bold text-ink">{data?.servicio?.find((s) => s.tipo === "llevar")?.ordenes || 0}</p>
          <div className="absolute right-6 bottom-6 opacity-5 group-hover:scale-110 transition-transform duration-300"><ShoppingBag size={64} /></div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {(data?.servicio || []).map((s) => (
          <div key={s.tipo} className="card flex items-center justify-between border border-line bg-white px-5 py-4">
            <div className="flex items-center gap-3">
              {s.tipo === "local" ? <Store size={18} className="text-clay" /> : <ShoppingBag size={18} className="text-clay" />}
              <div><p className="text-sm font-semibold">{s.tipo === "local" ? "Comer aquí" : "Para llevar"}</p><p className="text-xs text-mute">{s.ordenes} órdenes</p></div>
            </div>
            <span className="font-mono text-sm font-semibold">{fmt.money(s.total)}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Chart Column */}
        <div className="card p-6 bg-white border border-line lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-ink uppercase tracking-wider">Historial de Ventas</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.serie || []}>
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#78716c" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#78716c" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1c1b18", borderRadius: "12px", border: "none" }}
                  labelStyle={{ color: "#a8a29e", fontSize: "11px", fontWeight: "bold" }}
                  itemStyle={{ color: "#fafaf9", fontSize: "12px" }}
                  formatter={(v) => [fmt.money(v), "Ingresos"]}
                />
                <Bar dataKey="total" fill="#C2410C" radius={[4, 4, 0, 0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products Column */}
        <div className="card p-6 bg-white border border-line lg:col-span-2 flex flex-col">
          <h2 className="mb-4 text-sm font-semibold text-ink uppercase tracking-wider">Platillos Más Vendidos</h2>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm min-w-[300px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-mute font-semibold">
                  <th className="pb-2.5">Plato</th>
                  <th className="pb-2.5 text-center">Cant.</th>
                  <th className="pb-2.5 text-right">Ingresos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {(data?.top || []).map((t, i) => (
                  <tr key={t.nombre} className="hover:bg-stone-50/55 transition-colors">
                    <td className="py-2.5 font-medium text-ink">
                      <span className="mr-1.5 text-mute text-xs">{i + 1}.</span>
                      {t.nombre}
                    </td>
                    <td className="py-2.5 text-center font-semibold text-stone-600">{t.cantidad}</td>
                    <td className="py-2.5 text-right font-mono font-medium text-ink">{fmt.money(t.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.top?.length && (
              <div className="flex items-center justify-center py-20 text-mute text-sm">
                Sin ventas registradas en este periodo.
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="card mt-6 border border-line bg-white p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="text-sm font-semibold uppercase tracking-wider text-ink">Últimas ventas</h2><p className="mt-1 text-xs text-mute">Las 12 órdenes cobradas más recientes del periodo</p></div>
          <Receipt size={20} className="text-mute" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs font-semibold text-mute"><th className="pb-3">Hora</th><th className="pb-3">Mesa / referencia</th><th className="pb-3">Tipo</th><th className="pb-3">Atendió</th><th className="pb-3 text-right">Cobrado</th></tr></thead>
            <tbody className="divide-y divide-line/50">
              {(data?.recientes || []).map((v) => (
                <tr key={v.id} className="hover:bg-stone-50/60">
                  <td className="py-3 text-xs text-mute">{fmt.date(v.fecha)}</td>
                  <td className="py-3 font-medium">{v.tipo_pedido === "local" ? `Mesa ${v.mesa_numero}` : v.nombre_control}<span className="ml-2 text-xs font-normal text-mute">{v.nombre_control}</span></td>
                  <td className="py-3"><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs">{v.tipo_pedido === "local" ? "Aquí" : "Llevar"}</span></td>
                  <td className="py-3 text-xs text-mute">{v.mesero_nombre || "—"}</td>
                  <td className="py-3 text-right font-mono font-semibold">{fmt.money(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.recientes?.length && <p className="py-12 text-center text-sm text-mute">Sin ventas cobradas en este periodo.</p>}
        </div>
      </section>
    </Shell>
  );
}
