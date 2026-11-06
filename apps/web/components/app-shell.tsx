"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AppSidebar />
      <main id="main-content" className="app-shell__main">
        {children}
      </main>
    </div>
  );
}
