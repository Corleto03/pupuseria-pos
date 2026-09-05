"use client";

import { useState } from "react";
import { X, Eye, EyeOff, Check, AlertCircle, KeyRound } from "lucide-react";
import clsx from "clsx";

export default function ChangePasswordModal({
  isOpen,
  usuario,
  onClose,
  onSuccess,
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen || !usuario) return null;

  const isMinLength = password.length >= 12;
  const isMatching = password.length > 0 && password === confirmPassword;
  const canSubmit = isMinLength && isMatching && !loading;

  function handleClose() {
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setError("");
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isMinLength) {
      setError("La contraseña debe contener al menos 12 caracteres.");
      return;
    }
    if (!isMatching) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo actualizar la contraseña");
      }

      handleClose();
      if (onSuccess) onSuccess("Contraseña actualizada exitosamente");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-line text-ink transition-all animate-zoom-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
              <KeyRound size={22} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-ink">
                Cambiar Contraseña
              </h3>
              <p className="text-xs text-mute mt-0.5">
                Para <span className="font-semibold text-ink">{usuario.nombre}</span> ({usuario.email})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-mute hover:text-ink hover:bg-stone-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Nueva Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Mínimo 12 caracteres..."
                required
                className="input w-full pr-10 text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-ink transition-colors p-1 cursor-pointer"
                title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className={clsx(isMinLength ? "text-emerald-700 font-medium" : "text-mute")}>
                {isMinLength ? "✓ Longitud válida" : "Mínimo 12 caracteres"}
              </span>
              <span className={clsx("font-mono", isMinLength ? "text-emerald-700" : "text-stone-400")}>
                {password.length}/12
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Confirmar Nueva Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Repita la contraseña..."
                required
                className="input w-full pr-10 text-sm"
              />
            </div>
            {confirmPassword.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                {isMatching ? (
                  <span className="text-emerald-700 font-medium flex items-center gap-1">
                    <Check size={12} /> Las contraseñas coinciden
                  </span>
                ) : (
                  <span className="text-rose-600 font-medium flex items-center gap-1">
                    <AlertCircle size={12} /> Las contraseñas no coinciden
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="pt-2 flex gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-line text-mute hover:text-ink hover:bg-stone-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={clsx(
                "flex-1 py-2.5 text-xs font-semibold rounded-xl text-paper transition-all shadow-sm",
                canSubmit
                  ? "bg-ink hover:bg-stone-800 cursor-pointer"
                  : "bg-stone-300 text-stone-500 cursor-not-allowed"
              )}
            >
              {loading ? "Guardando..." : "Guardar Contraseña"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
