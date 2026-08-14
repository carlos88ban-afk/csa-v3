"use client";

import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/frameworks", label: "Frameworks" },
  { href: "/organizations", label: "Organizaciones" },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();

  if (!session) return null;

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <nav className="app-shell__sidebar" aria-label="Navegación principal">
      <a href="/frameworks" className="app-sidebar__brand">
        Plataforma CSA
      </a>
      <ul className="app-sidebar__nav">
        {NAV_ITEMS.map((item) => {
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
        {activeOrganization && <strong>{activeOrganization.name}</strong>}
        <span className="app-sidebar__footer-email">{session.user.email}</span>
        <Button type="button" size="sm" onClick={handleSignOut}>
          Cerrar sesión
        </Button>
      </div>
    </nav>
  );
}
