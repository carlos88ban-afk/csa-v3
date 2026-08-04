import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";

export const metadata = {
  title: "Plataforma CSA",
  description: "Constructor de evaluaciones empresariales",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
