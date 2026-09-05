"use client";

import { useEffect, useState, useRef } from "react";
import Shell from "@/components/Shell";
import { useToast } from "@/components/Toast";
import { Image as ImageIcon, Upload, Trash2 } from "lucide-react";

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

  useEffect(() => {
    load();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("El archivo debe ser una imagen", "err");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast("La imagen debe pesar menos de 2 MB", "err");
      return;
    }

    setSelectedFile(file);
    setRemoveLogo(false);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("El archivo debe ser una imagen", "err");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast("La imagen debe pesar menos de 2 MB", "err");
      return;
    }

    setSelectedFile(file);
    setRemoveLogo(false);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleQuitarLogo = () => {
    setSelectedFile(null);
    setPreviewUrl("");
    setRemoveLogo(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast("El nombre del restaurante es obligatorio", "err");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("nombre_restaurante", nombre.trim());
      if (removeLogo) {
        formData.append("eliminar_logo", "true");
      } else if (selectedFile) {
        formData.append("logo", selectedFile);
      }

      const res = await fetch("/api/ajustes", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "No se pudieron guardar los cambios");
      }

      toast("Ajustes de personalización guardados");
      
      setSelectedFile(null);
      setPreviewUrl("");
      setRemoveLogo(false);
      await load();
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Personalización del Local">
      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="card p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Branding y Personalización</h2>
            <p className="text-sm text-mute mt-1">
              Modifica la apariencia del POS y los tickets de venta impresos para adaptarlos a tu restaurante.
            </p>
          </div>

          <div className="space-y-4">
            {/* Restaurant Name */}
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

            {/* Logo Image */}
            <div>
              <label className="label block text-sm font-medium mb-1.5">
                Logo o Icono del Restaurante
              </label>
              
              <div className="grid gap-6 md:grid-cols-[160px_1fr] items-center">
                {/* Logo Preview */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex flex-col items-center justify-center h-40 w-40 rounded-2xl border border-line bg-stone-50 overflow-hidden relative group">
                    {(!removeLogo && (previewUrl || logoUrl)) ? (
                      <img
                        src={previewUrl || logoUrl}
                        alt="Vista previa del logo"
                        className="max-h-full max-w-full p-2 object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-mute">
                        <ImageIcon size={32} strokeWidth={1.5} />
                        <span className="text-[10px] mt-1">Sin logo</span>
                      </div>
                    )}
                  </div>
                  {(!removeLogo && (previewUrl || logoUrl)) && (
                    <button
                      type="button"
                      onClick={handleQuitarLogo}
                      className="text-xs text-wine hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Trash2 size={13} />
                      Quitar logo
                    </button>
                  )}
                </div>

                {/* File Upload Dropzone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-line hover:border-clay/50 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[160px] bg-paper"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="h-10 w-10 bg-clay/10 rounded-full flex items-center justify-center text-clay mb-3">
                    <Upload size={18} />
                  </div>
                  <p className="text-sm font-medium text-ink">
                    Haz clic para subir o arrastra una imagen aquí
                  </p>
                  <p className="text-xs text-mute mt-1.5">
                    Formatos recomendados: PNG, JPG (máx. 2MB, preferiblemente fondo transparente)
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setPreviewUrl("");
                load();
              }}
              disabled={loading || saving}
              className="btn-ghost"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || saving || !nombre.trim()}
              className="btn-primary min-w-[120px]"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
