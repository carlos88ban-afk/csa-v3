"use client";

import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui";
import { ROLE_LABEL, useMe, type Me } from "@/lib/use-me";

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
  const { data: session } = authClient.useSession();
  const { me } = useMe();

  if (!session) return null;

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  const items = me ? NAV[me.appRole] : [];
  const home = me?.appRole === "corporate_admin" ? "/evaluations" : "/mi-evaluacion";

  return (
    <nav className="app-shell__sidebar" aria-label="Navegación principal">
      <a href={home} className="app-sidebar__brand">
        Plataforma CSA
      </a>
      <ul className="app-sidebar__nav">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <a
                href={item.href}
                className={`app-sidebar__nav-item${active ? " app-sidebar__nav-item--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
      <div className="app-sidebar__footer">
        {me && <strong>{me.unitName ? `${me.unitSigla ?? ""} ${me.unitName}`.trim() : "Corporativo"}</strong>}
        {me && <span className="app-sidebar__footer-email">{ROLE_LABEL[me.appRole]}</span>}
        <span className="app-sidebar__footer-email">{session.user.email}</span>
        <Button type="button" size="sm" onClick={handleSignOut}>
          Cerrar sesión
        </Button>
      </div>
    </nav>
  );
}
