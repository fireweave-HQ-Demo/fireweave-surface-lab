"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./Button";
import { Page, PageHeader } from "./PageHeader";
import { useToast } from "./Toast";

type Route = { payer: string; provider: string; timeOfDay: "morning" | "end_of_day" };
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

function asRoute(row: { payer: string; provider: string; timeOfDay?: string }): Route {
  return { payer: row.payer, provider: row.provider, timeOfDay: row.timeOfDay === "end_of_day" ? "end_of_day" : "morning" };
}

export function RulesForm() {
  const toast = useToast();
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("docs");
  const [need, setNeed] = useState("");
  const [rules, setRules] = useState<Rules>({});
  const [message, setMessage] = useState("");
  const [savedNeed, setSavedNeed] = useState("");
  const [routing, setRouting] = useState<Route[]>([]);
  const [savedRouting, setSavedRouting] = useState<Route[]>([]);
  const [doctors, setDoctors] = useState<string[]>([]);
  const [draftRoute, setDraftRoute] = useState<Route>({ payer: "", provider: "", timeOfDay: "morning" });
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
      const rows = (body.payerRouting ?? []).map(asRoute);
      setRouting(rows);
      setSavedRouting(rows);
      const people = await fetch("/api/members");
      if (people.ok) {
        const list = (await people.json()) as { name?: string; role?: string }[];
        setDoctors(list.filter((row) => row.role === "doctor" && row.name).map((row) => row.name as string));
      }
      const orgs = await fetch("/api/auth/organization/list");
      if (orgs.ok) {
        const list = (await orgs.json().catch(() => null)) as { name?: string }[] | { organizations?: { name?: string }[] } | null;
        const orgRows = Array.isArray(list) ? list : list?.organizations ?? [];
        if (orgRows[0]?.name) setClinic(orgRows[0].name);
      }
    })();
  }, []);

  const dirty = need !== savedNeed || JSON.stringify(routing) !== JSON.stringify(savedRouting);
  const providers = Array.from(new Set([...doctors, ...routing.map((row) => row.provider)].filter(Boolean)));

  function setRoute(index: number, patch: Partial<Route>) {
    setRouting((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRoute() {
    const payer = draftRoute.payer.trim();
    const provider = draftRoute.provider.trim();
    if (!payer || !provider) return;
    const next: Route = { payer, provider, timeOfDay: draftRoute.timeOfDay };
    setRouting((current) => [...current.filter((row) => row.payer.toLowerCase() !== payer.toLowerCase()), next]);
    setDraftRoute({ payer: "", provider: "", timeOfDay: "morning" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    const requiredDocuments = need.split(",").map((item) => item.trim()).filter(Boolean);
    const res = await fetch("/api/rules", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requiredDocuments, payerRouting: routing }),
    });
    setSaving(false);
    setMessage(res.ok ? "Rules saved" : "Could not save the rules");
    if (res.ok) {
      const body = (await res.json()) as { version?: number; payerRouting?: Route[] };
      setSavedNeed(need);
      setSavedRouting((body.payerRouting ?? routing).map(asRoute));
      setRules((current) => ({ ...current, version: body.version ?? (current.version ?? 1) + 1, payerRouting: body.payerRouting ?? routing }));
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
                  setRouting(savedRouting);
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
          <div className="stack">
            {routing.length === 0 ? <p className="muted">Add a doctor in Settings, then route a payer here.</p> : null}
            {routing.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Payer</th>
                    <th scope="col">Provider</th>
                    <th scope="col">Time of day</th>
                    <th scope="col">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {routing.map((row, index) => (
                    <tr key={`${row.payer}-${index}`}>
                      <td>
                        <input
                          type="text"
                          aria-label={`Payer ${index + 1}`}
                          value={row.payer}
                          onChange={(event) => setRoute(index, { payer: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          aria-label={`Provider ${index + 1}`}
                          list="rule-doctors"
                          value={row.provider}
                          onChange={(event) => setRoute(index, { provider: event.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Time of day ${index + 1}`}
                          value={row.timeOfDay}
                          onChange={(event) =>
                            setRoute(index, { timeOfDay: event.target.value === "end_of_day" ? "end_of_day" : "morning" })
                          }
                        >
                          <option value="morning">morning</option>
                          <option value="end_of_day">end_of_day</option>
                        </select>
                      </td>
                      <td>
                        <Button variant="ghost" size="sm" type="button" onClick={() => setRouting((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div className="fields">
              <div>
                <label htmlFor="route-payer">Payer</label>
                <input
                  id="route-payer"
                  type="text"
                  value={draftRoute.payer}
                  placeholder="default"
                  onChange={(event) => setDraftRoute((current) => ({ ...current, payer: event.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="route-provider">Provider</label>
                <input
                  id="route-provider"
                  type="text"
                  list="rule-doctors"
                  value={draftRoute.provider}
                  onChange={(event) => setDraftRoute((current) => ({ ...current, provider: event.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="route-time">Time of day</label>
                <select
                  id="route-time"
                  value={draftRoute.timeOfDay}
                  onChange={(event) =>
                    setDraftRoute((current) => ({ ...current, timeOfDay: event.target.value === "end_of_day" ? "end_of_day" : "morning" }))
                  }
                >
                  <option value="morning">morning</option>
                  <option value="end_of_day">end_of_day</option>
                </select>
              </div>
            </div>
            <datalist id="rule-doctors">
              {providers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <Button variant="secondary" type="button" onClick={addRoute} disabled={!draftRoute.payer.trim() || !draftRoute.provider.trim()}>
              Add route
            </Button>
            <p className="muted">Exact payer first, then payer default, then the first row. Unmatched payers still book if any route exists.</p>
          </div>
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
