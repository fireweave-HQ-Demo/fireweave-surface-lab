"use client";

import { useCallback, useEffect, useState } from "react";

export type Counts = { inbox: number; priorAuth: number };

export function useCounts() {
  const [counts, setCounts] = useState<Counts>({ inbox: 0, priorAuth: 0 });

  const refresh = useCallback(async () => {
    const [inboxRes, authRes] = await Promise.all([fetch("/api/referrals"), fetch("/api/prior-auths")]);
    const next: Counts = { inbox: 0, priorAuth: 0 };
    if (inboxRes.ok) {
      const rows = (await inboxRes.json()) as { status: string }[];
      next.inbox = rows.filter((row) => row.status === "awaiting_review" || row.status === "needs_human" || row.status === "ready").length;
    }
    if (authRes.ok) {
      const body = (await authRes.json()) as { auths?: { status: string }[] };
      next.priorAuth = (body.auths ?? []).filter((row) => row.status === "draft" || row.status === "blocked").length;
    }
    setCounts(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { counts, refresh };
}
