"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui";

export function AppHeader() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  if (!session) return null;

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <header className="app-header">
      <a href="/frameworks" className="app-header__mark">
        Plataforma CSA
      </a>
      <div className="app-header__session">
        <span>{session.user.email}</span>
        <Button type="button" size="sm" onClick={handleSignOut}>
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}
