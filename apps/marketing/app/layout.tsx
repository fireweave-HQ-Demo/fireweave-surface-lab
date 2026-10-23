import "@clinic/ui/paper.css";
import type { ReactNode } from "react";

export const metadata = { title: "Clinic OS" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
