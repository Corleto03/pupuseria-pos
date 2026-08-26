export const fmt = {
  money(n) {
    return new Intl.NumberFormat("es-SV", {
      style: "currency",
      currency: "USD",
    }).format(Number(n || 0));
  },
  time(iso) {
    return new Intl.DateTimeFormat("es-SV", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  },
  date(iso) {
    return new Intl.DateTimeFormat("es-SV", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  },
  day(iso) {
    return new Intl.DateTimeFormat("es-SV", {
      day: "2-digit",
      month: "short",
    }).format(new Date(iso));
  },
};

export const ESTADO_COCINA = {
  borrador: { label: "Sin enviar", next: "pendiente" },
  pendiente: { label: "Pendiente", next: "preparacion" },
  preparacion: { label: "En preparación", next: "entregado" },
  entregado: { label: "Entregado", next: null },
};

export const MASAS = ["Maíz", "Arroz"];
