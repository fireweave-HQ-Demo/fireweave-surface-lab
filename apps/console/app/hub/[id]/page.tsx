"use client";

import { useEffect, useState } from "react";
import { Button } from "../../../components/Button";
import { Page, PageHeader } from "../../../components/PageHeader";
import { StatusPill } from "../../../components/StatusPill";

type Field = { name: string; value: string };
type Payload = {
  referral: { id: string; patientName: string | null; status: string; triage: string | null; sessionId: string | null };
  fields: Field[];
};

const labels: Record<string, string> = {
  patientName: "Name",
  dob: "Birthday",
  reason: "Why they were sent",
  payer: "Insurance",
  phone: "Phone",
};

export default function HubCard({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetch(`/api/referrals/${id}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      setData(await res.json());
    })();
  }, [id]);

  async function act(action: "approve" | "reject" | "flag") {
    setPending(true);
    const res = await fetch(`/api/referrals/${id}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    setPending(false);
    if (!res.ok || body.outcome === "refused") {
      setError(body.reason ?? "Could not save the decision");
      return;
    }
    if (action === "approve" && data?.referral.sessionId) {
      window.location.href = `/sessions/${data.referral.sessionId}`;
      return;
    }
    window.location.href = "/inbox";
  }

  if (!data?.referral) {
    return (
      <Page>
        <PageHeader title="Review" />
        <p>Loading the chart</p>
      </Page>
    );
  }

  const shown = data.fields.filter((field) => labels[field.name] && field.value);

  return (
    <Page>
      <PageHeader
        crumbs={[{ href: "/inbox", label: "Inbox" }, { label: data.referral.patientName ?? "Referral" }]}
        title={data.referral.patientName ?? "Referral"}
        subtitle="If the name and birthday match the fax, press Looks good."
        actions={
          <>
            <Button variant="primary" loading={pending} onClick={() => void act("approve")}>
              Looks good
            </Button>
            <Button variant="danger-ghost" onClick={() => void act("reject")}>
              Reject
            </Button>
            <Button variant="ghost" onClick={() => void act("flag")}>
              Flag
            </Button>
          </>
        }
      />
      <div className="card stack">
        <StatusPill status={data.referral.status} />
        <div className="fields">
          {shown.map((field) => (
            <div key={field.name}>
              <div className="muted">{labels[field.name]}</div>
              <div className="patient">{field.value}</div>
            </div>
          ))}
        </div>
        {error ? <p className="alert">{error}</p> : null}
      </div>
    </Page>
  );
}
