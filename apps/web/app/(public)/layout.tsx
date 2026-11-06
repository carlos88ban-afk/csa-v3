import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { HOME_BY_ROLE } from "@/lib/me";
import { getServerMe } from "@/lib/server-me";

// Con sesion activa, login/registro no se muestran: se va directo al inicio.
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const me = await getServerMe();
  if (me) redirect(HOME_BY_ROLE[me.appRole]);
  return <div id="main-content">{children}</div>;
}
