"use client";

import { useEffect, useState, useRef } from "react";
import Shell from "@/components/Shell";
import { useToast } from "@/components/Toast";
import { Image as ImageIcon, Upload, Trash2, Printer, CheckCircle, XCircle, Loader } from "lucide-react";
import { getHardwareConfig, saveHardwareConfig, dispararAperturaGaveta, probarImpresora } from "@/lib/hardwareBridge";

// ─── Configuración por defecto de cada impresora ─────────────────────────────
const IMPRESORAS_META = [
  {
    key: "pupusa",
    label: "Impresora Área 1 (Pupusas)",
    descripcion: "Recibe comandas de pupusas. Puerto por defecto: 8085.",
    defaultUrl: "http://localhost:8085",
    color: "amber",
  },
  {
    key: "panes",
    label: "Impresora Área 2 (Panes con Gallina)",
    descripcion: "Recibe comandas de panes con gallina. Puerto por defecto: 8086.",
    defaultUrl: "http://localhost:8086",
    color: "purple",
  },
  {
    key: "caja",
    label: "Impresora Área 3 y Caja Principal (Bebidas, Postres y Cobro)",
    descripcion: "Recibe tickets de cobro, abre la gaveta, y comanda de bebidas y postres. Puerto por defecto: 8087.",
    defaultUrl: "http://localhost:8087",
    color: "sky",
    esCaja: true,
  },
];


export default function PersonalizacionPage() {
  const [nombre, setNombre] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToast();

  // ─── Estado de hardware ───────────────────────────────────────────────────
  const [hwConfig, setHwConfig] = useState(getHardwareConfig());
  const [probando, setProbando] = useState({}); // { pupusa: true/false, ... }
  const [testResult, setTestResult] = useState({}); // { pupusa: 'ok'|'error', ... }

  useEffect(() => {
    setHwConfig(getHardwareConfig());
  }, []);

  // Actualiza un campo de una impresora específica
  const setImpresoraField = (key, field, value) => {
    setHwConfig((prev) => ({
      ...prev,
      impresoras: {
        ...prev.impresoras,
        [key]: { ...(prev.impresoras?.[key] || {}), [field]: value },
      },
    }));
  };

  const handleGuardarHardware = (e) => {
    e?.preventDefault();
    saveHardwareConfig(hwConfig);
    toast("Configuración de hardware POS guardada");
  };

  const handleProbarImpresora = async (key) => {
    setProbando((p) => ({ ...p, [key]: true }));
    setTestResult((r) => ({ ...r, [key]: null }));
    try {
      // Guardar primero para que probarImpresora lea la config actualizada
      saveHardwareConfig(hwConfig);
      const res = await probarImpresora(key);
      setTestResult((r) => ({ ...r, [key]: res.ok ? "ok" : "error" }));
      if (res.ok) toast(`Ticket de prueba enviado a impresora "${key}"`);
      else toast(res.error || `No se pudo conectar con impresora "${key}"`, "err");
    } catch {
      setTestResult((r) => ({ ...r, [key]: "error" }));
      toast("Error al probar la impresora", "err");
    } finally {
      setProbando((p) => ({ ...p, [key]: false }));
    }
  };

  const handleProbarGaveta = async () => {
    setProbando((p) => ({ ...p, gaveta: true }));
    try {
      saveHardwareConfig(hwConfig);
      const res = await dispararAperturaGaveta("prueba_personalizacion");
      if (res.ok) toast("Apertura de gaveta ejecutada y registrada en auditoría");
      else toast(res.error || "No se pudo abrir la gaveta", "err");
    } catch {
      toast("Error al comunicarse con la gaveta", "err");
    } finally {
      setProbando((p) => ({ ...p, gaveta: false }));
    }
  };

  // ─── Carga de ajustes ────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ajustes");
      if (!res.ok) throw new Error("No se pudieron cargar los ajustes");
      const data = await res.json();
      setNombre(data.nombre_restaurante || "");
      setLogoUrl(data.logo_url || "");
      setRemoveLogo(false);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!ALLOWED_TYPES.includes((file.type || "").toLowerCase())) {
      toast("Solo se permiten imágenes en formato PNG, JPG o WebP", "err");
      return;
    }
    if (file.size > 2 * 1024 * 1024) { toast("La imagen debe pesar menos de 2 MB", "err"); return; }
    setSelectedFile(file);
    setRemoveLogo(false);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!ALLOWED_TYPES.includes((file.type || "").toLowerCase())) {
      toast("Solo se permiten imágenes en formato PNG, JPG o WebP", "err"); return;
    }
    if (file.size > 2 * 1024 * 1024) { toast("La imagen debe pesar menos de 2 MB", "err"); return; }
    setSelectedFile(file);
    setRemoveLogo(false);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleQuitarLogo = () => { setSelectedFile(null); setPreviewUrl(""); setRemoveLogo(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) { toast("El nombre del restaurante es obligatorio", "err"); return; }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("nombre_restaurante", nombre.trim());
      if (removeLogo) formData.append("eliminar_logo", "true");
      else if (selectedFile) formData.append("logo", selectedFile);
      const res = await fetch("/api/ajustes", { method: "POST", body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "No se pudieron guardar los cambios");
      }
      toast("Ajustes de personalización guardados");
      setSelectedFile(null); setPreviewUrl(""); setRemoveLogo(false);
      await load();
      setTimeout(() => { window.location.reload(); }, 1000);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Personalización del Local">
      <div className="max-w-3xl space-y-6">

        {/* ─── Branding ──────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="card p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Branding y Personalización</h2>
            <p className="text-sm text-mute mt-1">
              Modifica la apariencia del POS y los tickets de venta impresos para adaptarlos a tu restaurante.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label block text-sm font-medium mb-1.5" htmlFor="nombre">
                Nombre del Restaurante
              </label>
              <input
                id="nombre"
                type="text"
                className="input w-full"
                placeholder="Nombre del local (ej. Pupusería Gloria)"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                disabled={loading || saving}
              />
            </div>

            <div>
              <label className="label block text-sm font-medium mb-1.5">Logo o Icono del Restaurante</label>
              <div className="grid gap-6 md:grid-cols-[160px_1fr] items-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex flex-col items-center justify-center h-40 w-40 rounded-2xl border border-line bg-stone-50 overflow-hidden relative group">
                    {(!removeLogo && (previewUrl || logoUrl)) ? (
                      <img src={previewUrl || logoUrl} alt="Vista previa del logo" className="max-h-full max-w-full p-2 object-contain" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-mute">
                        <ImageIcon size={32} strokeWidth={1.5} />
                        <span className="text-[10px] mt-1">Sin logo</span>
                      </div>
                    )}
                  </div>
                  {(!removeLogo && (previewUrl || logoUrl)) && (
                    <button type="button" onClick={handleQuitarLogo} className="text-xs text-wine hover:underline flex items-center gap-1 font-semibold">
                      <Trash2 size={13} /> Quitar logo
                    </button>
                  )}
                </div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-line hover:border-clay/50 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[160px] bg-paper"
                >
                  <input ref={fileInputRef} type="file" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} className="hidden" />
                  <div className="h-10 w-10 bg-clay/10 rounded-full flex items-center justify-center text-clay mb-3">
                    <Upload size={18} />
                  </div>
                  <p className="text-sm font-medium text-ink">Haz clic para subir o arrastra una imagen aquí</p>
                  <p className="text-xs text-mute mt-1.5">Formatos recomendados: PNG, JPG (máx. 2MB, preferiblemente fondo transparente)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-5 flex justify-end gap-3">
            <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(""); load(); }} disabled={loading || saving} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={loading || saving || !nombre.trim()} className="btn-primary min-w-[120px]">
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>

        {/* ─── Hardware POS — 3 Impresoras ────────────────────────────────── */}
        <form onSubmit={handleGuardarHardware} className="card p-6 md:p-8 space-y-6">
          <div className="flex items-start gap-3">
            <Printer size={20} className="text-ink mt-0.5 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-ink">Hardware POS — Impresoras y Gaveta</h2>
              <p className="text-sm text-mute mt-1">
                Configura hasta 3 impresoras térmicas independientes. Cada área de cocina puede tener su propia impresora.
                Las bebidas siempre van a la impresora de caja. Si una impresora de área falla, puede redirigirse a caja automáticamente.
              </p>
            </div>
          </div>

          {/* Opciones globales */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-stone-700 uppercase tracking-wider">Opciones Globales</p>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hwConfig.fallback_a_caja ?? true}
                onChange={(e) => setHwConfig((p) => ({ ...p, fallback_a_caja: e.target.checked }))}
                className="h-4 w-4 rounded border-stone-300 cursor-pointer"
              />
              <span className="font-medium text-ink">Fallback a caja si una impresora de área falla</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hwConfig.imprimir_todo_en_caja ?? false}
                onChange={(e) => setHwConfig((p) => ({ ...p, imprimir_todo_en_caja: e.target.checked }))}
                className="h-4 w-4 rounded border-stone-300 cursor-pointer"
              />
              <span className="font-medium text-ink">Imprimir copia completa de la comanda también en caja</span>
            </label>
          </div>

          {/* Una fila por impresora */}
          <div className="space-y-4">
            {IMPRESORAS_META.map((imp) => {
              const cfg = hwConfig.impresoras?.[imp.key] || {};
              const isProbando = probando[imp.key];
              const result = testResult[imp.key];

              return (
                <div key={imp.key} className={`border rounded-xl p-4 space-y-3 transition ${cfg.enabled ? "border-stone-300 bg-white" : "border-stone-200 bg-stone-50/60"}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        id={`hw-${imp.key}`}
                        checked={cfg.enabled ?? false}
                        onChange={(e) => setImpresoraField(imp.key, "enabled", e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-stone-300 cursor-pointer"
                      />
                      <label htmlFor={`hw-${imp.key}`} className="cursor-pointer">
                        <p className={`text-sm font-semibold ${cfg.enabled ? "text-ink" : "text-stone-400"}`}>{imp.label}</p>
                        <p className="text-xs text-mute mt-0.5">{imp.descripcion}</p>
                      </label>
                    </div>

                    {/* Resultado del test */}
                    {result === "ok" && <CheckCircle size={18} className="text-emerald-600 shrink-0" />}
                    {result === "error" && <XCircle size={18} className="text-rose-600 shrink-0" />}
                  </div>

                  {cfg.enabled && (
                    <div className="flex gap-2 flex-wrap items-center pl-6">
                      <input
                        type="text"
                        className="input flex-1 min-w-[200px] font-mono text-xs"
                        placeholder={imp.defaultUrl}
                        value={cfg.url || imp.defaultUrl}
                        onChange={(e) => setImpresoraField(imp.key, "url", e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={isProbando}
                        onClick={() => handleProbarImpresora(imp.key)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50 transition flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {isProbando ? <><Loader size={12} className="animate-spin" /> Probando...</> : "Imprimir Prueba"}
                      </button>
                      {imp.esCaja && (
                        <button
                          type="button"
                          disabled={probando.gaveta}
                          onClick={handleProbarGaveta}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:opacity-50 transition whitespace-nowrap"
                        >
                          {probando.gaveta ? "Probando..." : "Probar Gaveta"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-line pt-4 flex justify-end">
            <button type="submit" className="btn-primary min-w-[140px]">
              Guardar Hardware
            </button>
          </div>
        </form>

      </div>
    </Shell>
  );
}
