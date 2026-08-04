import type { ReactNode } from "react";

export const metadata = {
  title: "Plataforma CSA",
  description: "Constructor de evaluaciones empresariales",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
