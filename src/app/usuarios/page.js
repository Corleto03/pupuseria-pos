"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { useToast } from "@/components/Toast";

const roles = ["admin", "gerente", "mesero", "cocinero", "cajero"];

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState({ nombre: "", email: "", rol: "mesero", password: "" });
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
  async function reset(u) {
    const password = window.prompt(`Nueva contraseña para ${u.nombre} (mínimo 12 caracteres):`);
    if (!password) return;
    const res = await fetch(`/api/usuarios/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "err");
    toast("Contraseña actualizada");
  }
  return <Shell title="Usuarios">
    <form onSubmit={create} className="card mb-6 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
      <input className="input" placeholder="Nombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      <input className="input" type="email" placeholder="Correo" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <select className="input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select>
      <input className="input" type="password" minLength="12" placeholder="Contraseña (12+)" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="btn-primary">Crear usuario</button>
    </form>
    <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-mute"><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead><tbody>{usuarios.map((u) => <tr key={u.id} className="border-b border-line/70"><td className="p-3"><p className="font-medium">{u.nombre}</p><p className="text-xs text-mute">{u.email}</p></td><td className="p-3 capitalize">{u.rol}</td><td className="p-3">{u.activo ? "Activo" : "Inactivo"}</td><td className="p-3 text-right"><button onClick={() => reset(u)} className="mr-3 text-xs text-mute">Contraseña</button><button onClick={() => toggle(u)} className="text-xs text-wine">{u.activo ? "Desactivar" : "Activar"}</button></td></tr>)}</tbody></table></div>
  </Shell>;
}
