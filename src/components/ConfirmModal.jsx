"use client";

import { X } from "lucide-react";
import clsx from "clsx";

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onClose,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDestructive = true,
  dark = false,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div
        className={clsx(
          "w-full max-w-sm rounded-2xl p-6 shadow-2xl border transition-all animate-zoom-in",
          dark
            ? "bg-[#1c1b18] border-white/10 text-stone-100"
            : "bg-white border-line text-ink"
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className={clsx("font-display text-lg font-bold", dark ? "text-stone-100" : "text-ink")}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={clsx(
              "rounded-lg p-1 transition-colors",
              dark ? "text-stone-400 hover:text-white hover:bg-white/10" : "text-mute hover:text-ink hover:bg-stone-100"
            )}
          >
            <X size={18} />
          </button>
        </div>
        <p className={clsx("text-sm leading-relaxed mb-6", dark ? "text-stone-400" : "text-mute")}>
          {message}
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className={clsx(
              "flex-1 py-2.5 text-xs font-semibold rounded-xl border transition-colors",
              dark
                ? "bg-transparent border-white/15 text-stone-300 hover:bg-white/10"
                : "btn-ghost border-line text-mute hover:text-ink"
            )}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={clsx(
              "flex-1 py-2.5 text-xs font-semibold rounded-xl text-white shadow-sm transition-all",
              isDestructive
                ? "bg-wine hover:bg-wine/90"
                : "bg-ink hover:bg-stone-800"
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
