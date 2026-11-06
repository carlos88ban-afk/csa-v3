import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MeProvider } from "@/components/me-provider";
import { getServerMe } from "@/lib/server-me";

// Todo lo privado vive aqui: sin sesion valida no se renderiza nada (ni el
// sidebar) y se redirige en el servidor. El layout persiste entre
// navegaciones: el shell no se vuelve a montar.
export default async function PrivateLayout({ children }: { children: ReactNode }) {
  const me = await getServerMe();
  if (!me) redirect("/login");
  return (
    <MeProvider me={me}>
      <AppShell>{children}</AppShell>
    </MeProvider>
  );
}
