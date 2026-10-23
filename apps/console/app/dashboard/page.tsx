"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Page, PageHeader } from "../../components/PageHeader";
import { StatusPill } from "../../components/StatusPill";
import { useToast } from "../../components/Toast";
import { ERROR_CODES } from "../../lib/errors";
import { ago, clock, todayLabel } from "../../lib/time";
import { pdfFiles, postReferral } from "../../lib/upload";

type Summary = {
  completed: number;
  pending: number;
  flagged: number;
  faxBack: number;
  calls: number;
  authorizations: number;
};

type Referral = {
  id: string;
  patientName: string | null;
  status: string;
  sessionId?: string | null;
  createdAt?: string;
  filename?: string;
};

type Audit = { id: string; action: string; subjectId: string; actor: string; createdAt?: string };

export default function DashboardPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Referral[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void (async () => {
      const dash = await fetch("/api/dashboard");
      if (dash.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (dash.ok) setSummary(await dash.json());
      const list = await fetch("/api/referrals");
      if (list.ok) setRows(await list.json());
      const log = await fetch("/api/audit");
      if (log.ok) setAudit(await log.json());
    })();
  }, []);

  async function upload(list: FileList | File[]) {
    const batch = pdfFiles(list);
    if (batch.length === 0 || sending) return;
    setSending(true);
    let failed = 0;
    for (const file of batch) {
      const result = await postReferral(file);
      if (!result.ok) failed += 1;
    }
    setSending(false);
    if (failed) {
      toast.push({
        tone: "error",
        title: batch.length === 1 ? "That fax did not go through." : "Some faxes did not go through.",
        code: ERROR_CODES.EXTRACT_FAILED,
      });
      return;
    }
    window.location.href = "/inbox";
  }

  const attention = rows
    .filter((row) => row.status === "awaiting_review" || row.status === "needs_human" || row.status === "ready" || row.status === "flagged")
    .slice(0, 5);
  const writing = rows.filter((row) => row.status === "writing" && row.sessionId);
  const names = Object.fromEntries(rows.map((row) => [row.id, row.patientName ?? row.filename ?? row.id]));

  return (
    <Page wide>
      <PageHeader
        title="Dashboard"
        subtitle={todayLabel()}
        actions={
          <>
            <input
              className="hidden-file"
              type="file"
              accept="application/pdf"
              multiple
              ref={fileRef}
              onChange={(event) => {
                if (event.target.files?.length) void upload(event.target.files);
                event.target.value = "";
              }}
            />
            <Button variant="primary" size="lg" aria-label="Upload" loading={sending} onClick={() => fileRef.current?.click()}>
              Upload referral
            </Button>
          </>
        }
      />
      <div className="stat-grid">
        <div className="card stat-card">
          <p className="label">Completed</p>
          <h2>{summary ? summary.completed : "0"}</h2>
        </div>
        <div className="card stat-card">
          <p className="label">Waiting for you</p>
          <div className={`num${summary && summary.pending > 0 ? " hot" : ""}`}>{summary ? summary.pending : "0"}</div>
        </div>
        <div className="card stat-card">
          <p className="label">Sent back today</p>
          <div className="num">{summary ? summary.faxBack : "0"}</div>
        </div>
        <div className="card stat-card">
          <p className="label">Flagged</p>
          <div className="num">{summary ? summary.flagged : "0"}</div>
        </div>
      </div>
      <div className="fields section">
        <div className="card">
          <p className="label">Calls</p>
          <h2>{summary?.calls ?? 0}</h2>
        </div>
        <div className="card">
          <p className="label">Authorizations</p>
          <h2>{summary?.authorizations ?? 0}</h2>
        </div>
      </div>
      <div className="card stack section">
        <div className="section-head">
          <h2>Needs your attention</h2>
          <a href="/inbox">View all →</a>
        </div>
        {attention.length === 0 ? (
          <EmptyState
            title="Nothing needs your attention. Upload a referral to get started."
            action={
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                Upload referral
              </Button>
            }
          />
        ) : (
          attention.map((row) => (
            <a className="attn-row" key={row.id} href="/inbox">
              <span className="patient">{row.patientName ?? row.filename}</span>
              <StatusPill status={row.status} />
              <span className="muted">—</span>
              <span className="mono muted">{ago(row.createdAt)}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          ))
        )}
      </div>
      {writing.length > 0 ? (
        <div className="card stack section">
          <h2>Writes in flight</h2>
          {writing.map((row) => (
            <a className="attn-row" key={row.id} href={`/sessions/${row.sessionId}`}>
              <span className="patient">{row.patientName}</span>
              <span className="live pulse">
                <i />
              </span>
              <span className="muted">Writing chart · {ago(row.createdAt)}</span>
              <span />
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : null}
      <div className="card stack section">
        <h2>Recent activity</h2>
        <div className="log activity-log">
          {audit.length === 0 ? <p className="muted">Nothing yet today.</p> : null}
          {audit
            .slice(-20)
            .reverse()
            .map((row) => (
              <div key={row.id}>
                <span className="mono muted">{clock(row.createdAt)}</span> <strong>{row.action}</strong> {names[row.subjectId] ?? ""}{" "}
                <span className="muted">· {row.actor}</span>
              </div>
            ))}
        </div>
      </div>
    </Page>
  );
}
