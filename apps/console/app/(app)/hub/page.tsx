"use client";

import { useEffect, useState } from "react";
import { Page, PageHeader } from "../../../components/PageHeader";
import { inFlight, listSignature } from "../../../lib/list";

type Referral = { id: string; patientName: string | null; status: string; triage: string | null };

export default function HubIndex() {
  const [rows, setRows] = useState<Referral[]>([]);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch("/api/referrals");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const all = (await res.json()) as Referral[];
      const waiting = all.filter((row) => row.status === "awaiting_review");
      if (stop) return;
      setRows((prev) => (listSignature(prev) === listSignature(waiting) ? prev : waiting));
    }
    void load();
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!inFlight(rows)) return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/referrals");
      if (!res.ok) return;
      const all = (await res.json()) as Referral[];
      const waiting = all.filter((row) => row.status === "awaiting_review");
      setRows((prev) => (listSignature(prev) === listSignature(waiting) ? prev : waiting));
    }, 5000);
    return () => clearInterval(timer);
  }, [rows]);

  return (
    <Page>
      <PageHeader title="Patient hub" subtitle="These people are waiting for a yes." />
      {rows.length === 0 ? <p className="muted">Nothing is waiting for review.</p> : null}
      {rows.map((row) => (
        <a className="attn-row" key={row.id} href={`/hub/${row.id}`}>
          <strong>{row.patientName}</strong>
          <div className="muted">{row.triage || "Ready for you"}</div>
        </a>
      ))}
    </Page>
  );
}
