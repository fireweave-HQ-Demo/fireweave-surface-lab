import "@clinic/ui/console.css";
import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "../components/Providers";

export const metadata = { title: "Clinic OS" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
