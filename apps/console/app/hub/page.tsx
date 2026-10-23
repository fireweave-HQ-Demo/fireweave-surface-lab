"use client";

import { useEffect, useState } from "react";
import { Page, PageHeader } from "../../components/PageHeader";

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
      if (!stop) setRows(all.filter((row) => row.status === "awaiting_review"));
    }
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

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
