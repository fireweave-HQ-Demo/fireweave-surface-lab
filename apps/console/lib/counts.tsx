"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Counts = { inbox: number; priorAuth: number };

type CountRow = { status: string; missing?: string[] };

type CountsApi = {
  counts: Counts;
  setInboxRows: (rows: CountRow[]) => void;
  setPriorAuthRows: (rows: CountRow[]) => void;
};

const CountsContext = createContext<CountsApi>({
  counts: { inbox: 0, priorAuth: 0 },
  setInboxRows: () => undefined,
  setPriorAuthRows: () => undefined,
});

function inboxCount(rows: CountRow[]) {
  return rows.filter((row) => row.status === "ready" || row.status === "needs_human" || row.status === "awaiting_review" || row.status === "flagged").length;
}

function priorAuthCount(rows: CountRow[]) {
  return rows.filter((row) => row.status === "draft" && (row.missing?.length ?? 0) > 0).length;
}

export function CountsProvider({ children }: { children: ReactNode }) {
  const [inboxRows, setInboxRows] = useState<CountRow[]>([]);
  const [priorAuthRows, setPriorAuthRows] = useState<CountRow[]>([]);
  const counts = useMemo(
    () => ({ inbox: inboxCount(inboxRows), priorAuth: priorAuthCount(priorAuthRows) }),
    [inboxRows, priorAuthRows],
  );
  const value = useMemo(() => ({ counts, setInboxRows, setPriorAuthRows }), [counts]);
  return <CountsContext.Provider value={value}>{children}</CountsContext.Provider>;
}

export function useCounts() {
  return useContext(CountsContext);
}
