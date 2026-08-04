"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AppHeader() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  if (!session) return null;

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <header>
      <span>{session.user.email}</span>{" "}
      <button type="button" onClick={handleSignOut}>
        Cerrar sesión
      </button>
    </header>
  );
}
