"use client";

import { Pause } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Banner } from "../../../components/Banner";
import { Button, IconButton } from "../../../components/Button";
import { Page, PageHeader } from "../../../components/PageHeader";
import { StatusPill } from "../../../components/StatusPill";
import { useToast } from "../../../components/Toast";
import { COPY } from "../../../lib/copy";
import { ERROR_CODES } from "../../../lib/errors";

type EventRow = { id: string; message: string; createdAt?: string };
type Session = { id: string; status: string; referralId?: string; createdAt?: string };
type Referral = { id: string; patientName: string | null; reason?: string | null; confidence?: number | null };

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const toast = useToast();
  const [id, setId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [status, setStatus] = useState("writing");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tick, setTick] = useState(0);
  const [control, setControl] = useState(false);
  const [pauseScroll, setPauseScroll] = useState(false);
  const [stuck, setStuck] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      void (async () => {
        const sessionRes = await fetch(`/api/sessions/${id}`);
        if (sessionRes.ok) {
          const body = (await sessionRes.json()) as Session;
          setSession(body);
          setStatus(body.status);
          if (body.referralId) {
            const ref = await fetch(`/api/referrals/${body.referralId}`);
            if (ref.ok) {
              const pack = (await ref.json()) as { referral?: Referral };
              if (pack.referral) setReferral(pack.referral);
            }
          }
        }
        const log = await fetch(`/api/sessions/${id}/log`);
        if (log.ok) setEvents(await log.json());
        setTick((value) => value + 1);
      })();
    }, 1000);
    return () => clearInterval(timer);
  }, [id]);

  useEffect(() => {
    if (pauseScroll) return;
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [events.length, pauseScroll]);

  useEffect(() => {
    if (!id) return;
    const stream = new EventSource(`/api/sessions/${id}/events`);
    stream.onmessage = (event) => {
      const row = JSON.parse(event.data) as EventRow;
      setEvents((current) => (current.some((item) => item.id === row.id) ? current : [...current, row]));
    };
    return () => stream.close();
  }, [id]);

  async function takeControl() {
    if (control) {
      setControl(false);
      toast.push({ tone: "ok", title: "Control released after 60s idle" });
      return;
    }
    const res = await fetch(`/api/sessions/${id}/lease`, { method: "POST" });
    if (res.ok) {
      setControl(true);
      setStatus("paused");
      window.setTimeout(() => {
        setControl(false);
        toast.push({ tone: "ok", title: "Control released after 60s idle" });
      }, 60_000);
    }
  }

  const done = status === "completed" || status === "complete";
  const patient = referral?.patientName ?? "Session";

  return (
    <Page wide>
      <PageHeader
        crumbs={[{ href: "/inbox", label: "Inbox" }, { label: patient }]}
        title={patient}
        subtitle={`Chart write${session?.createdAt ? ` · ${new Date(session.createdAt).toLocaleString()}` : ""}`}
        actions={
          <Button
            variant="secondary"
            onClick={() => toast.push({ tone: "error", title: "Flag from the session is not implemented.", code: ERROR_CODES.NOT_IMPLEMENTED })}
          >
            Flag
          </Button>
        }
      />
      <p className="live pulse">
        <i />
        Status <strong>{String(status).replaceAll("_", " ")}</strong>
      </p>
      <div className="session section">
        <div className={`card stack frame-wrap ${control ? "control" : ""}`}>
          <div className="chrome">
            <span>http://sandbox-ehr:4010/chart</span>
            <span className="live pulse">
              <i /> Live
            </span>
            <Button variant="outline" size="sm" onClick={() => void takeControl()}>
              {control ? "Controlling — click to release" : "Take control"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.push({ tone: "error", title: "Pop out is not implemented.", code: ERROR_CODES.NOT_IMPLEMENTED })}
            >
              Pop out
            </Button>
          </div>
          {control ? <Banner>You have control. The agent is paused.</Banner> : null}
          <img className="frame" alt="Live session" src={id ? `/api/sessions/${id}/frame?t=${tick}` : ""} />
          <p className="mono muted">
            Frame {tick} · {new Date().toLocaleTimeString()}
          </p>
          <p className="muted">{COPY.takeControlHint}</p>
        </div>
        <div className="stack">
          <div className="card stack">
            <div className="toolbar">
              <div className="patient">{patient}</div>
              <StatusPill status={done ? "complete" : status} />
            </div>
            <div className="fields kv">
              <div>
                <label>Referring</label>
                <div className="val">—</div>
              </div>
              <div>
                <label>Payer</label>
                <div className="val">—</div>
              </div>
              <div>
                <label>Routed to</label>
                <div className="val">Dr. Patel</div>
              </div>
              <div>
                <label>Confidence</label>
                <div className="val mono">{referral?.confidence ?? "—"}</div>
              </div>
            </div>
          </div>
          <div className="card stack">
            {done ? (
              <div className="stack">
                <div>Chart written</div>
                <div>Slot booked · Dr. Patel · 08:00</div>
                <div>Call logged</div>
              </div>
            ) : status === "paused" ? (
              <Banner>Needs your eyes. Take control or flag.</Banner>
            ) : (
              <p>Writing chart… Slot booking follows.</p>
            )}
          </div>
          <div className="card">
            <div className="section-head">
              <p className="card-title">Activity</p>
              <IconButton
                variant="ghost"
                aria-label={pauseScroll ? "Resume autoscroll" : "Pause autoscroll"}
                onClick={() => setPauseScroll((value) => !value)}
              >
                <Pause size={14} />
              </IconButton>
            </div>
            <div
              className="log"
              ref={logRef}
              onScroll={() => {
                const node = logRef.current;
                if (!node) return;
                setStuck(node.scrollHeight - node.scrollTop - node.clientHeight > 24);
              }}
            >
              {events.length === 0 ? <div className="muted">Waiting for the first step.</div> : null}
              {events.map((event) => (
                <div key={event.id}>
                  <span className="mono muted">
                    {event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : ""}
                  </span>{" "}
                  {event.message}
                </div>
              ))}
              {stuck ? (
                <Button
                  className="jump"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setStuck(false);
                    setPauseScroll(false);
                    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
                  }}
                >
                  Jump to latest
                </Button>
              ) : null}
            </div>
          </div>
          <p className="muted">{COPY.notImplementedVoice}</p>
        </div>
      </div>
    </Page>
  );
}
