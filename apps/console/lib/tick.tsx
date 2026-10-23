"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ago } from "./time";

const TickContext = createContext(Date.now());

export function TickProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return <TickContext.Provider value={now}>{children}</TickContext.Provider>;
}

export function useTick() {
  return useContext(TickContext);
}

export function useAgo(value?: string) {
  return ago(value, useTick());
}
