"use client";

import type { ReactNode } from "react";
import { CountsProvider } from "../lib/counts";
import { TickProvider } from "../lib/tick";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TickProvider>
      <ToastProvider>
        <CountsProvider>{children}</CountsProvider>
      </ToastProvider>
    </TickProvider>
  );
}
