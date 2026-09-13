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
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl p-6 shadow-xl border border-stone-300 bg-white text-stone-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-stone-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed mb-6">
          {message}
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1 py-2 text-xs"
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
              "flex-1 py-2 text-xs font-semibold rounded-lg shadow-sm transition text-white",
              isDestructive
                ? "bg-rose-700 hover:bg-rose-800"
                : "bg-stone-900 hover:bg-black"
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
