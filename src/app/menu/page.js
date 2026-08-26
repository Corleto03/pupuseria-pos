"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { useToast } from "@/components/Toast";
import { fmt } from "@/lib/formatters";
import ConfirmModal from "@/components/ConfirmModal";
import clsx from "clsx";

export default function MenuPage() {
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({ nombre: "", categoria: "pupusa", precio: "0.75", especialidad: "" });
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, nombre: "" });
  const toast = useToast();

  const load = useCallback(async () => {
    const res = await fetch("/api/productos");
    const data = await res.json();
    setProductos(data.productos || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function crear(e) {
    e.preventDefault();
    const res = await fetch("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        precio: Number(form.precio),
      }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "No se pudo crear", "err");
    setForm({ nombre: "", categoria: "pupusa", precio: "0.75", especialidad: "" });
    load();
  }

  function empezarEditar(p) {
    setEditingId(p.id);
    setForm({
      nombre: p.nombre,
      categoria: p.categoria,
      precio: String(p.precio),
      especialidad: p.especialidad || "",
    });
  }

  function cancelarEditar() {
    setEditingId(null);
    setForm({ nombre: "", categoria: "pupusa", precio: "0.75", especialidad: "" });
  }

  async function guardar(e) {
    e.preventDefault();
    const res = await fetch(`/api/productos/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        precio: Number(form.precio),
      }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "No se pudo guardar", "err");
    toast("Producto actualizado");
    cancelarEditar();
    load();
  }

  async function toggleActivo(p) {
    const res = await fetch(`/api/productos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !p.activo }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "No se pudo cambiar el estado", "err");
    toast(p.activo ? "Producto desactivado" : "Producto activado");
    load();
  }

  function pedirEliminar(p) {
    setConfirmDelete({ open: true, id: p.id, nombre: p.nombre });
  }

  async function ejecutarEliminar() {
    const { id } = confirmDelete;
    if (!id) return;
    const res = await fetch(`/api/productos/${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setConfirmDelete({ open: false, id: null, nombre: "" });
    if (!res.ok) return toast(data.error || "No se pudo eliminar", "err");
    toast("Producto eliminado");
    load();
  }

  return (
    <Shell title="Menú">
      <form onSubmit={editingId ? guardar : crear} className="card mb-6 grid gap-3 p-5 sm:grid-cols-4">
        <input
          className="input"
          placeholder="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          required
        />
        <input
          className="input"
          placeholder="Especialidad"
          value={form.especialidad}
          onChange={(e) => setForm({ ...form, especialidad: e.target.value })}
        />
        <select
          className="input"
          value={form.categoria}
          onChange={(e) => setForm({ ...form, categoria: e.target.value })}
        >
          <option value="pupusa">Pupusa</option>
          <option value="bebida">Bebida</option>
          <option value="extra">Extra</option>
        </select>
        <div className="flex gap-2">
          <input
            className="input"
            type="number"
            step="0.05"
            value={form.precio}
            onChange={(e) => setForm({ ...form, precio: e.target.value })}
          />
          <button className="btn-primary flex-1">{editingId ? "Guardar" : "Añadir"}</button>
          {editingId && (
            <button type="button" onClick={cancelarEditar} className="btn-ghost px-3">
              Cancelar
            </button>
          )}
        </div>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-line text-left text-xs text-mute">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className="border-b border-line/70 hover:bg-stone-50/50 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-medium text-ink">{p.nombre}</span>
                  {p.especialidad && (
                    <span className="ml-2 inline-block rounded bg-line px-1.5 py-0.5 text-[10px] text-mute">
                      {p.especialidad}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize text-mute">{p.categoria}</td>
                <td className="px-4 py-3 font-mono">{fmt.money(p.precio)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleActivo(p)}
                    className={clsx(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                      p.activo
                        ? "bg-moss/10 text-moss hover:bg-moss/20"
                        : "bg-wine/10 text-wine hover:bg-wine/20"
                    )}
                  >
                    {p.activo ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button
                    type="button"
                    onClick={() => empezarEditar(p)}
                    className="text-xs text-mute hover:text-ink font-medium"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => pedirEliminar(p)}
                    className="text-xs text-wine/80 hover:text-wine font-medium"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={confirmDelete.open}
        title="¿Eliminar Producto?"
        message={`¿Está seguro de que desea eliminar el producto "${confirmDelete.nombre}"? Si ya tiene ventas previas asociadas, considere desactivarlo en su lugar.`}
        confirmText="Sí, eliminar"
        onConfirm={ejecutarEliminar}
        onClose={() => setConfirmDelete({ open: false, id: null, nombre: "" })}
      />
    </Shell>
  );
}
