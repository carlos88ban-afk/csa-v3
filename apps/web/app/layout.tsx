import type { ReactNode } from "react";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-public-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-mono",
});

export const metadata = {
  title: "Plataforma CSA",
  description: "Constructor de evaluaciones empresariales",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${publicSans.variable} ${plexMono.variable}`}>
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
