"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";

import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/Toast";
import { playNotificationSound } from "@/lib/sound";
import {
  LayoutGrid,
  UtensilsCrossed,
  CookingPot,
  Wallet,
  BarChart3,
  BookOpen,
  Users,
  History,
  LogOut,
  Menu,
  X,
  Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import clsx from "clsx";

const NAV = [
  { href: "/mesas", label: "Mesas", icon: LayoutGrid, roles: ["superadmin", "admin", "gerente", "mesero", "cajero"] },
  { href: "/llevar", label: "Para llevar", icon: UtensilsCrossed, roles: ["superadmin", "admin", "gerente", "mesero", "cajero"] },
  { href: "/cocina", label: "Cocina (Monitor)", icon: CookingPot, roles: ["superadmin", "admin", "gerente", "cocinero", "mesero", "cajero"] },
  { href: "/cocina/pupusas", label: "Área 1 · Pupusas", icon: CookingPot, roles: ["superadmin", "admin", "gerente", "cocinero"] },
  { href: "/cocina/panes", label: "Área 2 · Panes", icon: CookingPot, roles: ["superadmin", "admin", "gerente", "cocinero"] },
  { href: "/cocina/bebidas", label: "Área 3 · Bebidas/Postres", icon: CookingPot, roles: ["superadmin", "admin", "gerente", "cocinero"] },
  { href: "/caja", label: "Caja", icon: Wallet, roles: ["superadmin", "admin", "gerente", "cajero"] },
  { href: "/historial", label: "Historial", icon: History, roles: ["superadmin", "admin", "gerente", "mesero", "cajero"] },
  { href: "/dashboard", label: "Reportes", icon: BarChart3, roles: ["superadmin", "admin", "gerente"] },
  { href: "/menu", label: "Menú", icon: BookOpen, roles: ["superadmin", "admin", "gerente"] },
  { href: "/usuarios", label: "Usuarios", icon: Users, roles: ["superadmin", "admin"] },
  { href: "/personalizacion", label: "Personalizar", icon: Settings, roles: ["superadmin", "admin"] },
];

export default function Shell({ title, actions, children }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const items = NAV.filter((n) => user && n.roles.includes(user.rol));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [ajustes, setAjustes] = useState({ nombre_restaurante: "OceanSis", logo_url: "" });

  const toast = useToast();

  useEffect(() => {
    fetch("/api/ajustes")
      .then((r) => r.json())
      .then((d) => {
        const conf = d.ajustes || d;
        if (conf) {
          const restName = conf.nombre_restaurante || "OceanSis";
          setAjustes({
            nombre_restaurante: restName,
            logo_url: conf.logo_url || "",
          });
          if (typeof document !== "undefined" && restName) {
            document.title = restName;
          }
        }
      })
      .catch(() => {});
  }, []);

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const lastGlobalToastRef = useRef(new Map());

  const handleGlobalRealtime = useCallback((ev) => {
    if (!user || !toast) return;
    const target = ev?.mesa_numero ? `Mesa ${ev.mesa_numero}` : (ev?.nombre_control || "Salón");
    const isBoss = ["superadmin", "admin", "gerente"].includes(user.rol);
    const isWaiterOrBoss = ["superadmin", "admin", "gerente", "mesero"].includes(user.rol);
    const now = Date.now();

    const canNotify = (key, cooldownMs = 4000) => {
      const last = lastGlobalToastRef.current.get(key) || 0;
      if (now - last > cooldownMs) {
        lastGlobalToastRef.current.set(key, now);
        return true;
      }
      return false;
    };

    if (ev?.table === "pedidos" && ev?.op === "INSERT" && ev?.estado_pago === "pendiente") {
      const dedupeKey = `mesa_${ev.id || ev.id_pedido || target}`;
      if (isBoss && canNotify(dedupeKey)) {
        toast(`Mesa abierta: ${target}`);
      }
    } else if (ev?.table === "detalle_pedidos" && ev?.estado_cocina === "pendiente") {
      const dedupeKey = `comanda_${ev.id_pedido || target}`;
      if (isBoss && !pathname.startsWith("/cocina") && canNotify(dedupeKey)) {
        toast(`Comanda enviada a cocina: ${target}`);
      }
    } else if (ev?.table === "comanda_lista" && ev?.todas_listas) {
      const dedupeKey = `comanda_lista_${ev.id_pedido || target}`;
      if (isWaiterOrBoss && canNotify(dedupeKey)) {
        playNotificationSound("mesero");
        toast(`¡Comanda completa lista para servir (${target})!`);
      }
    } else if (ev?.table === "comanda_estacion_lista") {
      const nombreEstacion = {
        pupusa: "Área 1 · Pupusas",
        panes: "Área 2 · Panes",
        bebida: "Área 3 · Bebidas y Postres",
      }[ev.estacion] || ev.estacion;
      const dedupeKey = `estacion_${ev.estacion}_${ev.id_pedido || target}`;
      if (isWaiterOrBoss && canNotify(dedupeKey)) {
        playNotificationSound("mesero");
        toast(`Platillos de ${nombreEstacion} listos (${target})`);
      }
    } else if (ev?.table === "pedidos" && ev?.estado_pago === "pagada") {
      const dedupeKey = `pago_${ev.id || ev.id_pedido || target}`;
      if (isBoss && pathname !== "/caja" && pathname !== "/dashboard" && canNotify(dedupeKey)) {
        playNotificationSound("cobro");
        toast(`Cobro registrado en Caja (${target})`);
      }
    }
  }, [user, toast, pathname]);

  useRealtime(handleGlobalRealtime);


  const SidebarContent = () => (
    <>
      {/* Header del sidebar */}
      <div className="px-3 py-4 flex items-center justify-between border-b border-line lg:px-5 lg:py-5">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={ajustes.logo_url || "/android-chrome-512x512.png"}
            alt="Logo"
            className="h-8 w-8 rounded-lg object-contain bg-white p-0.5 border border-line shrink-0"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/android-chrome-512x512.png";
            }}
          />
          <div className="hidden lg:block min-w-0">
            <p className="font-semibold text-base leading-none text-ink truncate">
              {ajustes.nombre_restaurante || "OceanSis"}
            </p>
            <p className="mt-1 text-[10px] text-mute uppercase tracking-wider font-medium">POS Salón y Cocina</p>
          </div>
        </div>
        <button
          className="md:hidden p-1 text-mute hover:bg-stone-100 rounded-lg"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3 overflow-y-auto lg:px-3 lg:py-4">
        {items.map((n) => {
          const active = n.href === "/cocina" ? pathname === "/cocina" : (pathname === n.href || pathname.startsWith(n.href + "/"));
          return (
            <Link
              key={n.href}
              href={n.href}
              title={n.label}
              className={clsx(
                "flex items-center rounded-lg text-sm font-medium transition",
                "gap-2.5 px-3 py-2",
                "md:justify-center md:px-2 md:py-2.5 lg:justify-start lg:px-3 lg:py-2",
                active
                  ? "bg-stone-900 text-white shadow-sm"
                  : "text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              )}
            >
              <n.icon size={18} className="shrink-0" />
              <span className="md:hidden lg:inline">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-3 py-3 shrink-0 bg-stone-50/50 lg:px-4 lg:py-4">
        <div className="hidden lg:block">
          <p className="text-xs font-semibold text-stone-900">{user?.nombre}</p>
          <p className="text-[11px] capitalize text-mute">{user?.rol}</p>
        </div>
        <button
          onClick={logout}
          title="Salir del sistema"
          className={clsx(
            "btn-ghost w-full text-xs text-rose-700 hover:bg-rose-50",
            "flex items-center gap-1.5 justify-center md:justify-center lg:justify-start px-2 py-1.5",
            "lg:mt-2"
          )}
        >
          <LogOut size={14} />
          <span className="md:hidden lg:inline">Salir del sistema</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Fija */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-white transition-transform duration-200 md:translate-x-0",
          "w-[260px] md:w-16 lg:w-[220px]",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Área Principal de Contenido */}
      <div className="md:pl-16 lg:pl-[220px] flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper px-4 md:px-8 py-3.5">
          <div className="flex items-center gap-3">
            <button 
              className="p-1 -ml-1 md:hidden text-ink rounded-lg hover:bg-stone-200" 
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={22} />
            </button>
            <h1 className="font-semibold text-lg md:text-xl text-stone-900 truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>

        <main className="px-4 py-4 md:px-8 md:py-6 flex-1 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
