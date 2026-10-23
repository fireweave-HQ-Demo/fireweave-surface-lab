import { createHash } from "node:crypto";
import { serve } from "@hono/node-server";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  activityEvents,
  agentSessions,
  approvalTokens,
  auditLog,
  documents,
  extractedFields,
  referrals,
} from "@clinic/db";
import { commit, readApprovalToken } from "@clinic/domain";
import { auth } from "./auth";
import { staff } from "./authz";
import { withClinic } from "./db";
import { registerDesk } from "./desk";
import { env } from "./env";
import { migrate } from "./migrate";
import { recordSpan, startTelemetry } from "./otel";
import { ensureBucket, getPdf, putPdf } from "./storage";
import { signalReview, temporal } from "./temporal";
import { retry } from "./wait";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/me", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  return c.json(who);
});

app.get("/api/referrals", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const rows = await withClinic(who.clinicId, (tx) =>
    tx.select().from(referrals).where(eq(referrals.clinicId, who.clinicId)).orderBy(asc(referrals.createdAt)),
  );
  return c.json(rows);
});

app.get("/api/referrals/:id", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const row = await withClinic(who.clinicId, async (tx) => {
    const [referral] = await tx.select().from(referrals).where(eq(referrals.id, id));
    const fields = await tx.select().from(extractedFields).where(eq(extractedFields.referralId, id));
    return { referral, fields };
  });
  if (!row.referral) return c.json({ error: "missing" }, 404);
  return c.json(row);
});

app.post("/api/referrals", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  if (who.role === "auditor") return c.json({ error: "forbidden" }, 403);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > 50 * 1024 * 1024) return c.json({ error: "too large" }, 400);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filename = file.name || "referral.pdf";
  const created = await withClinic(who.clinicId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.clinicId, who.clinicId), eq(documents.sha256, sha256)));
    if (existing) {
      const [referral] = await tx.select().from(referrals).where(eq(referrals.documentId, existing.id));
      return { referralId: referral?.id, duplicate: true };
    }
    const documentId = crypto.randomUUID();
    const referralId = crypto.randomUUID();
    const objectKey = `clinics/${who.clinicId}/documents/${documentId}`;
    await putPdf(objectKey, bytes);
    await tx.insert(documents).values({
      id: documentId,
      clinicId: who.clinicId,
      objectKey,
      sha256,
      filename,
    });
    await tx.insert(referrals).values({
      id: referralId,
      clinicId: who.clinicId,
      documentId,
      status: "extracting",
      filename,
    });
    return { referralId, duplicate: false };
  });
  if (!created.referralId) return c.json({ error: "create failed" }, 500);
  if (!created.duplicate) {
    await recordSpan("referral.start", { clinic_id: who.clinicId, referral_id: created.referralId });
    const client = await temporal();
    await client.workflow.start("ReferralFlow", {
      taskQueue: "clinic-ts",
      workflowId: `referral-${created.referralId}`,
      args: [
        {
          referralId: created.referralId,
          clinicId: who.clinicId,
          filename,
          sandboxUrl: env.sandboxEhrUrl,
        },
      ],
    });
  }
  return c.json(created, 201);
});

app.get("/api/referrals/:id/file", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const file = await withClinic(who.clinicId, async (tx) => {
    const [referral] = await tx.select().from(referrals).where(eq(referrals.id, id));
    if (!referral?.documentId) return null;
    const [document] = await tx.select().from(documents).where(eq(documents.id, referral.documentId));
    return document ?? null;
  });
  if (!file) return c.json({ error: "missing" }, 404);
  const bytes = await getPdf(file.objectKey);
  return new Response(bytes, { headers: { "content-type": "application/pdf" } });
});

app.post("/api/referrals/:id/commit", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  if (who.role === "auditor") return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json<{ action?: "approve" | "reject" | "flag" }>();
  const action = body.action ?? "approve";
  const result = await withClinic(who.clinicId, (tx) =>
    commit(tx, {
      clinicId: who.clinicId,
      referralId: c.req.param("id"),
      actorId: who.userId,
      action,
      secret: env.dataKey,
    }),
  );
  if (result.outcome === "applied") {
    await recordSpan("referral.commit", { clinic_id: who.clinicId, referral_id: c.req.param("id"), action });
    await signalReview({
      workflowId: `referral-${c.req.param("id")}`,
      clinicId: who.clinicId,
      referralId: c.req.param("id"),
      sandboxUrl: env.sandboxEhrUrl,
      payload: { action, token: result.token },
    });
  }
  const { token: _token, ...publicResult } = result.outcome === "applied" ? result : { ...result, token: undefined };
  return c.json(publicResult);
});

app.get("/api/sessions/:id", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const [sessionRow] = await withClinic(who.clinicId, (tx) =>
    tx.select().from(agentSessions).where(eq(agentSessions.id, c.req.param("id"))),
  );
  if (!sessionRow) return c.json({ error: "missing" }, 404);
  return c.json(sessionRow);
});

app.get("/api/sessions/:id/log", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const rows = await withClinic(who.clinicId, (tx) =>
    tx
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.sessionId, c.req.param("id")))
      .orderBy(asc(activityEvents.createdAt)),
  );
  return c.json(rows);
});

app.get("/api/sessions/:id/events", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const sessionId = c.req.param("id");
  const encoder = new TextEncoder();
  let last = "";
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        const rows = await withClinic(who.clinicId, (tx) =>
          tx.select().from(activityEvents).where(eq(activityEvents.sessionId, sessionId)).orderBy(asc(activityEvents.createdAt)),
        );
        const fresh = rows.filter((row) => row.id > last);
        for (const row of fresh) {
          last = row.id;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
        }
      };
      await send();
      const timer = setInterval(() => {
        send().catch(() => clearInterval(timer));
      }, 1000);
      setTimeout(() => {
        clearInterval(timer);
        controller.close();
      }, 60_000);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
});

app.post("/api/sessions/:id/lease", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const paused = await withClinic(who.clinicId, async (tx) => {
    const [sessionRow] = await tx.select().from(agentSessions).where(eq(agentSessions.id, id));
    if (!sessionRow || sessionRow.status !== "running") return false;
    await tx.update(agentSessions).set({ leaseHolder: who.userId, status: "paused" }).where(eq(agentSessions.id, id));
    return true;
  });
  if (!paused) return c.json({ held: false }, 409);
  await recordSpan("session.lease", { clinic_id: who.clinicId, session_id: id });
  await fetch(`${env.browserRunnerUrl}/sessions/${id}/handoff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ held: true }),
  }).catch(() => undefined);
  return c.json({ held: true });
});

app.get("/api/sessions/:id/frame", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const frame = await fetch(`${env.browserRunnerUrl}/sessions/${c.req.param("id")}/frame`);
  if (!frame.ok) return c.body(null, 204);
  return new Response(frame.body, { headers: { "content-type": "image/png" } });
});

app.get("/api/audit", async (c) => {
  const who = await staff(c);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  const rows = await withClinic(who.clinicId, (tx) => tx.select().from(auditLog).where(eq(auditLog.clinicId, who.clinicId)));
  return c.json(rows);
});

app.post("/internal/tokens/consume", async (c) => {
  if (c.req.header("x-internal-token") !== env.internalToken) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json<{ token?: string }>();
  const payload = body.token ? readApprovalToken(body.token, env.dataKey) : null;
  if (!payload) return c.json({ ok: false }, 403);
  const hash = createHash("sha256").update(body.token ?? "").digest("hex");
  const consumed = await withClinic(payload.clinicId, async (tx) => {
    const [row] = await tx.select().from(approvalTokens).where(eq(approvalTokens.tokenHash, hash));
    if (!row || row.usedAt) return false;
    await tx.update(approvalTokens).set({ usedAt: new Date() }).where(eq(approvalTokens.id, row.id));
    return true;
  });
  return c.json({ ok: consumed }, consumed ? 200 : 403);
});

registerDesk(app, staff);

await startTelemetry();
await retry("postgres", () => migrate());
await retry("minio", () => ensureBucket());
serve({ fetch: app.fetch, port: env.port }, () => {
  console.log(`api listening on ${env.port}`);
});
