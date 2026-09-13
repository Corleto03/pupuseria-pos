"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import logoOceanSis from "../../public/images/logoOceanSis.jpeg";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [branding, setBranding] = useState({
    nombre: "OceanSis",
    logo: logoOceanSis?.src || "/images/logoOceanSis.jpeg",
  });

  useEffect(() => {
    fetch("/api/ajustes")
      .then((r) => r.json())
      .then((d) => {
        const conf = d.ajustes || d;
        if (conf) {
          setBranding({
            nombre: conf.nombre_restaurante || "OceanSis",
            logo: conf.logo_url || logoOceanSis?.src || "/images/logoOceanSis.jpeg",
          });
          if (typeof document !== "undefined" && conf.nombre_restaurante) {
            document.title = `${conf.nombre_restaurante} — Iniciar Sesión`;
          }
        }
      })
      .catch(() => {});
  }, []);

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
    <form onSubmit={submit} className="card mx-auto w-full max-w-sm p-8 flex flex-col items-center text-center">
      <div className="mb-2 flex items-center justify-center min-h-[96px]">
        <img
          src={branding.logo}
          alt={`${branding.nombre} Logo`}
          className="h-24 w-auto max-w-[200px] object-contain"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = logoOceanSis?.src || "/images/logoOceanSis.jpeg";
          }}
        />
      </div>
      <p className="mt-1 text-sm font-medium text-ink">{branding.nombre}</p>
      <p className="text-xs text-mute">Punto de venta del restaurante</p>
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
