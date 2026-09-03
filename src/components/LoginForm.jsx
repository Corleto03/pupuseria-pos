"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import logoOceanSis from "../../public/images/logoOceanSis.jpeg";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const logoSrc = logoOceanSis?.src || "/images/logoOceanSis.jpeg";

  return (
    <form onSubmit={submit} className="card mx-auto w-full max-w-sm p-8 flex flex-col items-center text-center">
      <div className="mb-2 flex items-center justify-center min-h-[96px]">
        <img
          src={logoSrc}
          alt="OceanSis Logo"
          className="h-24 w-auto object-contain"
        />
      </div>
      <p className="mt-1 text-sm text-mute">Punto de venta del restaurante</p>
      <div className="mt-6 space-y-3 w-full text-left">
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
      {error && <p className="mt-3 text-sm text-wine w-full text-left">{error}</p>}
      <button disabled={saving} className="btn-primary mt-6 w-full">
        {saving ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
