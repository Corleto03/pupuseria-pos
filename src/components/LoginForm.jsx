"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("gerente@pupuseria.local");
  const [password, setPassword] = useState("gerente123");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Error");
      return;
    }
    window.location.href = data.home || "/";
  }

  return (
    <form onSubmit={submit} className="card mx-auto w-full max-w-sm p-8">
      <p className="font-display text-3xl">La Pupusa</p>
      <p className="mt-1 text-sm text-mute">Punto de venta del restaurante</p>
      <div className="mt-8 space-y-3">
        <div>
          <label className="text-xs text-mute">Correo</label>
          <input className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-mute">Contraseña</label>
          <input
            type="password"
            className="input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-wine">{error}</p>}
      <button disabled={saving} className="btn-primary mt-6 w-full">
        {saving ? "Entrando…" : "Entrar"}
      </button>
      <p className="mt-6 text-[11px] leading-relaxed text-mute">
        gerente@ · mesero@ · cocina@ · caja@ (pupuseria.local)
        <br />
        Contraseñas: gerente123, mesero123, cocina123, caja123
      </p>
    </form>
  );
}
