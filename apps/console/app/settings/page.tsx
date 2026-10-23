"use client";

import { useEffect, useState } from "react";
import { Banner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { Page, PageHeader } from "../../components/PageHeader";
import { StatusPill } from "../../components/StatusPill";
import { useToast } from "../../components/Toast";
import { ERROR_CODES } from "../../lib/errors";
import { STATUS_META } from "../../lib/status";

const tabs = [
  ["clinic", "Clinic"],
  ["users", "Users"],
  ["integrations", "Integrations"],
] as const;

export default function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("clinic");
  const [clinic, setClinic] = useState("");
  const [user, setUser] = useState({ name: "", email: "", role: "Staff" });

  useEffect(() => {
    void (async () => {
      const session = await fetch("/api/auth/get-session");
      if (session.ok) {
        const body = (await session.json()) as { user?: { name?: string; email?: string } };
        if (body.user) setUser((current) => ({ ...current, name: body.user?.name ?? "", email: body.user?.email ?? "" }));
      }
      const me = await fetch("/api/me");
      if (me.ok) {
        const body = (await me.json()) as { role?: string };
        if (body.role) setUser((current) => ({ ...current, role: body.role ?? "Staff" }));
      }
      const orgs = await fetch("/api/auth/organization/list");
      if (orgs.ok) {
        const list = (await orgs.json().catch(() => null)) as { name?: string }[] | { organizations?: { name?: string }[] } | null;
        const rows = Array.isArray(list) ? list : list?.organizations ?? [];
        if (rows[0]?.name) setClinic(rows[0].name);
      }
    })();
  }, []);

  const tabLabel = tabs.find((item) => item[0] === tab)?.[1] ?? "Clinic";

  return (
    <Page>
      <PageHeader
        crumbs={[{ href: "/settings", label: "Settings" }, { label: tabLabel }]}
        title="Settings"
        subtitle={clinic || "Clinic"}
        actions={
          <Button variant="primary" disabled title="Clinic profile is not writable yet.">
            Save
          </Button>
        }
      />
      <div className="tabs">
        {tabs.map(([id, name]) => (
          <button key={id} className={tab === id ? "on" : ""} type="button" onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      {tab === "clinic" ? (
        <div className="card stack">
          <div>
            <label htmlFor="clinic-name">Clinic name</label>
            <input id="clinic-name" value={clinic} readOnly />
          </div>
          <div>
            <label htmlFor="address">Address</label>
            <textarea id="address" readOnly placeholder="Not set" />
          </div>
          <div>
            <label htmlFor="tz">Timezone</label>
            <select id="tz" disabled defaultValue="America/Los_Angeles">
              <option>America/Los_Angeles</option>
            </select>
          </div>
          <div>
            <label htmlFor="specialty">Default specialty</label>
            <input id="specialty" defaultValue="GI" readOnly />
          </div>
          <div className="info-box">Changing the specialty changes the default Rules preset. Existing rules are not overwritten.</div>
          <h2>Status colors</h2>
          <div className="status-legend">
            {Object.keys(STATUS_META).map((status) => (
              <StatusPill key={status} status={status} />
            ))}
          </div>
        </div>
      ) : null}
      {tab === "users" ? (
        <div className="card stack">
          <div className="section-head">
            <h2>Members</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast.push({ tone: "error", title: "Invite is not implemented.", code: ERROR_CODES.NOT_IMPLEMENTED })}
            >
              Invite user
            </Button>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Last active</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="patient">{user.name || "Staff"}</td>
                <td className="mono">{user.email}</td>
                <td>{user.role}</td>
                <td className="mono muted">now</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === "integrations" ? (
        <div className="stack">
          <div className="card stack">
            <h2>EHR login</h2>
            <p className="muted">Not connected</p>
            <Button variant="primary" disabled title="Sandbox EHR is used in this build.">
              Connect EHR
            </Button>
          </div>
          <div className="card stack">
            <h2>Browser extension</h2>
            <p className="muted">Not installed</p>
            <Button
              variant="secondary"
              onClick={() => toast.push({ tone: "error", title: "Extension download is not implemented.", code: ERROR_CODES.NOT_IMPLEMENTED })}
            >
              Download extension
            </Button>
          </div>
          <div className="card stack">
            <h2>OpenObserve</h2>
            <p className="muted">Telemetry is configured in this build. The console does not expose a link.</p>
            <Button
              variant="secondary"
              onClick={() => toast.push({ tone: "error", title: "Configure is not implemented.", code: ERROR_CODES.NOT_IMPLEMENTED })}
            >
              Configure
            </Button>
          </div>
          <Banner>Clinic profile, invites, and EHR connect are not writable from this screen yet.</Banner>
        </div>
      ) : null}
    </Page>
  );
}
