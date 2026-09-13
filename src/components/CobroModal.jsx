"use client";

import { fmt } from "@/lib/formatters";
import { X, Trash2, Printer, Check, AlertCircle, Calculator } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import clsx from "clsx";
import { printComandaCocina } from "@/lib/printComanda";

export default function CobroModal({ pedido, onClose, onConfirm, saving, userRole, cajaAbierta }) {
  const [monto, setMonto] = useState("");
  const [montoEfectivo, setMontoEfectivo] = useState("");
  const [montoTarjeta, setMontoTarjeta] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [imprimir, setImprimir] = useState(true);
  const [detallesList, setDetallesList] = useState(pedido.detalles || []);
  const [deletingId, setDeletingId] = useState(null);
  const [isCajaAbierta, setIsCajaAbierta] = useState(cajaAbierta !== undefined ? cajaAbierta : true);

  useEffect(() => {
    fetch("/api/caja")
      .then((r) => r.json())
      .then((d) => {
        const abierta = Boolean(d.caja && d.caja.cierre === null);
        setIsCajaAbierta(abierta);
      })
      .catch(() => {});
  }, [cajaAbierta]);

  // Modal para anular unidades
  const [anularModal, setAnularModal] = useState({
    isOpen: false,
    item: null,
    cantidad: 1,
  });

  const total = useMemo(() => {
    if (detallesList && detallesList.length > 0) {
      return detallesList.reduce((acc, d) => {
        if (["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)) return acc;
        return acc + (Number(d.precio_unitario ?? d.precio ?? 0) * d.cantidad);
      }, 0);
    }
    return Number(pedido.total) || 0;
  }, [detallesList, pedido.total]);

  const [showNumpad, setShowNumpad] = useState(false);

  const recibido = parseFloat(monto) || 0;
  const vueltoEfectivo = Number(Math.max(0, recibido - total).toFixed(2));

  const recibidoEfectivo = parseFloat(montoEfectivo) || 0;
  const recibidoTarjeta = parseFloat(montoTarjeta) || 0;
  const totalMixtoIngresado = Number((recibidoEfectivo + recibidoTarjeta).toFixed(2));
  const vueltoMixto = Number(Math.max(0, totalMixtoIngresado - total).toFixed(2));

  function handleNumpadPress(btn) {
    if (btn === "C") {
      setMonto("");
    } else if (btn === "⌫") {
      setMonto((prev) => (prev ? String(prev).slice(0, -1) : ""));
    } else if (btn === "00") {
      setMonto((prev) => {
        if (!prev || prev === "0") return "0";
        if (String(prev).includes(".")) {
          const parts = String(prev).split(".");
          if (parts[1] && parts[1].length >= 2) return prev;
          if (parts[1] && parts[1].length === 1) return prev + "0";
          return prev + "00";
        }
        return prev + "00";
      });
    } else if (btn === ".") {
      setMonto((prev) => {
        if (!prev) return "0.";
        if (String(prev).includes(".")) return prev;
        return prev + ".";
      });
    } else if (btn.startsWith("+$")) {
      const addVal = Number(btn.replace("+$", "")) || 0;
      const curr = parseFloat(monto) || 0;
      setMonto((curr + addVal).toFixed(2));
    } else {
      setMonto((prev) => {
        const pStr = String(prev || "");
        if (pStr === "0") return btn;
        if (pStr.includes(".")) {
          const parts = pStr.split(".");
          if (parts[1] && parts[1].length >= 2) return prev;
        }
        return pStr + btn;
      });
    }
  }

  const valido =
    metodo === "tarjeta" ||
    (metodo === "efectivo" && recibido >= total) ||
    (metodo === "mixto" && totalMixtoIngresado >= total);

  const pendientes = useMemo(
    () => detallesList.filter((d) => !["entregado", "no_entregado", "anulado", "cancelado"].includes(d.estado_cocina)).length,
    [detallesList]
  );

  const rondasDisponibles = useMemo(() => {
    const set = new Set();
    for (const d of detallesList) {
      if (d.estado_cocina !== "borrador" && d.ronda) {
        set.add(Number(d.ronda));
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [detallesList]);

  const [selectedRonda, setSelectedRonda] = useState("1");
  const [reimprimiendo, setReimprimiendo] = useState(false);

  async function reimprimirComanda() {
    let itemsAImprimir = [];
    let targetRonda = selectedRonda;

    if (selectedRonda === "todas") {
      itemsAImprimir = detallesList.filter((d) => d.estado_cocina !== "borrador");
      targetRonda = "COMPLETA";
    } else {
      const rondaNum = Number(selectedRonda) || (rondasDisponibles[rondasDisponibles.length - 1] || 1);
      itemsAImprimir = detallesList.filter((d) => (d.ronda || 1) === rondaNum && d.estado_cocina !== "borrador");
      targetRonda = rondaNum;
    }

    if (itemsAImprimir.length === 0) {
      alert("No hay platillos registrados para esta ronda");
      return;
    }

    setReimprimiendo(true);
    try {
      await printComandaCocina({
        items: itemsAImprimir,
        ronda: targetRonda,
        pedido: { ...pedido, detalles: detallesList },
      });
    } finally {
      setReimprimiendo(false);
    }
  }

  function abrirModalAnular(d) {
    setAnularModal({
      isOpen: true,
      item: d,
      cantidad: 1,
    });
  }

  async function confirmarAnulacion() {
    const { item, cantidad } = anularModal;
    if (!item) return;

    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_cocina: "no_entregado", cantidad }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Error al anular ítem");
        return;
      }

      setDetallesList((prev) => {
        const next = [];
        for (const d of prev) {
          if (d.id === item.id) {
            if (cantidad < d.cantidad) {
              next.push({ ...d, cantidad: d.cantidad - cantidad });
              next.push({ ...d, id: `no_ent_${Date.now()}`, cantidad, estado_cocina: "no_entregado" });
            } else {
              next.push({ ...d, estado_cocina: "no_entregado" });
            }
          } else {
            next.push(d);
          }
        }
        return next;
      });

      try {
        const refRes = await fetch(`/api/pedidos/${pedido.id}`);
        if (refRes.ok) {
          const refData = await refRes.json();
          if (refData.pedido?.detalles) {
            setDetallesList(refData.pedido.detalles);
          }
        }
      } catch (e) {
        console.error("Error refreshing order details:", e);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
      setAnularModal({ isOpen: false, item: null, cantidad: 1 });
    }
  }

  const consolidatedDetalles = useMemo(() => {
    if (!detallesList) return [];
    const map = new Map();
    for (const d of detallesList) {
      const nombre = d.producto_nombre || d.producto?.nombre || d.nombre || "";
      const varName = d.variante || "";
      const estado = d.estado_cocina || "";
      const precio = Number(d.precio_unitario ?? d.precio ?? 0);
      const key = `${d.id_producto || nombre}_${varName}_${estado}_${precio}`;
      if (map.has(key)) {
        const item = map.get(key);
        item.cantidad += d.cantidad;
      } else {
        map.set(key, { ...d, producto_nombre: nombre, precio_unitario: precio, cantidad: d.cantidad });
      }
    }
    return Array.from(map.values());
  }, [detallesList]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div className="w-full max-w-lg bg-white border border-stone-300 shadow-xl rounded-xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Cabecera Fija */}
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5 bg-stone-50 shrink-0">
          <div>
            <h3 className="font-semibold text-base text-stone-900">Cobrar Pedido</h3>
            <p className="text-xs text-stone-500">
              {pedido.tipo_pedido === "local" ? `Mesa ${pedido.mesa_numero}` : "Para llevar"} · {pedido.nombre_control}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-800 p-1.5 rounded-lg hover:bg-stone-200 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Alerta de Caja Cerrada */}
        {!isCajaAbierta && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-2.5 flex items-center gap-2 text-xs text-rose-800 font-semibold shrink-0">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>La caja del día está cerrada o no ha sido abierta. No se pueden procesar cobros hasta abrir caja.</span>
          </div>
        )}

        {/* Barra Fija del Total a Cobrar (SIEMPRE VISIBLE FUERA DEL SCROLL) */}
        <div className="px-5 py-3 bg-stone-900 text-white shrink-0 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-stone-300 font-medium block">
              Total a Cobrar
            </span>
            <span className="text-xs text-stone-400">
              {detallesList.filter(d => !["no_entregado","anulado","cancelado"].includes(d.estado_cocina)).reduce((acc, d) => acc + d.cantidad, 0)} producto(s)
            </span>
          </div>
          <div className="text-right">
            <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-white block leading-none">
              {fmt.money(total)}
            </span>
            {metodo === "efectivo" && recibido > 0 && (
              <span className={clsx("block text-xs font-mono font-semibold mt-1", recibido >= total ? "text-emerald-400" : "text-amber-300")}>
                {recibido >= total ? `Vuelto: ${fmt.money(vueltoEfectivo)}` : `Faltan: ${fmt.money(total - recibido)}`}
              </span>
            )}
            {metodo === "mixto" && totalMixtoIngresado > 0 && (
              <span className={clsx("block text-xs font-mono font-semibold mt-1", totalMixtoIngresado >= total ? "text-emerald-400" : "text-amber-300")}>
                {totalMixtoIngresado >= total ? `Vuelto: ${fmt.money(vueltoMixto)}` : `Faltan: ${fmt.money(total - totalMixtoIngresado)}`}
              </span>
            )}
          </div>
        </div>

        {/* Sección con Scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Detalle de Platillos */}
          {consolidatedDetalles.length > 0 && (
            <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
              <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                Detalle del Pedido
              </h4>
              <ul className="space-y-2 text-xs max-h-40 overflow-y-auto pr-1">
                {consolidatedDetalles.map((d, i) => {
                  const isNoEntregado = ["no_entregado", "anulado", "cancelado"].includes(d.estado_cocina);
                  return (
                    <li key={d.id || i} className="flex justify-between items-center py-1.5 border-b border-stone-200/70 last:border-0">
                      <div>
                        <span className={clsx("font-medium block", isNoEntregado ? "line-through text-stone-400" : "text-stone-900")}>
                          {d.cantidad} × {d.producto_nombre}{d.variante ? ` (${d.variante})` : ""}
                        </span>
                        <span className="text-[10px] text-stone-500">
                          {isNoEntregado ? "No Entregado (Anulado)" : d.estado_cocina === "entregado" ? "Entregado" : "En cocina (" + d.estado_cocina + ")"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={clsx("font-mono font-semibold", isNoEntregado ? "line-through text-stone-400" : "text-stone-900")}>
                          {isNoEntregado ? "$0.00" : fmt.money(d.precio_unitario * d.cantidad)}
                        </span>
                        {!isNoEntregado && ['superadmin', 'admin'].includes(userRole) && (
                          <button
                            type="button"
                            disabled={deletingId === d.id}
                            onClick={() => abrirModalAnular(d)}
                            title="Anular unidad"
                            className="text-rose-700 hover:bg-rose-50 px-2 py-1 rounded transition text-xs font-semibold flex items-center gap-1 border border-rose-300"
                          >
                            <Trash2 size={12} />
                            <span>Anular</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {pendientes > 0 && (
            <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 p-3 rounded-lg border border-rose-300 font-medium">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-700" />
              <span>
                Aún hay {pendientes} producto(s) sin entregar en cocina. Puedes anularlos aquí si no se prepararán antes de cobrar.
              </span>
            </div>
          )}

          {/* Reimpresión de Comandas por Ronda */}
          {rondasDisponibles.length > 0 && (
            <div className="bg-stone-50 border border-stone-200 p-3 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Printer size={13} />
                  Comanda de Cocina
                </span>
                <span className="text-[11px] text-stone-500 font-medium">
                  {rondasDisponibles.length} {rondasDisponibles.length === 1 ? "ronda enviada" : "rondas enviadas"}
                </span>
              </div>
              {rondasDisponibles.length > 1 ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedRonda}
                    onChange={(e) => setSelectedRonda(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900 outline-none transition focus:border-stone-900 flex-1"
                  >
                    {rondasDisponibles.map((r) => (
                      <option key={r} value={r}>
                        Ronda {r} {r === 1 ? "(Inicial)" : "(Adición)"}
                      </option>
                    ))}
                    <option value="todas">Todas las rondas (Completa)</option>
                  </select>
                  <button
                    type="button"
                    disabled={reimprimiendo}
                    onClick={reimprimirComanda}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center justify-center gap-1.5"
                  >
                    <Printer size={13} />
                    <span>{reimprimiendo ? "Imprimiendo..." : "Reimprimir"}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={reimprimiendo}
                  onClick={reimprimirComanda}
                  className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1.5"
                >
                  <Printer size={13} />
                  <span>{reimprimiendo ? "Imprimiendo..." : "Reimprimir comanda (Ronda 1)"}</span>
                </button>
              )}
            </div>
          )}

          {/* Método de Pago */}
          <div className="space-y-1.5">
            <label className="block text-xs text-stone-600 font-semibold uppercase tracking-wider">
              Método de Pago
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "efectivo", label: "Efectivo" },
                { id: "tarjeta", label: "Tarjeta" },
                { id: "mixto", label: "Mixto" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetodo(m.id)}
                  className={clsx(
                    "py-2 px-3 rounded-lg text-xs font-semibold border transition text-center",
                    metodo === m.id
                      ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                      : "bg-white text-stone-700 border-stone-300 hover:bg-stone-100"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Detalles del pago según método */}
          {metodo === "efectivo" && (
            <div className="space-y-2.5 bg-stone-50 p-3 rounded-lg border border-stone-200">
              <label className="block text-xs text-stone-600 font-semibold">
                Efectivo Recibido ($)
              </label>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-stone-400">$</span>
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="input pl-7 text-lg font-mono font-bold"
                    placeholder="0.00"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                  />
                </div>
                {monto && (
                  <button
                    type="button"
                    onClick={() => setMonto("")}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-stone-200 text-stone-700 hover:bg-stone-300 transition shrink-0"
                  >
                    Borrar
                  </button>
                )}
              </div>

              {/* Botones rápidos de efectivo */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setMonto(total.toFixed(2))}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-white border border-stone-300 text-stone-800 hover:bg-stone-100 transition shadow-sm"
                >
                  Exacto ({fmt.money(total)})
                </button>
                {Math.ceil(total) > total && (
                  <button
                    type="button"
                    onClick={() => setMonto(Math.ceil(total).toFixed(2))}
                    className="px-2.5 py-1 text-xs font-semibold rounded bg-white border border-stone-300 text-stone-800 hover:bg-stone-100 transition font-mono shadow-sm"
                  >
                    ${Math.ceil(total)}.00
                  </button>
                )}
                {[5, 10, 20, 50, 100]
                  .filter((b) => b >= total && b !== Math.ceil(total))
                  .map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setMonto(b.toFixed(2))}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-white border border-stone-300 text-stone-800 hover:bg-stone-100 transition font-mono shadow-sm"
                    >
                      ${b}
                    </button>
                  ))}
              </div>

              {/* Botón para desplegar teclado numérico táctil (pantallas touch de 15") */}
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowNumpad(!showNumpad)}
                  className="inline-flex items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900 font-medium py-1 px-2 rounded hover:bg-stone-200/60 transition"
                >
                  <Calculator size={13} />
                  <span>{showNumpad ? "▲ Ocultar teclado táctil" : "▼ Teclado numérico táctil (pantalla touch)"}</span>
                </button>
              </div>

              {showNumpad && (
                <div className="grid grid-cols-4 gap-1.5 pt-1 pb-1">
                  {["7", "8", "9", "C", "4", "5", "6", "⌫", "1", "2", "3", "00", "0", ".", "+$1", "+$5"].map((btn) => (
                    <button
                      key={btn}
                      type="button"
                      onClick={() => handleNumpadPress(btn)}
                      className={clsx(
                        "h-10 rounded-lg font-mono font-bold text-sm transition active:scale-95 border flex items-center justify-center select-none",
                        btn === "C" ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100" :
                        btn === "⌫" ? "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100" :
                        btn.startsWith("+$") ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-xs" :
                        "bg-white border-stone-300 text-stone-800 hover:bg-stone-100 shadow-sm"
                      )}
                    >
                      {btn}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center text-sm pt-2 border-t border-stone-200">
                <span className="text-stone-600 font-medium text-xs">Vuelto a entregar</span>
                <span className={valido ? "text-emerald-700 font-bold font-mono text-base" : "text-stone-400 font-mono"}>
                  {monto ? fmt.money(vueltoEfectivo) : "$0.00"}
                </span>
              </div>
            </div>
          )}

          {metodo === "mixto" && (
            <div className="space-y-3 bg-stone-50 p-3.5 rounded-lg border border-stone-200">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-stone-600 font-semibold">Monto en Efectivo ($)</label>
                  {total > recibidoTarjeta && (
                    <button
                      type="button"
                      onClick={() => setMontoEfectivo(Math.max(0, total - recibidoTarjeta).toFixed(2))}
                      className="text-[11px] text-stone-600 hover:text-stone-900 underline font-medium"
                    >
                      Restante ({fmt.money(Math.max(0, total - recibidoTarjeta))})
                    </button>
                  )}
                </div>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="input font-mono font-bold"
                  placeholder="0.00"
                  value={montoEfectivo}
                  onChange={(e) => setMontoEfectivo(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-stone-600 font-semibold">Monto en Tarjeta ($)</label>
                  {total > recibidoEfectivo && (
                    <button
                      type="button"
                      onClick={() => setMontoTarjeta(Math.max(0, total - recibidoEfectivo).toFixed(2))}
                      className="text-[11px] text-stone-600 hover:text-stone-900 underline font-medium"
                    >
                      Restante ({fmt.money(Math.max(0, total - recibidoEfectivo))})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="input font-mono font-bold"
                  placeholder="0.00"
                  value={montoTarjeta}
                  onChange={(e) => setMontoTarjeta(e.target.value)}
                />
              </div>
              <div className="pt-2 border-t border-stone-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-stone-500">Total ingresado:</span>
                  <span className={totalMixtoIngresado >= total ? "text-emerald-700 font-semibold font-mono" : "text-rose-700 font-semibold font-mono"}>
                    {fmt.money(totalMixtoIngresado)} / {fmt.money(total)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-stone-200">
                  <span className="text-stone-900 font-semibold">Vuelto a entregar:</span>
                  <span className={totalMixtoIngresado >= total ? "text-emerald-700 font-bold font-mono text-sm" : "text-stone-400 font-mono"}>
                    {totalMixtoIngresado > total ? fmt.money(vueltoMixto) : "$0.00"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={imprimir}
              onChange={(e) => setImprimir(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
            />
            <span>Imprimir ticket de cliente al confirmar</span>
          </label>
        </div>

        {/* Pie Fijo */}
        <div className="border-t border-stone-200 px-5 py-3 bg-stone-50 flex items-center gap-3 shrink-0">
          <button
            onClick={onClose}
            className="btn-secondary flex-1 py-2.5 text-xs"
          >
            Cancelar
          </button>
          <button
            disabled={!valido || pendientes > 0 || saving || !isCajaAbierta}
            onClick={() => {
              const montoRecibidoVal = metodo === "efectivo"
                ? recibido
                : (metodo === "tarjeta" ? total : totalMixtoIngresado);

              const vueltoVal = metodo === "efectivo"
                ? Math.max(0, vueltoEfectivo)
                : (metodo === "mixto" ? vueltoMixto : 0);

              onConfirm(pedido, { 
                metodo_pago: metodo, 
                pago_efectivo: metodo === "efectivo" ? total : (metodo === "mixto" ? recibidoEfectivo : 0),
                pago_tarjeta: metodo === "tarjeta" ? total : (metodo === "mixto" ? recibidoTarjeta : 0),
                monto_recibido: montoRecibidoVal,
                vuelto: vueltoVal,
                imprimir 
              });
            }}
            className={clsx(
              "flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition rounded-lg",
              isCajaAbierta
                ? "btn-emerald"
                : "bg-stone-200 text-stone-500 border border-stone-300 cursor-not-allowed"
            )}
          >
            <Check size={14} />
            <span>{isCajaAbierta ? `Confirmar Cobro (${fmt.money(total)})` : "Caja Cerrada (Abrir Caja)"}</span>
          </button>
        </div>
      </div>

      {/* Modal para Anular con selección de cantidad */}
      {anularModal.isOpen && anularModal.item && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm p-5 border border-stone-300 bg-white text-stone-900 shadow-xl rounded-xl">
            <div className="flex items-center gap-2 mb-2 text-rose-700 font-semibold text-base">
              <Trash2 size={18} />
              <h3>Anular Platillo</h3>
            </div>
            <p className="text-xs text-stone-600 mb-3">
              ¿Cuántas unidades deseas anular de <strong className="text-stone-900">{anularModal.item.producto_nombre}</strong>?
            </p>

            {anularModal.item.cantidad > 1 ? (
              <div className="bg-stone-50 p-3.5 rounded-lg border border-stone-200 mb-3 space-y-2">
                <div className="flex justify-between text-xs text-stone-600 font-medium">
                  <span>Cantidad disponible:</span>
                  <span className="font-bold text-stone-900">{anularModal.item.cantidad} unidades</span>
                </div>
                <div className="flex items-center justify-center gap-4 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      setAnularModal((prev) => ({ ...prev, cantidad: Math.max(1, prev.cantidad - 1) }))
                    }
                    className="h-9 w-9 rounded-lg bg-white border border-stone-300 flex items-center justify-center text-lg font-bold hover:bg-stone-100 transition shadow-sm"
                  >
                    -
                  </button>
                  <span className="w-10 text-center text-2xl font-mono font-bold text-stone-900">
                    {anularModal.cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAnularModal((prev) => ({
                        ...prev,
                        cantidad: Math.min(prev.item.cantidad, prev.cantidad + 1),
                      }))
                    }
                    className="h-9 w-9 rounded-lg bg-white border border-stone-300 flex items-center justify-center text-lg font-bold hover:bg-stone-100 transition shadow-sm"
                  >
                    +
                  </button>
                </div>
                <p className="text-[11px] text-center text-stone-500">
                  Se marcarán {anularModal.cantidad} de {anularModal.item.cantidad} unidades como No Entregado (
                  {fmt.money((anularModal.item.precio_unitario || 0) * anularModal.cantidad)} descontados).
                </p>
              </div>
            ) : (
              <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-lg border border-stone-200 mb-3">
                Se marcará 1 unidad de {anularModal.item.producto_nombre} como No Entregado ({fmt.money(anularModal.item.precio_unitario || 0)} descontado).
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setAnularModal({ isOpen: false, item: null, cantidad: 1 })}
                className="btn-secondary flex-1 text-xs py-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingId === anularModal.item.id}
                onClick={confirmarAnulacion}
                className="btn-danger flex-1 text-xs py-2 font-semibold"
              >
                {deletingId === anularModal.item.id
                  ? "Anulando..."
                  : `Anular ${anularModal.cantidad} unidad(es)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
