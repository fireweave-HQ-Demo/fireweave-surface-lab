"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Banner } from "../../../components/Banner";
import { Button } from "../../../components/Button";
import { Drawer } from "../../../components/Drawer";
import { Page, PageHeader } from "../../../components/PageHeader";
import { StatusPill } from "../../../components/StatusPill";
import { useToast } from "../../../components/Toast";
import { COPY } from "../../../lib/copy";
import { ERROR_CODES } from "../../../lib/errors";
import { STATUS_META } from "../../../lib/status";

type Member = { id: string; name: string; email: string; role: string };

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
  const [members, setMembers] = useState<Member[] | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", password: "", role: "doctor" });

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
      const list = await fetch("/api/members");
      if (list.ok) setMembers((await list.json()) as Member[]);
    })();
  }, []);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    setAdding(false);
    if (!res.ok) {
      toast.push({
        tone: "error",
        title: res.status === 409 ? COPY.doctorExists : COPY.doctorFailed,
        code: ERROR_CODES.MEMBER_FAILED,
      });
      return;
    }
    const created = (await res.json()) as Member;
    setMembers((current) => [...(current ?? []).filter((row) => row.email !== created.email), created]);
    setDraft({ name: "", email: "", password: "", role: "doctor" });
    setOpen(false);
    toast.push({ tone: "ok", title: COPY.doctorAdded });
  }

  const tabLabel = tabs.find((item) => item[0] === tab)?.[1] ?? "Clinic";

  return (
    <Page>
      <PageHeader
        crumbs={[{ href: "/settings", label: "Settings" }, { label: tabLabel }]}
        title="Settings"
        subtitle={clinic || "Clinic"}
        actions={
          tab === "users" ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              {COPY.addDoctor}
            </Button>
          ) : (
            <Button variant="primary" disabled title="Clinic profile is not writable yet.">
              Save
            </Button>
          )
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
            <span className="mono muted">{members?.length ?? 0}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? [{ id: "me", name: user.name, email: user.email, role: user.role }]).map((row) => (
                <tr key={row.id}>
                  <td className="patient">{row.name || "Staff"}</td>
                  <td className="mono">{row.email}</td>
                  <td>{row.role === "doctor" ? "Doctor" : row.role === "staff" ? "Staff" : row.role}</td>
                </tr>
              ))}
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
          <Banner>Clinic profile and EHR connect are not writable from this screen yet.</Banner>
        </div>
      ) : null}

      {open ? (
        <Drawer
          narrow
          title={COPY.addDoctor}
          onClose={() => setOpen(false)}
          footer={
            <Button variant="primary" type="submit" form="add-doctor" loading={adding}>
              {COPY.addDoctor}
            </Button>
          }
        >
          <form id="add-doctor" className="stack" onSubmit={(event) => void addMember(event)}>
            <div>
              <label htmlFor="doctor-name">Name</label>
              <input
                id="doctor-name"
                type="text"
                value={draft.name}
                required
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="doctor-email">Email</label>
              <input
                id="doctor-email"
                type="email"
                value={draft.email}
                required
                onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="doctor-password">Password</label>
              <input
                id="doctor-password"
                type="password"
                minLength={8}
                value={draft.password}
                required
                onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="doctor-role">Role</label>
              <select id="doctor-role" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}>
                <option value="doctor">Doctor</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            {draft.role === "doctor" ? (
              <p className="muted">The first doctor becomes the default for payers that are not on the routing list.</p>
            ) : (
              <p className="muted">Staff can sign in and work the desk. They are not added to payer routing.</p>
            )}
          </form>
        </Drawer>
      ) : null}
    </Page>
  );
}
