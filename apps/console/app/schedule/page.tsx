"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../../components/Button";
import { Drawer } from "../../components/Drawer";
import { EmptyState } from "../../components/EmptyState";
import { Page, PageHeader } from "../../components/PageHeader";
import { Skeleton } from "../../components/Skeleton";
import { StatusPill } from "../../components/StatusPill";
import { weekRange } from "../../lib/time";

type Appointment = { id: string; patientName: string; provider: string; day: string; slot: string; timeOfDay: string; referralId?: string };

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hours = Array.from({ length: 21 }, (_, index) => {
  const hour = 7 + Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

export default function SchedulePage() {
  const [rows, setRows] = useState<Appointment[] | null>(null);
  const [provider, setProvider] = useState("all");
  const [open, setOpen] = useState<Appointment | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/appointments");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) setRows(await res.json());
    })();
  }, []);

  const providers = useMemo(() => Array.from(new Set((rows ?? []).map((row) => row.provider))), [rows]);
  const shown = (rows ?? []).filter((row) => provider === "all" || row.provider === provider);

  return (
    <Page wide>
      <PageHeader
        title="Schedule"
        subtitle={weekRange()}
        actions={
          <>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} aria-label="Provider">
              <option value="all">All providers</option>
              {providers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <IconButton variant="ghost" aria-label="Previous week" disabled>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton variant="ghost" aria-label="Next week" disabled>
              <ChevronRight size={16} />
            </IconButton>
            <Button variant="secondary">Today</Button>
          </>
        }
      />
      {rows == null ? <Skeleton /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No bookings this week. Approved referrals land here after a slot is booked." /> : null}
      {rows && rows.length > 0 ? (
        <>
          <div className="week">
            <div className="cell muted">Time</div>
            {days.map((day) => (
              <div className="cell" key={day}>
                <strong>{day}</strong>
                <div className="muted">{provider === "all" ? "Dr. Patel" : provider} · GI</div>
              </div>
            ))}
            {hours.map((slot) => (
              <div key={slot} style={{ display: "contents" }}>
                <div className={`cell muted mono${slot.endsWith("00") ? " hour" : ""}`}>{slot}</div>
                {days.map((day) => {
                  const booked = shown.find((row) => row.slot === slot);
                  const show = booked && day === days[0];
                  return (
                    <div
                      className={`cell ${show ? "booked" : "empty-slot"}`}
                      key={`${day}-${slot}`}
                      title={show ? undefined : "Manual booking is not enabled."}
                      onClick={() => {
                        if (show && booked) setOpen(booked);
                      }}
                    >
                      {show && booked ? (
                        <>
                          <div className="patient">{booked.patientName}</div>
                          <div className="mono">{booked.slot}</div>
                          <div className="via">via AI</div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <table className="section">
            <thead>
              <tr>
                <th scope="col">Patient</th>
                <th scope="col">Provider</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} onClick={() => setOpen(row)}>
                  <td className="patient">{row.patientName}</td>
                  <td>{row.provider}</td>
                  <td className="mono">
                    {row.day} {row.slot}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Manual booking is not enabled.</p>
        </>
      ) : null}
      {open ? (
        <Drawer
          narrow
          title={open.patientName}
          extra={<StatusPill status="complete" />}
          onClose={() => setOpen(null)}
          footer={
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Close
            </Button>
          }
        >
          <div className="stack kv">
            <div>
              <label>Booked via</label>
              <div className="val">
                <a href="/inbox">Referral</a>
              </div>
            </div>
            <div>
              <label>Provider</label>
              <div className="val">{open.provider}</div>
            </div>
            <div>
              <label>Time</label>
              <div className="val mono">
                {open.day} {open.slot}
              </div>
            </div>
            <div>
              <label>Referring</label>
              <div className="val">—</div>
            </div>
            <div>
              <label>Payer</label>
              <div className="val">—</div>
            </div>
          </div>
        </Drawer>
      ) : null}
    </Page>
  );
}
