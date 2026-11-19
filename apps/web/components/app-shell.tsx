"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AppSidebar } from "@/components/app-sidebar";
import { useMe } from "@/components/me-provider";
import { useNewAnswers } from "@/lib/use-new-answers";

// Mientras se diseña una evaluación (Builder) el menú principal se oculta para
// dar el máximo espacio al documento; un botón lo muestra como panel
// superpuesto cuando se necesita.
const FOCUS_ROUTE = /^\/frameworks\/[^/]+\/builder/;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();
  const pending = useNewAnswers();
  const focus = FOCUS_ROUTE.test(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className={`app-shell${focus ? " app-shell--focus" : ""}${focus && menuOpen ? " app-shell--menu" : ""}`}>
      {focus && menuOpen && <button type="button" className="focus-backdrop" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
      <AppSidebar />
      {focus && (
        <button
          type="button"
          className="focus-menu-btn"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Ocultar menú principal" : "Mostrar menú principal"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰ Menú
        </button>
      )}
      {me.appRole === "corporate_admin" && pending > 0 && !pathname.startsWith("/consultas") && (
        <Link href="/consultas" className="inq-fab__btn inq-alert" role="status">
          <span aria-hidden="true">💬</span> {pending === 1 ? "1 consulta por responder" : `${pending} consultas por responder`}
        </Link>
      )}
      <main id="main-content" className="app-shell__main">
        {children}
      </main>
    </div>
  );
}
