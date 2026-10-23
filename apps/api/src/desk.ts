import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { clinicRulesSchema } from "@clinic/contracts";
import {
  appointments,
  approvalTokens,
  auditLog,
  callAttempts,
  clinicRules,
  clinicalNotes,
  extractedFields,
  priorAuths,
  referrals,
} from "@clinic/db";
import { draftVisitNote, giPreset, mintApprovalToken, missingAuthFields, necessityNote } from "@clinic/domain";
import type { Staff } from "./authz";
import { withClinic } from "./db";
import { env } from "./env";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function gate(who: Staff, subjectId: string) {
  const token = mintApprovalToken(
    { referralId: subjectId, clinicId: who.clinicId, exp: Date.now() + 15 * 60 * 1000 },
    env.dataKey,
  );
  await withClinic(who.clinicId, (tx) =>
    tx.insert(approvalTokens).values({
      id: crypto.randomUUID(),
      clinicId: who.clinicId,
      referralId: subjectId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }),
  );
  return token;
}

export function registerDesk(app: Hono, staff: (c: { req: { raw: Request } }) => Promise<Staff | null>) {
  app.get("/api/appointments", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    const rows = await withClinic(who.clinicId, (tx) => tx.select().from(appointments).where(eq(appointments.clinicId, who.clinicId)));
    return c.json(rows);
  });

  app.get("/api/dashboard", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    const summary = await withClinic(who.clinicId, async (tx) => {
      const referralRows = await tx.select().from(referrals).where(eq(referrals.clinicId, who.clinicId));
      const calls = await tx.select().from(callAttempts).where(eq(callAttempts.clinicId, who.clinicId));
      const auths = await tx.select().from(priorAuths).where(eq(priorAuths.clinicId, who.clinicId));
      const count = (status: string) => referralRows.filter((row) => row.status === status).length;
      return {
        completed: count("completed"),
        pending: count("awaiting_review"),
        flagged: count("flagged"),
        faxBack: count("fax_back"),
        calls: calls.length,
        authorizations: auths.filter((row) => row.status === "approved").length,
      };
    });
    return c.json(summary);
  });

  app.get("/api/rules", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    const [row] = await withClinic(who.clinicId, (tx) => tx.select().from(clinicRules).where(eq(clinicRules.clinicId, who.clinicId)));
    const rules = row ? clinicRulesSchema.parse(row.document) : giPreset;
    const always = rules.requiredDocuments.find((item) => item.when === "always");
    return c.json({ ...rules, requiredNow: always?.need ?? [] });
  });

  app.put("/api/rules", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    if (who.role === "auditor") return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json<{ requiredDocuments?: string[] }>();
    const need = (body.requiredDocuments ?? []).map((item) => item.trim()).filter(Boolean);
    if (need.length === 0) return c.json({ error: "required documents" }, 400);
    const saved = await withClinic(who.clinicId, async (tx) => {
      const [row] = await tx.select().from(clinicRules).where(eq(clinicRules.clinicId, who.clinicId));
      const rules = row ? clinicRulesSchema.parse(row.document) : giPreset;
      const next = {
        ...rules,
        version: rules.version + 1,
        requiredDocuments: [{ when: "always", need }, ...rules.requiredDocuments.filter((item) => item.when !== "always")],
      };
      await tx
        .insert(clinicRules)
        .values({ clinicId: who.clinicId, version: next.version, document: next })
        .onConflictDoUpdate({ target: clinicRules.clinicId, set: { version: next.version, document: next } });
      return next;
    });
    return c.json(saved);
  });

  app.get("/api/prior-auths", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    const payload = await withClinic(who.clinicId, async (tx) => {
      const auths = await tx.select().from(priorAuths).where(eq(priorAuths.clinicId, who.clinicId));
      const completed = await tx.select().from(referrals).where(eq(referrals.clinicId, who.clinicId));
      return {
        auths,
        referrals: completed.filter((row) => row.status === "completed" && !auths.some((auth) => auth.referralId === row.id)),
      };
    });
    return c.json(payload);
  });

  app.post("/api/prior-auths", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    if (who.role === "auditor") return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json<{ referralId?: string }>();
    const created = await withClinic(who.clinicId, async (tx) => {
      if (!body.referralId) return null;
      const [existing] = await tx.select().from(priorAuths).where(eq(priorAuths.referralId, body.referralId));
      if (existing) return existing;
      const [referral] = await tx.select().from(referrals).where(eq(referrals.id, body.referralId));
      if (!referral || referral.status !== "completed") return null;
      const fields = await tx.select().from(extractedFields).where(eq(extractedFields.referralId, body.referralId));
      const value = (name: string) => fields.find((field) => field.name === name)?.value ?? "";
      const [appointment] = await tx.select().from(appointments).where(eq(appointments.referralId, body.referralId));
      const draft = {
        cpt: value("cpt"),
        diagnosis: value("diagnosis"),
        serviceDate: appointment?.day ?? "",
        necessity: necessityNote({
          patientName: referral.patientName ?? "",
          reason: referral.reason ?? "",
          diagnosis: value("diagnosis"),
          cpt: value("cpt"),
        }),
      };
      const row = {
        id: crypto.randomUUID(),
        clinicId: who.clinicId,
        referralId: body.referralId,
        patientName: referral.patientName ?? "Unknown",
        status: "draft",
        authNumber: null,
        ...draft,
      };
      await tx.insert(priorAuths).values(row);
      return row;
    });
    if (!created) return c.json({ error: "missing" }, 404);
    return c.json(created, 201);
  });

  app.post("/api/prior-auths/:id/commit", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    if (who.role === "auditor") return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json<{ cpt?: string; diagnosis?: string; serviceDate?: string }>();
    const id = c.req.param("id");
    const draft = await withClinic(who.clinicId, async (tx) => {
      const [row] = await tx.select().from(priorAuths).where(eq(priorAuths.id, id));
      if (!row || row.status !== "draft") return null;
      const next = {
        cpt: body.cpt ?? row.cpt,
        diagnosis: body.diagnosis ?? row.diagnosis,
        serviceDate: body.serviceDate ?? row.serviceDate,
      };
      const necessity = necessityNote({
        patientName: row.patientName,
        reason: "the approved referral",
        diagnosis: next.diagnosis,
        cpt: next.cpt,
      });
      await tx.update(priorAuths).set({ ...next, necessity }).where(eq(priorAuths.id, id));
      return { ...row, ...next, necessity };
    });
    if (!draft) return c.json({ error: "missing" }, 404);
    const missing = missingAuthFields(draft);
    if (missing.length > 0) return c.json({ outcome: "refused", reason: "missing", missing }, 409);
    const token = await gate(who, draft.referralId);
    const response = await fetch(`${env.browserRunnerUrl}/authorizations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: draft.id,
        approvalToken: token,
        sandboxUrl: env.sandboxPayerUrl,
        fields: { cpt: draft.cpt, diagnosis: draft.diagnosis, serviceDate: draft.serviceDate },
      }),
    });
    const result = (await response.json().catch(() => ({ ok: false }))) as { ok?: boolean; authNumber?: string };
    if (!response.ok || !result.ok || !result.authNumber) return c.json({ outcome: "refused", reason: "payer" }, 502);
    await withClinic(who.clinicId, async (tx) => {
      await tx.update(priorAuths).set({ status: "approved", authNumber: result.authNumber }).where(eq(priorAuths.id, id));
      await tx.insert(auditLog).values({
        id: crypto.randomUUID(),
        clinicId: who.clinicId,
        actor: who.userId,
        action: "prior_auth",
        subjectType: "prior_auth",
        subjectId: id,
        tokenId: tokenHash(token),
      });
    });
    return c.json({ outcome: "applied", authNumber: result.authNumber });
  });

  app.get("/api/notes", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    const rows = await withClinic(who.clinicId, (tx) => tx.select().from(clinicalNotes).where(eq(clinicalNotes.clinicId, who.clinicId)));
    return c.json(rows);
  });

  app.post("/api/notes", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    if (who.role === "auditor") return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json<{ patientName?: string; transcript?: string }>();
    const patientName = body.patientName?.trim() ?? "";
    const transcript = body.transcript?.trim() ?? "";
    if (!patientName || !transcript) return c.json({ error: "transcript" }, 400);
    const row = {
      id: crypto.randomUUID(),
      clinicId: who.clinicId,
      patientName,
      transcript,
      draft: draftVisitNote({ patientName, transcript }),
      status: "awaiting_review",
    };
    await withClinic(who.clinicId, (tx) => tx.insert(clinicalNotes).values(row));
    return c.json(row, 201);
  });

  app.post("/api/notes/:id/commit", async (c) => {
    const who = await staff(c);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    if (who.role === "auditor") return c.json({ error: "forbidden" }, 403);
    const id = c.req.param("id");
    const note = await withClinic(who.clinicId, async (tx) => {
      const [row] = await tx.select().from(clinicalNotes).where(eq(clinicalNotes.id, id));
      return row ?? null;
    });
    if (!note || note.status !== "awaiting_review") return c.json({ error: "missing" }, 404);
    const token = await gate(who, note.id);
    const response = await fetch(`${env.browserRunnerUrl}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: note.id,
        approvalToken: token,
        sandboxUrl: env.sandboxEhrUrl,
        note: note.draft,
      }),
    });
    const result = (await response.json().catch(() => ({ ok: false }))) as { ok?: boolean };
    if (!response.ok || !result.ok) return c.json({ outcome: "refused", reason: "chart" }, 502);
    await withClinic(who.clinicId, async (tx) => {
      await tx.update(clinicalNotes).set({ status: "completed" }).where(eq(clinicalNotes.id, id));
      await tx.insert(auditLog).values({
        id: crypto.randomUUID(),
        clinicId: who.clinicId,
        actor: who.userId,
        action: "scribe",
        subjectType: "note",
        subjectId: id,
        tokenId: tokenHash(token),
      });
    });
    return c.json({ outcome: "applied", status: "completed" });
  });
}
