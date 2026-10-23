"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ConfidenceBar } from "./ConfidenceBar";
import { Drawer } from "./Drawer";
import { EmptyState } from "./EmptyState";
import { Modal } from "./Modal";
import { Page, PageHeader } from "./PageHeader";
import { Skeleton } from "./Skeleton";
import { StatusPill } from "./StatusPill";
import { TriagePill } from "./TriagePill";
import { useToast } from "./Toast";
import { COPY } from "../lib/copy";
import { ERROR_CODES } from "../lib/errors";
import { useCounts } from "../lib/counts";
import { inFlight, listSignature } from "../lib/list";
import { useTick } from "../lib/tick";
import { ago } from "../lib/time";
import { pdfFiles, postReferral } from "../lib/upload";

type Referral = {
  id: string;
  patientName: string | null;
  status: string;
  triage: string | null;
  filename: string;
  detail?: string;
  reason?: string | null;
  confidence?: number | null;
  sessionId?: string | null;
  createdAt?: string;
};

type Field = { name: string; value: string; confidence?: number };

const filters = [
  ["all", "All"],
  ["awaiting_review", "Ready"],
  ["fax_back", "Sent back"],
  ["flagged", "Needs a person"],
  ["ineligible", "Ineligible"],
  ["failed", "Could not read"],
] as const;

function nextLine(row: Referral) {
  if (row.status === "fax_back") return row.detail ? `Send it back — ${row.detail}` : "Send it back";
  if (row.status === "failed") return "Could not read this fax";
  if (row.status === "ineligible") return row.detail || "Ineligible";
  return "";
}

export function InboxTable() {
  const now = useTick();
  const { setInboxRows } = useCounts();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Referral[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState(false);
  const [openId, setOpenId] = useState("");
  const [tab, setTab] = useState<"details" | "pdf">("details");
  const [fields, setFields] = useState<Field[]>([]);
  const [confirm, setConfirm] = useState<"reject" | "flag" | "">("");
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState("");

  async function load() {
    const res = await fetch("/api/referrals");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) return;
    const next = (await res.json()) as Referral[];
    setRows((prev) => (prev && listSignature(prev) === listSignature(next) ? prev : next));
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (rows) setInboxRows(rows);
  }, [rows, setInboxRows]);

  useEffect(() => {
    if (!rows || !inFlight(rows)) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [rows]);

  useEffect(() => {
    if (!openId) return;
    void (async () => {
      const res = await fetch(`/api/referrals/${openId}`);
      if (!res.ok) return;
      const body = (await res.json()) as { fields: Field[] };
      setFields(body.fields ?? []);
    })();
  }, [openId]);

  async function upload(list: FileList | File[]) {
    const batch = pdfFiles(list);
    if (batch.length === 0 || sending) return;
    setSending(true);
    const optimistic = batch.map((file) => ({
      id: `tmp-${file.name}-${file.size}-${file.lastModified}`,
      patientName: file.name,
      status: "extracting",
      triage: null,
      filename: file.name,
    }));
    setRows((current) => [...optimistic, ...(current ?? []).filter((row) => !optimistic.some((item) => item.filename === row.filename && row.id.startsWith("tmp-")))]);
    let failed = 0;
    let lastDuplicate = "";
    for (const file of batch) {
      const result = await postReferral(file);
      if (!result.ok) failed += 1;
      else if (result.duplicate && result.referralId) lastDuplicate = result.referralId;
    }
    await load();
    setSending(false);
    if (failed) {
      toast.push({
        tone: "error",
        title: batch.length === 1 ? "That fax did not go through." : COPY.someFailed,
        code: ERROR_CODES.EXTRACT_FAILED,
      });
      return;
    }
    if (lastDuplicate) {
      toast.push({ tone: "ok", title: COPY.duplicate });
      setFlash(lastDuplicate);
      window.setTimeout(() => setFlash(""), 1500);
    }
  }

  async function act(action: "approve" | "reject" | "flag") {
    if (!openId) return;
    setPending(true);
    const res = await fetch(`/api/referrals/${openId}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    setPending(false);
    if (!res.ok || body.outcome === "refused") {
      toast.push({ tone: "error", title: body.reason ?? "Could not save the decision", code: ERROR_CODES.RUNNER_REFUSED });
      return;
    }
    const sessionId = rows?.find((row) => row.id === openId)?.sessionId;
    setOpenId("");
    setConfirm("");
    await load();
    if (action === "approve" && sessionId) {
      window.location.href = `/sessions/${sessionId}`;
    }
  }

  const visible = useMemo(() => {
    const list = rows ?? [];
    return list.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      const hay = `${row.patientName ?? ""} ${row.filename} ${row.reason ?? ""}`.toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    });
  }, [rows, filter, query]);

  const open = rows?.find((row) => row.id === openId) ?? null;
  const counts = Object.fromEntries(filters.map(([id]) => [id, (rows ?? []).filter((row) => id === "all" || row.status === id).length]));

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDrag(false);
        if (event.dataTransfer.files.length) void upload(event.dataTransfer.files);
      }}
    >
      {drag ? <div className="drop-over">Drop the faxes here</div> : null}
      <Page>
        <PageHeader
          title="Referral inbox"
          subtitle={<span className="mono muted">{rows?.length ?? 0} referrals</span>}
          actions={
            <>
              <input
                className="search"
                placeholder="Search name, DOB, or referring provider"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <input
                id="file"
                ref={fileRef}
                className="hidden-file"
                name="file"
                type="file"
                accept="application/pdf"
                multiple
                onChange={(event) => {
                  if (event.target.files?.length) void upload(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button variant="primary" size="lg" aria-label="Upload" onClick={() => fileRef.current?.click()}>
                Upload referral
              </Button>
            </>
          }
        />
        <div className="filters">
          {filters.map(([id, name]) => (
            <button key={id} className={filter === id ? "chip on" : "chip"} type="button" onClick={() => setFilter(id)}>
              {name}
              <span className="count">{counts[id] ?? 0}</span>
            </button>
          ))}
        </div>
        {rows == null ? <Skeleton /> : null}
        {rows && rows.length === 0 ? (
          <EmptyState
            title={COPY.emptyInbox}
            action={
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                {COPY.emptyInboxCta}
              </Button>
            }
          />
        ) : null}
        {rows && rows.length > 0 && visible.length === 0 ? (
          <EmptyState
            title="Nothing matches these filters."
            action={
              <Button
                variant="ghost"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : null}
        {visible.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th scope="col" style={{ width: "25%" }}>
                  Patient
                </th>
                <th scope="col" style={{ width: "12%" }}>
                  Status
                </th>
                <th scope="col" style={{ width: "10%" }}>
                  Triage
                </th>
                <th scope="col" style={{ width: "15%" }}>
                  Referring
                </th>
                <th scope="col" style={{ width: "10%" }}>
                  Confidence
                </th>
                <th scope="col" style={{ width: "13%" }}>
                  Received
                </th>
                <th scope="col" style={{ width: "5%" }}>
                  {" "}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const ready = row.status === "awaiting_review";
                return (
                  <tr key={row.id} className={flash === row.id ? "row-flash" : ""}>
                    <td>
                      <h2 className="patient">{row.patientName ?? row.filename}</h2>
                      <div className="muted">{row.filename}</div>
                      {row.status === "extracting" ? <div className="read-bar"><i /></div> : null}
                      {nextLine(row) ? <p className="missing">{nextLine(row)}</p> : null}
                    </td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td>
                      <TriagePill triage={row.triage} />
                    </td>
                    <td className="muted">—</td>
                    <td>
                      <ConfidenceBar value={row.confidence ?? null} />
                    </td>
                    <td className="mono muted" title={row.createdAt}>
                      {ago(row.createdAt, now)}
                    </td>
                    <td>
                      {ready ? (
                        <a
                          className="btn btn-primary btn-sm"
                          href={`/hub/${row.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            setTab("details");
                            setOpenId(row.id);
                          }}
                        >
                          Review {row.patientName}
                        </a>
                      ) : (
                        <a className="btn btn-ghost btn-sm" href={`/api/referrals/${row.id}/file`} target="_blank" rel="noreferrer" aria-label="View file">
                          <ChevronRight size={16} aria-hidden="true" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </Page>

      {open ? (
        <Drawer
          title={open.patientName ?? open.filename}
          extra={<StatusPill status={open.status} />}
          onClose={() => setOpenId("")}
          footer={
            open.status === "awaiting_review" ? (
              <>
                <Button variant="primary" loading={pending} onClick={() => void act("approve")}>
                  Looks good
                </Button>
                <Button variant="danger-ghost" onClick={() => setConfirm("reject")}>
                  Reject
                </Button>
                <Button variant="ghost" onClick={() => setConfirm("flag")}>
                  Flag
                </Button>
              </>
            ) : open.status === "fax_back" ? (
              <Button variant="primary" disabled>
                Send back to referring provider
              </Button>
            ) : null
          }
        >
          <div className="tabs">
            <button className={tab === "details" ? "on" : ""} type="button" onClick={() => setTab("details")}>
              Details
            </button>
            <button className={tab === "pdf" ? "on" : ""} type="button" onClick={() => setTab("pdf")}>
              PDF
            </button>
          </div>
          {tab === "details" ? (
            <div className="stack">
              {open.status === "fax_back" ? <Banner>{nextLine(open)}</Banner> : null}
              {open.status === "ineligible" ? <Banner>{open.detail || "Cannot take this referral."}</Banner> : null}
              {open.status === "failed" ? <Banner tone="error">{COPY.unknownFile}</Banner> : null}
              <div className="fields">
                {fields
                  .filter((field) => field.value)
                  .map((field) => (
                    <div key={field.name}>
                      <div className="muted">{field.name}</div>
                      <div className="patient">{field.value}</div>
                    </div>
                  ))}
              </div>
              {open.triage ? (
                <p>
                  Ready for review. {open.reason || ""} {open.triage === "STAT" ? "· STAT" : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <iframe title="Referral PDF" src={`/api/referrals/${open.id}/file`} style={{ width: "100%", height: 420, border: 0 }} />
          )}
        </Drawer>
      ) : null}

      {confirm ? (
        <Modal title={confirm === "reject" ? "Reject referral" : "Flag referral"} onClose={() => setConfirm("")}>
          <p>{confirm === "reject" ? COPY.confirmReject : COPY.confirmFlag}</p>
          <div className="actions">
            <Button variant={confirm === "reject" ? "danger" : "primary"} loading={pending} onClick={() => void act(confirm)}>
              {confirm === "reject" ? "Reject" : "Flag"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm("")}>
              Cancel
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
