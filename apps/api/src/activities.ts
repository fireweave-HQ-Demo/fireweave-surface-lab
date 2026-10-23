import { eq } from "drizzle-orm";
import { clinicRulesSchema, packetSchema } from "@clinic/contracts";
import {
  activityEvents,
  agentSessions,
  appointments,
  auditLog,
  callAttempts,
  clinicRules,
  extractedFields,
  referrals,
  documents,
} from "@clinic/db";
import { evaluate, giPreset, nextSlot, planVisit, voiceScript } from "@clinic/domain";
import { withClinic } from "./db";
import { getPdf } from "./storage";

function waitMs(hours: number) {
  const configured = process.env.OUTREACH_WAIT_MS;
  if (configured === undefined || configured === "") return hours * 3_600_000;
  return Number(configured);
}

export async function loadPdf(input: { referralId: string; clinicId: string }) {
  const file = await withClinic(input.clinicId, async (tx) => {
    const [referral] = await tx.select().from(referrals).where(eq(referrals.id, input.referralId));
    if (!referral?.documentId) return null;
    const [document] = await tx.select().from(documents).where(eq(documents.id, referral.documentId));
    return document ?? null;
  });
  if (!file) throw new Error("missing document");
  const bytes = await getPdf(file.objectKey);
  return { base64: bytes.toString("base64"), filename: file.filename };
}

export async function persistExtraction(input: { referralId: string; clinicId: string; packet: unknown }) {
  const packet = packetSchema.parse(input.packet);
  return withClinic(input.clinicId, async (tx) => {
    const [rulesRow] = await tx.select().from(clinicRules).where(eq(clinicRules.clinicId, input.clinicId));
    const rules = rulesRow ? clinicRulesSchema.parse(rulesRow.document) : giPreset;
    const disposition = evaluate(packet, rules);
    const visit = planVisit(packet, rules);
    const script = voiceScript(rules);
    const confidence = Math.round(packet.confidence * 100);
    let sessionId: string | null = null;
    let status = "flagged";
    if (disposition.kind === "fax_back") status = "fax_back";
    if (disposition.kind === "ineligible") status = "ineligible";
    if (disposition.kind === "ready") {
      status = "awaiting_review";
      sessionId = crypto.randomUUID();
      await tx.insert(agentSessions).values({
        id: sessionId,
        clinicId: input.clinicId,
        referralId: input.referralId,
        workflowId: `referral-${input.referralId}`,
        status: "awaiting_review",
      });
    }
    await tx
      .update(referrals)
      .set({
        status,
        disposition: disposition.kind,
        triage: disposition.category,
        confidence,
        patientName: packet.patientName,
        reason: packet.reason,
        detail: disposition.detail,
        sessionId,
      })
      .where(eq(referrals.id, input.referralId));
    const fields: Array<[string, string]> = [
      ["patientName", packet.patientName],
      ["dob", packet.dob],
      ["reason", packet.reason],
      ["payer", packet.payer],
      ["phone", packet.phone],
      ["cpt", packet.cpt],
      ["diagnosis", packet.diagnosis],
    ];
    await tx.insert(extractedFields).values(
      fields
        .filter(([, value]) => value !== "")
        .map(([name, value]) => ({
          id: crypto.randomUUID(),
          clinicId: input.clinicId,
          referralId: input.referralId,
          name,
          value,
          confidence,
        })),
    );
    if (sessionId) {
      await tx.insert(activityEvents).values({
        id: crypto.randomUUID(),
        clinicId: input.clinicId,
        sessionId,
        message: "step completed extract",
      });
    }
    if (disposition.kind === "fax_back" || disposition.kind === "ineligible") {
      await tx.insert(auditLog).values({
        id: crypto.randomUUID(),
        clinicId: input.clinicId,
        actor: "rules",
        action: disposition.kind,
        subjectType: "referral",
        subjectId: input.referralId,
        tokenId: null,
      });
    }
    return {
      disposition: disposition.kind,
      sessionId,
      missing: disposition.missing,
      provider: visit?.provider ?? null,
      timeOfDay: visit?.timeOfDay ?? "morning",
      phone: packet.phone,
      maxAttempts: rules.outreach.maxAttempts,
      waitMs: waitMs(rules.outreach.hoursBetween),
      screener: script.questions,
      patientName: packet.patientName,
      dob: packet.dob,
    };
  });
}

export async function loadWritePlan(input: { referralId: string; clinicId: string }) {
  return withClinic(input.clinicId, async (tx) => {
    const [referral] = await tx.select().from(referrals).where(eq(referrals.id, input.referralId));
    if (!referral) throw new Error("missing referral");
    const fields = await tx.select().from(extractedFields).where(eq(extractedFields.referralId, input.referralId));
    const value = (name: string) => fields.find((field) => field.name === name)?.value ?? "";
    const [rulesRow] = await tx.select().from(clinicRules).where(eq(clinicRules.clinicId, input.clinicId));
    const rules = rulesRow ? clinicRulesSchema.parse(rulesRow.document) : giPreset;
    const visit = planVisit(
      packetSchema.parse({
        filename: referral.filename ?? "referral.pdf",
        patientName: referral.patientName ?? value("patientName"),
        dob: value("dob") || "1980-01-01",
        reason: referral.reason ?? value("reason"),
        payer: value("payer"),
        confidence: 0.9,
        sections: [],
      }),
      rules,
    );
    return {
      sessionId: referral.sessionId,
      provider: visit?.provider ?? "Dr. Patel",
      timeOfDay: visit?.timeOfDay ?? "morning",
      phone: value("phone"),
      maxAttempts: rules.outreach.maxAttempts,
      waitMs: waitMs(rules.outreach.hoursBetween),
      screener: voiceScript(rules).questions,
      patientName: referral.patientName ?? value("patientName"),
      dob: value("dob"),
    };
  });
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function reserveSlot(input: { clinicId: string; provider: string; timeOfDay: "morning" | "end_of_day" }) {
  const rows = await withClinic(input.clinicId, (tx) =>
    tx.select().from(appointments).where(eq(appointments.provider, input.provider)),
  );
  const start = "2026-10-24";
  for (let offset = 0; offset < 14; offset += 1) {
    const day = addDays(start, offset);
    const taken = rows.filter((row) => row.day === day).map((row) => row.slot);
    const slot = nextSlot(input.timeOfDay, taken, day);
    if (slot) return slot;
  }
  throw new Error("no open slot");
}

export async function recordAppointment(input: {
  clinicId: string;
  referralId: string;
  sessionId: string;
  patientName: string;
  provider: string;
  day: string;
  timeOfDay: string;
  slot: string;
}) {
  await withClinic(input.clinicId, async (tx) => {
    await tx.insert(appointments).values({
      id: crypto.randomUUID(),
      clinicId: input.clinicId,
      referralId: input.referralId,
      patientName: input.patientName,
      provider: input.provider,
      day: input.day,
      timeOfDay: input.timeOfDay,
      slot: input.slot,
    });
    await tx.insert(activityEvents).values({
      id: crypto.randomUUID(),
      clinicId: input.clinicId,
      sessionId: input.sessionId,
      message: `booked ${input.provider} at ${input.slot}`,
    });
  });
}

export async function recordCall(input: {
  clinicId: string;
  referralId: string;
  sessionId: string;
  attempt: number;
  result: string;
  disclosure: string;
}) {
  const spoken = input.result === "no_answer" ? "no answer" : input.result;
  await withClinic(input.clinicId, async (tx) => {
    await tx.insert(callAttempts).values({
      id: crypto.randomUUID(),
      clinicId: input.clinicId,
      referralId: input.referralId,
      attempt: input.attempt,
      result: input.result,
      disclosure: input.disclosure,
    });
    await tx.insert(activityEvents).values({
      id: crypto.randomUUID(),
      clinicId: input.clinicId,
      sessionId: input.sessionId,
      message: `disclosure played: ${input.disclosure}`,
    });
    await tx.insert(activityEvents).values({
      id: crypto.randomUUID(),
      clinicId: input.clinicId,
      sessionId: input.sessionId,
      message: `call attempt ${input.attempt} ${spoken}`,
    });
  });
}

export async function recordActivity(input: { clinicId: string; sessionId: string; message: string }) {
  await withClinic(input.clinicId, (tx) =>
    tx.insert(activityEvents).values({
      id: crypto.randomUUID(),
      clinicId: input.clinicId,
      sessionId: input.sessionId,
      message: input.message,
    }),
  );
}

export async function markCompleted(input: { referralId: string; clinicId: string; sessionId: string }) {
  await withClinic(input.clinicId, async (tx) => {
    await tx.update(referrals).set({ status: "completed" }).where(eq(referrals.id, input.referralId));
    await tx.update(agentSessions).set({ status: "completed" }).where(eq(agentSessions.id, input.sessionId));
  });
}

export async function markFailed(input: { referralId: string; clinicId: string; sessionId?: string | null }) {
  await withClinic(input.clinicId, async (tx) => {
    await tx.update(referrals).set({ status: "failed" }).where(eq(referrals.id, input.referralId));
    if (input.sessionId) {
      await tx.update(agentSessions).set({ status: "failed" }).where(eq(agentSessions.id, input.sessionId));
    }
  });
}
