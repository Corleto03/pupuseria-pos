"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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
  { href: "/cocina", label: "Cocina", icon: CookingPot, roles: ["superadmin", "admin", "gerente", "cocinero", "mesero", "cajero"] },
  { href: "/caja", label: "Caja", icon: Wallet, roles: ["superadmin", "admin", "gerente", "cajero"] },
  { href: "/historial", label: "Historial", icon: History, roles: ["superadmin", "admin", "gerente", "mesero", "cajero"] },
  { href: "/dashboard", label: "Reportes", icon: BarChart3, roles: ["superadmin", "admin", "gerente"] },
  { href: "/menu", label: "Menú", icon: BookOpen, roles: ["superadmin", "admin", "gerente"] },
  { href: "/usuarios", label: "Usuarios", icon: Users, roles: ["superadmin", "admin"] },
  { href: "/personalizacion", label: "Personalizar", icon: Settings, roles: ["superadmin", "admin"] },
];

export default function Shell({ title, actions, children, dark = false }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const items = NAV.filter((n) => user && n.roles.includes(user.rol));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [ajustes, setAjustes] = useState({ nombre_restaurante: "La Pupusa", logo_url: "" });

  useEffect(() => {
    fetch("/api/ajustes")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.nombre_restaurante !== undefined) {
          setAjustes(data);
        }
      })
      .catch(() => {});
  }, []);

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const SidebarContent = () => (
    <>
      <div className="px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {ajustes.logo_url && (
            <img
              src={ajustes.logo_url}
              alt="Logo"
              className="h-9 w-9 rounded-lg object-contain bg-white p-0.5 border border-line"
            />
          )}
          <div>
            <p className={clsx("font-display text-lg leading-none font-semibold", dark ? "text-stone-100" : "text-ink")}>
              {ajustes.nombre_restaurante || "La Pupusa"}
            </p>
            <p className={clsx("mt-1 text-[10px]", dark ? "text-stone-500" : "text-mute")}>POS del local</p>
          </div>
        </div>
        <button 
          className="md:hidden p-1 text-mute hover:bg-black/5 rounded-lg"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 overflow-y-auto">
        {items.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-xl px-3 py-3 md:py-2.5 text-sm transition-colors",
                active
                  ? dark
                    ? "bg-white/10 text-white"
                    : "bg-ink text-paper"
                  : dark
                    ? "text-stone-400 hover:bg-white/5 hover:text-white"
                    : "text-mute hover:bg-black/5 hover:text-ink"
              )}
            >
              <n.icon size={18} className="md:w-4 md:h-4" />
              <span className="font-medium md:font-normal">{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className={clsx("border-t px-4 py-4 shrink-0", dark ? "border-white/10" : "border-line")}>
        <p className="text-sm font-medium">{user?.nombre}</p>
        <p className={clsx("text-xs capitalize", dark ? "text-stone-500" : "text-mute")}>{user?.rol}</p>
        <button onClick={logout} className="btn-ghost mt-2 w-full justify-start px-2 py-2 text-xs md:py-1">
          <LogOut size={16} className="md:w-3.5 md:h-3.5" /> Salir
        </button>
      </div>
    </>
  );

  return (
    <div className={clsx("min-h-screen", dark ? "bg-[#111110] text-stone-100" : "bg-paper text-ink")}>
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] md:w-[220px] flex-col border-r transition-transform duration-300 ease-in-out md:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          dark ? "border-white/10 bg-[#161614]" : "border-line bg-paper md:bg-white/70 md:backdrop-blur"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="md:pl-[220px] flex flex-col min-h-screen">
        <header
          className={clsx(
            "sticky top-0 z-30 flex items-center justify-between border-b px-4 md:px-8 py-3 md:py-4",
            dark ? "border-white/10 bg-[#111110]/90 backdrop-blur" : "border-line bg-paper/90 backdrop-blur"
          )}
        >
          <div className="flex items-center gap-3">
            <button 
              className="p-1 -ml-1 md:hidden text-ink rounded-lg hover:bg-black/5" 
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1 className="font-display text-xl md:text-2xl truncate">{title}</h1>
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
