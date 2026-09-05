"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { useToast } from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import { KeyRound } from "lucide-react";

const roles = ["admin", "gerente", "mesero", "cocinero", "cajero"];

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState({ nombre: "", email: "", rol: "mesero", password: "" });
  const [deleteUserObj, setDeleteUserObj] = useState(null);
  const [passwordUserObj, setPasswordUserObj] = useState(null);
  const toast = useToast();
  const load = useCallback(async () => {
    const res = await fetch("/api/usuarios");
    const data = await res.json();
    if (res.ok) setUsuarios(data.usuarios || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    const res = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "err");
    setForm({ nombre: "", email: "", rol: "mesero", password: "" });
    toast("Usuario creado"); load();
  }
  async function toggle(u) {
    const res = await fetch(`/api/usuarios/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: !u.activo }) });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "err");
    toast(u.activo ? "Usuario desactivado" : "Usuario activado"); load();
  }
  async function ejecutarEliminarUsuario() {
    if (!deleteUserObj) return;
    const res = await fetch(`/api/usuarios/${deleteUserObj.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "err");
    toast("Usuario eliminado");
    setDeleteUserObj(null);
    load();
  }
  return <Shell title="Usuarios">
    <form onSubmit={create} className="card mb-6 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
      <input className="input" placeholder="Nombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      <input className="input" type="email" placeholder="Correo" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <select className="input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select>
      <input className="input" type="password" minLength="12" placeholder="Contraseña (12+)" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="btn-primary">Crear usuario</button>
    </form>
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-mute">
            <th className="p-3">Usuario</th>
            <th className="p-3">Rol</th>
            <th className="p-3">Estado</th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b border-line/70 hover:bg-stone-50/60 transition-colors">
              <td className="p-3">
                <p className="font-medium text-ink">{u.nombre}</p>
                <p className="text-xs text-mute">{u.email}</p>
              </td>
              <td className="p-3 capitalize">{u.rol}</td>
              <td className="p-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.activo ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-stone-100 text-stone-500 border border-stone-200"}`}>
                  {u.activo ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="p-3 text-right">
                <button
                  type="button"
                  onClick={() => setPasswordUserObj(u)}
                  className="inline-flex items-center gap-1.5 mr-2 text-xs font-semibold text-stone-700 hover:text-ink px-2.5 py-1.5 rounded-lg border border-line bg-white hover:bg-stone-50 shadow-xs transition-colors"
                  title="Cambiar contraseña"
                >
                  <KeyRound size={13} className="text-amber-700" />
                  <span>Contraseña</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggle(u)}
                  className="mr-2 text-xs text-wine hover:underline font-medium px-2 py-1 rounded-lg hover:bg-wine/5 transition-colors"
                >
                  {u.activo ? "Desactivar" : "Activar"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteUserObj(u)}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <ChangePasswordModal
      isOpen={!!passwordUserObj}
      usuario={passwordUserObj}
      onClose={() => setPasswordUserObj(null)}
      onSuccess={(msg) => {
        toast(msg);
        load();
      }}
    />

    <ConfirmModal
      isOpen={!!deleteUserObj}
      title="¿Eliminar Usuario?"
      message={`¿Está seguro de que desea eliminar permanentemente al usuario ${deleteUserObj?.nombre}?`}
      confirmText="Sí, eliminar"
      cancelText="Cancelar"
      isDestructive={true}
      onConfirm={ejecutarEliminarUsuario}
      onClose={() => setDeleteUserObj(null)}
    />
  </Shell>;
}
