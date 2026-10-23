import "@clinic/ui/console.css";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display" });
const sans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata = { title: "Clinic OS" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} ${mono.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
