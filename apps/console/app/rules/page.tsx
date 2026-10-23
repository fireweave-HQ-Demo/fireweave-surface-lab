"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Page, PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";

type Rules = {
  version?: number;
  requiredNow?: string[];
  triage?: { stat: string[]; symptomatic: string[]; screening: string[] };
  payerRouting?: Array<{ payer: string; provider: string; timeOfDay?: string }>;
  outreach?: { maxAttempts: number; hoursBetween: number; screener: string[] };
};

const tabs = [
  ["docs", "Required documents"],
  ["triage", "Triage"],
  ["routing", "Payer routing"],
  ["autonomy", "Autonomy"],
  ["outreach", "Outreach"],
] as const;

export default function RulesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("docs");
  const [need, setNeed] = useState("");
  const [rules, setRules] = useState<Rules>({});
  const [message, setMessage] = useState("");
  const [savedNeed, setSavedNeed] = useState("");
  const [clinic, setClinic] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/rules");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as Rules;
      setRules(body);
      const value = (body.requiredNow ?? []).join(", ");
      setNeed(value);
      setSavedNeed(value);
      const orgs = await fetch("/api/auth/organization/list");
      if (orgs.ok) {
        const list = (await orgs.json().catch(() => null)) as { name?: string }[] | { organizations?: { name?: string }[] } | null;
        const rows = Array.isArray(list) ? list : list?.organizations ?? [];
        if (rows[0]?.name) setClinic(rows[0].name);
      }
    })();
  }, []);

  const dirty = need !== savedNeed;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    const requiredDocuments = need.split(",").map((item) => item.trim()).filter(Boolean);
    const res = await fetch("/api/rules", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requiredDocuments }),
    });
    setSaving(false);
    setMessage(res.ok ? "Rules saved" : "Could not save the rules");
    if (res.ok) {
      const body = (await res.json()) as { version?: number };
      setSavedNeed(need);
      setRules((current) => ({ ...current, version: body.version ?? (current.version ?? 1) + 1 }));
      toast.push({ tone: "ok", title: `Rules saved · v${body.version ?? (rules.version ?? 1) + 1} · applies to new referrals` });
    }
  }

  const tabLabel = tabs.find((item) => item[0] === tab)?.[1] ?? "Required documents";

  return (
    <Page>
      <PageHeader
        crumbs={[{ href: "/rules", label: "Rules" }, { label: tabLabel }]}
        title="Rules"
        subtitle={clinic ? `Applies to new referrals at ${clinic}` : "Applies to new referrals"}
        actions={
          <>
            {dirty ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setNeed(savedNeed);
                  setMessage("");
                }}
              >
                Discard
              </Button>
            ) : null}
            <Button variant="primary" type="submit" form="rules-form" loading={saving} disabled={!dirty}>
              Save rules
            </Button>
          </>
        }
      />
      <div className="tabs">
        {tabs.map(([id, name]) => (
          <button key={id} className={tab === id ? "on" : ""} type="button" onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      <form id="rules-form" className="card stack" onSubmit={onSubmit}>
        {tab === "docs" ? (
          <div>
            <label htmlFor="need">Required documents</label>
            <input id="need" value={need} onChange={(event) => setNeed(event.target.value)} />
            <p className="muted">When always, require the documents in this list. Save writes this field. Other groups stay on the GI preset.</p>
          </div>
        ) : null}
        {tab === "triage" ? (
          <div className="fields">
            <div className="card stack">
              <div className="toolbar">
                <span className="dot stat" />
                <h2>STAT</h2>
              </div>
              <p>{(rules.triage?.stat ?? []).join(", ")}</p>
            </div>
            <div className="card stack">
              <div className="toolbar">
                <span className="dot warn" />
                <h2>Symptomatic</h2>
              </div>
              <p>{(rules.triage?.symptomatic ?? []).join(", ")}</p>
            </div>
            <div className="card stack">
              <div className="toolbar">
                <span className="dot mute" />
                <h2>Screening</h2>
              </div>
              <p>{(rules.triage?.screening ?? []).join(", ")}</p>
            </div>
          </div>
        ) : null}
        {tab === "routing" ? (
          <table>
            <thead>
              <tr>
                <th scope="col">Payer</th>
                <th scope="col">Provider</th>
                <th scope="col">Time of day</th>
              </tr>
            </thead>
            <tbody>
              {(rules.payerRouting ?? []).map((row) => (
                <tr key={row.payer}>
                  <td>{row.payer}</td>
                  <td>{row.provider}</td>
                  <td className="mono">{row.timeOfDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {tab === "autonomy" ? (
          <p className="muted">Approve all is set when the clinic is created. The API does not expose autonomy yet.</p>
        ) : null}
        {tab === "outreach" ? (
          <p>
            Max attempts {rules.outreach?.maxAttempts ?? 2}. Hours between {rules.outreach?.hoursBetween ?? 24}. Screener:{" "}
            {(rules.outreach?.screener ?? []).join(", ")}
          </p>
        ) : null}
        {message ? <p className="muted">{message}</p> : null}
        <p className="mono muted">Current version: v{rules.version ?? 1}</p>
      </form>
    </Page>
  );
}
