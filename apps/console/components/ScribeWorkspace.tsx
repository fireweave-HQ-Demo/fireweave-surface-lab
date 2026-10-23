"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Page, PageHeader } from "./PageHeader";
import { Skeleton } from "./Skeleton";
import { StatusPill } from "./StatusPill";

type Note = { id: string; patientName: string; draft: string; status: string };

export function ScribeWorkspace() {
  const [note, setNote] = useState<Note | null>(null);
  const [recent, setRecent] = useState<Note[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/notes");
      if (res.ok) setRecent(await res.json());
    })();
  }, [note?.status]);

  async function onDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientName: form.get("patientName"), transcript: form.get("transcript") }),
    });
    setBusy(false);
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) {
      setError("Could not draft the note");
      return;
    }
    setNote(await res.json());
  }

  async function approve() {
    if (!note) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${note.id}/commit`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { reason?: string };
      if (!res.ok) {
        setError(body.reason ?? "Could not write the note");
        return;
      }
      setNote({ ...note, status: "completed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Scribe" />
      <div className="scribe">
        <div className="stack">
          <form className="card stack" onSubmit={onDraft}>
            <h2>Draft</h2>
            <div>
              <label htmlFor="patientName">Patient</label>
              <input id="patientName" name="patientName" required />
              <p className="muted mono">Select from this week's appointments</p>
            </div>
            <div>
              <label htmlFor="format">Note format</label>
              <select id="format" defaultValue="hp">
                <option value="hp">History & Physical</option>
                <option value="soap">SOAP</option>
                <option value="progress">Progress</option>
              </select>
            </div>
            <div>
              <label htmlFor="transcript">Transcript</label>
              <textarea id="transcript" name="transcript" required placeholder="Paste the visit transcript here." style={{ minHeight: 240, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            </div>
            <p className="muted">Audio capture is not connected — paste a transcript.</p>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <Button variant="primary" type="submit" loading={busy}>
                Draft note
              </Button>
            </div>
          </form>
          <div className="card stack">
            <h2>Recent notes</h2>
            {recent.length === 0 ? <p className="muted">No notes yet. Draft one from a transcript.</p> : null}
            {recent.slice(-5).map((item) => (
              <div className="attn-row" key={item.id}>
                <span className="patient">{item.patientName}</span>
                <span className="muted">History & Physical</span>
                <StatusPill status={item.status === "completed" ? "written" : "drafted"} />
                <Button variant="ghost" size="sm">
                  Open →
                </Button>
              </div>
            ))}
          </div>
        </div>
        {note ? (
          <div className="card stack">
            <div className="toolbar">
              <h2>Preview</h2>
              <StatusPill status={note.status === "completed" ? "written" : "drafted"} />
            </div>
            <pre className="pre">{note.draft}</pre>
            {note.status === "awaiting_review" ? (
              <div className="actions">
                <Button variant="primary" loading={busy} onClick={() => void approve()}>
                  Looks good
                </Button>
                <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(note.draft)}>
                  Copy
                </Button>
              </div>
            ) : (
              <p>completed</p>
            )}
          </div>
        ) : busy ? (
          <div className="card">
            <Skeleton rows={5} />
          </div>
        ) : (
          <div className="card">
            <EmptyState title="Paste a transcript and press Draft note." />
          </div>
        )}
      </div>
      {error ? <p className="alert">{error}</p> : null}
    </Page>
  );
}
