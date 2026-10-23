"use client";

import { useMemo, useState, useEffect } from "react";
import { Banner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { Drawer } from "../../components/Drawer";
import { EmptyState } from "../../components/EmptyState";
import { Page, PageHeader } from "../../components/PageHeader";
import { Skeleton } from "../../components/Skeleton";
import { StatusPill } from "../../components/StatusPill";
import { useToast } from "../../components/Toast";
import { useCounts } from "../../lib/counts";
import { COPY } from "../../lib/copy";
import { ERROR_CODES } from "../../lib/errors";

type Referral = { id: string; patientName: string | null };
type Auth = {
  id: string;
  referralId?: string;
  patientName: string;
  cpt: string;
  diagnosis: string;
  serviceDate: string;
  necessity: string;
  status: string;
  authNumber: string | null;
};

function gaps(auth: { cpt: string; diagnosis: string; serviceDate: string }) {
  const missing: string[] = [];
  if (!auth.cpt.trim()) missing.push("CPT");
  if (!auth.diagnosis.trim()) missing.push("diagnosis");
  if (!auth.serviceDate.trim()) missing.push("service date");
  return missing;
}

function pillStatus(status: string) {
  if (status === "draft") return "drafted";
  if (status === "approved" || status === "denied" || status === "submitted") return status;
  return "drafted";
}

const chips = [
  ["all", "All"],
  ["draft", "Draft"],
  ["submitted", "Submitted"],
  ["approved", "Approved"],
  ["denied", "Denied"],
] as const;

export default function PriorAuthPage() {
  const { setPriorAuthRows } = useCounts();
  const toast = useToast();
  const [referrals, setReferrals] = useState<Referral[] | null>(null);
  const [auths, setAuths] = useState<Auth[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState("");
  const [drafting, setDrafting] = useState("");

  async function load() {
    const res = await fetch("/api/prior-auths");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) return;
    const body = (await res.json()) as { auths: Auth[]; referrals: Referral[] };
    setAuths(body.auths);
    setReferrals(body.referrals);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (auths) setPriorAuthRows(auths.map((row) => ({ status: row.status, missing: gaps(row) })));
  }, [auths, setPriorAuthRows]);

  async function draft(referralId: string) {
    setDrafting(referralId);
    const res = await fetch("/api/prior-auths", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referralId }),
    });
    setDrafting("");
    if (!res.ok) {
      toast.push({ tone: "error", title: COPY.authDraftFailed, code: ERROR_CODES.SUBMIT_BLOCKED });
      return;
    }
    const created = (await res.json()) as Auth;
    setAuths((current) => [created, ...(current ?? []).filter((row) => row.id !== created.id)]);
    setReferrals((current) => (current ?? []).filter((row) => row.id !== referralId));
    setOpenId(created.id);
    setFilter("all");
    await load();
  }

  function edit(id: string, patch: Partial<Auth>) {
    setAuths((current) => (current ?? []).map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function submit(auth: Auth) {
    setBusy(auth.id);
    const res = await fetch(`/api/prior-auths/${auth.id}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cpt: auth.cpt, diagnosis: auth.diagnosis, serviceDate: auth.serviceDate }),
    });
    const body = await res.json();
    setBusy("");
    if (!res.ok) {
      toast.push({
        tone: "error",
        title: body.missing ? `Missing: ${body.missing.join(", ")}` : COPY.authPayerFailed,
        code: body.missing ? ERROR_CODES.SUBMIT_BLOCKED : ERROR_CODES.RUNNER_REFUSED,
      });
      return;
    }
    await load();
  }

  const waiting = referrals ?? [];
  const rows = auths ?? [];
  const visible = useMemo(
    () => rows.filter((row) => filter === "all" || row.status === filter),
    [rows, filter],
  );
  const open = rows.find((row) => row.id === openId) ?? null;
  const missing = open ? gaps(open) : [];
  const counts = Object.fromEntries(chips.map(([id]) => [id, rows.filter((row) => id === "all" || row.status === id).length]));
  const loaded = referrals !== null && auths !== null;
  const empty = loaded && waiting.length === 0 && rows.length === 0;
  const canEdit = open?.status === "draft";

  return (
    <Page>
      <PageHeader
        title="Prior auth"
        subtitle={
          <span className="mono muted">
            {loaded ? `${waiting.length} waiting · ${rows.length} drafts` : "—"}
          </span>
        }
      />

      {!loaded ? <Skeleton /> : null}

      {empty ? (
        <EmptyState
          title={COPY.emptyAuth}
          action={
            <Button variant="secondary" onClick={() => {
              window.location.href = "/inbox";
            }}>
              {COPY.emptyAuthNext}
            </Button>
          }
        />
      ) : null}

      {waiting.length > 0 ? (
        <div className="card stack section">
          <div className="section-head">
            <h2>Ready to draft</h2>
            <span className="mono muted">{waiting.length}</span>
          </div>
          {waiting.map((referral) => (
            <div className="attn-row" key={referral.id}>
              <div>
                <div className="patient">{referral.patientName ?? "Unknown"}</div>
                <p className="missing">{COPY.authReady}</p>
              </div>
              <span />
              <span />
              <Button variant="primary" size="sm" loading={drafting === referral.id} onClick={() => void draft(referral.id)}>
                Draft {referral.patientName}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="section">
          <div className="filters">
            {chips.map(([id, name]) => (
              <button key={id} className={filter === id ? "chip on" : "chip"} type="button" onClick={() => setFilter(id)}>
                {name}
                <span className="count">{counts[id] ?? 0}</span>
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <EmptyState
              title={COPY.authEmptyFilter}
              action={
                <Button variant="ghost" onClick={() => setFilter("all")}>
                  Show all
                </Button>
              }
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">CPT</th>
                  <th scope="col">Status</th>
                  <th scope="col">Auth #</th>
                  <th scope="col"> </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((auth) => {
                  const miss = gaps(auth);
                  return (
                    <tr key={auth.id}>
                      <td>
                        <h2 className="patient">{auth.patientName}</h2>
                        {miss.length ? <p className="missing">Needs {miss.join(", ")}</p> : null}
                      </td>
                      <td className="mono">{auth.cpt || "—"}</td>
                      <td>
                        <StatusPill status={pillStatus(auth.status)} />
                      </td>
                      <td>
                        {auth.authNumber ? (
                          <button className="auth-number" type="button" onClick={() => void navigator.clipboard.writeText(auth.authNumber ?? "")}>
                            {auth.authNumber}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => setOpenId(auth.id)}>
                          Review {auth.patientName}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {open ? (
        <Drawer
          title={open.patientName}
          extra={<StatusPill status={pillStatus(open.status)} />}
          onClose={() => setOpenId("")}
          footer={
            canEdit ? (
              <Button variant="primary" loading={busy === open.id} disabled={missing.length > 0} onClick={() => void submit(open)}>
                Submit authorization
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setOpenId("")}>
                Close
              </Button>
            )
          }
        >
          <div className="stack">
            {missing.length > 0 ? <Banner sticky>Missing: {missing.join(", ")}</Banner> : null}
            {open.status === "denied" ? (
              <Banner tone="error">
                {COPY.notImplementedPA} <code>{ERROR_CODES.NOT_IMPLEMENTED}</code>
              </Banner>
            ) : null}
            <div className="fields">
              <div>
                <label htmlFor={`cpt-${open.id}`}>CPT</label>
                <input
                  id={`cpt-${open.id}`}
                  value={open.cpt}
                  readOnly={!canEdit}
                  onChange={(event) => edit(open.id, { cpt: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`dx-${open.id}`}>Diagnosis</label>
                <input
                  id={`dx-${open.id}`}
                  value={open.diagnosis}
                  readOnly={!canEdit}
                  onChange={(event) => edit(open.id, { diagnosis: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`date-${open.id}`}>Service date</label>
                <input
                  id={`date-${open.id}`}
                  value={open.serviceDate}
                  readOnly={!canEdit}
                  onChange={(event) => edit(open.id, { serviceDate: event.target.value })}
                />
              </div>
            </div>
            <div>
              <h2>Medical necessity</h2>
              <p>{open.necessity}</p>
            </div>
            {canEdit ? (
              <div className="actions">
                <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(open.necessity)}>
                  Copy draft
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (open.referralId) window.open(`/api/referrals/${open.referralId}/file`, "_blank");
                    else toast.push({ tone: "error", title: "PDF is not available for this draft.", code: ERROR_CODES.NOT_IMPLEMENTED });
                  }}
                >
                  Download PDF
                </Button>
              </div>
            ) : null}
            {open.status === "approved" ? (
              <p className="muted">This authorization is on the payer. Copy the number from the row.</p>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </Page>
  );
}
