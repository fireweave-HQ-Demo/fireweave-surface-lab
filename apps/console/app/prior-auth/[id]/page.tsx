"use client";

import { useEffect, useState } from "react";
import { Banner } from "../../../components/Banner";
import { Button } from "../../../components/Button";
import { Page, PageHeader } from "../../../components/PageHeader";
import { StatusPill } from "../../../components/StatusPill";
import { COPY } from "../../../lib/copy";
import { ERROR_CODES } from "../../../lib/errors";

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

function gaps(auth: Auth) {
  const missing: string[] = [];
  if (!auth.cpt.trim()) missing.push("CPT");
  if (!auth.diagnosis.trim()) missing.push("diagnosis");
  if (!auth.serviceDate.trim()) missing.push("service date");
  return missing;
}

export default function PriorAuthDetail({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [auth, setAuth] = useState<Auth | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetch("/api/prior-auths");
      if (!res.ok) return;
      const body = (await res.json()) as { auths: Auth[] };
      setAuth(body.auths.find((row) => row.id === id) ?? null);
    })();
  }, [id]);

  async function submit() {
    if (!auth) return;
    setBusy(true);
    const res = await fetch(`/api/prior-auths/${auth.id}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cpt: auth.cpt, diagnosis: auth.diagnosis, serviceDate: auth.serviceDate }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.missing ? `Missing: ${body.missing.join(", ")}` : "The payer did not accept the request");
      return;
    }
    window.location.href = "/auth";
  }

  if (!auth) {
    return (
      <Page>
        <PageHeader crumbs={[{ href: "/auth", label: "Prior auth" }, { label: "Draft" }]} title="Prior auth" />
        <p className="muted">This draft is not on this clinic.</p>
      </Page>
    );
  }

  const missing = gaps(auth);

  return (
    <Page>
      <PageHeader
        crumbs={[{ href: "/auth", label: "Prior auth" }, { label: auth.patientName }]}
        title={auth.patientName}
        subtitle="Authorization draft"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (auth.referralId) window.open(`/api/referrals/${auth.referralId}/file`, "_blank");
              }}
            >
              Download PDF
            </Button>
            <Button variant="primary" loading={busy} disabled={missing.length > 0} onClick={() => void submit()}>
              Submit authorization
            </Button>
          </>
        }
      />
      {missing.length > 0 ? <Banner sticky>Missing: {missing.join(", ")}</Banner> : null}
      {auth.status === "denied" ? (
        <Banner tone="error">
          {COPY.notImplementedPA} <code>{ERROR_CODES.NOT_IMPLEMENTED}</code>
        </Banner>
      ) : null}
      {auth.authNumber ? <button className="auth-number" type="button">{auth.authNumber}</button> : null}
      <div className="card stack section">
        <div>
          <label htmlFor="cpt">CPT</label>
          <input id="cpt" value={auth.cpt} onChange={(event) => setAuth({ ...auth, cpt: event.target.value })} />
        </div>
        <div>
          <label htmlFor="dx">Diagnosis</label>
          <input id="dx" value={auth.diagnosis} onChange={(event) => setAuth({ ...auth, diagnosis: event.target.value })} />
        </div>
        <div>
          <label htmlFor="date">Service date</label>
          <input id="date" value={auth.serviceDate} onChange={(event) => setAuth({ ...auth, serviceDate: event.target.value })} />
        </div>
        <p>{auth.necessity}</p>
      </div>
      {error ? <p className="alert">{error}</p> : null}
    </Page>
  );
}
