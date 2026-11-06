"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui";
import { useMe } from "@/components/me-provider";
import { HOME_BY_ROLE, ROLE_LABEL, type Me } from "@/lib/me";

const NAV: Record<Me["appRole"], Array<{ href: string; label: string }>> = {
  corporate_admin: [
    { href: "/evaluations", label: "Evaluación" },
    { href: "/frameworks", label: "Estructura" },
    { href: "/units", label: "Unidades" },
    { href: "/users", label: "Usuarios" },
    { href: "/consolidado", label: "Consolidado" },
    { href: "/consultas", label: "Consultas" },
  ],
  unit_admin: [
    { href: "/mi-evaluacion", label: "Mi evaluación" },
    { href: "/responsables", label: "Responsables" },
    { href: "/users", label: "Usuarios" },
    { href: "/consultas", label: "Consultas" },
  ],
  evaluator: [
    { href: "/mi-evaluacion", label: "Mi evaluación" },
    { href: "/consultas", label: "Consultas" },
  ],
};

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { me } = useMe();

  async function handleSignOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="app-shell__sidebar" aria-label="Navegación principal">
      <Link href={HOME_BY_ROLE[me.appRole]} className="app-sidebar__brand">
        Plataforma CSA
      </Link>
      <ul className="app-sidebar__nav">
        {NAV[me.appRole].map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`app-sidebar__nav-item${active ? " app-sidebar__nav-item--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="app-sidebar__footer">
        <strong>{me.unitName ? `${me.unitSigla ?? ""} ${me.unitName}`.trim() : "Corporativo"}</strong>
        <span className="app-sidebar__footer-email">{ROLE_LABEL[me.appRole]}</span>
        <span className="app-sidebar__footer-email">{me.email}</span>
        <Button type="button" size="sm" onClick={handleSignOut}>
          Cerrar sesión
        </Button>
      </div>
    </nav>
  );
}
