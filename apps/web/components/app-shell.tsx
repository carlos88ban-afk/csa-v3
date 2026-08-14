"use client";

import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();

  if (!session) {
    return <main id="main-content">{children}</main>;
  }

  return (
    <div className="app-shell">
      <AppSidebar />
      <main id="main-content" className="app-shell__main">
        {children}
      </main>
    </div>
  );
}
