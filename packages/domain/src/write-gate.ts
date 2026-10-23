import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { approvalTokens, auditLog, metricDaily, referrals, workflowSettings } from "@clinic/db";
import { mintApprovalToken } from "./token";

type GateDb = {
  select: (...args: never[]) => any;
  insert: (...args: never[]) => any;
  update: (...args: never[]) => any;
};

export type CommitIntent = {
  clinicId: string;
  referralId: string;
  actorId: string;
  action: "approve" | "reject" | "flag";
  secret: string;
};

export type CommitResult =
  | { outcome: "applied"; status: string; token?: string; sessionId: string | null }
  | { outcome: "refused"; reason: string };

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function bump(db: GateDb, clinicId: string, kind: string) {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(metricDaily)
    .values({ clinicId, day, kind, count: 1 })
    .onConflictDoUpdate({
      target: [metricDaily.clinicId, metricDaily.day, metricDaily.kind],
      set: { count: sql`${metricDaily.count} + 1` },
    });
}

export async function commit(db: GateDb, intent: CommitIntent): Promise<CommitResult> {
  const [referral] = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.id, intent.referralId), eq(referrals.clinicId, intent.clinicId)));
  if (!referral) return { outcome: "refused", reason: "missing" };
  const retryWrite = intent.action === "approve" && referral.status === "running";
  if (referral.status !== "awaiting_review" && !retryWrite) return { outcome: "refused", reason: "not_reviewable" };

  const [setting] = await db
    .select()
    .from(workflowSettings)
    .where(and(eq(workflowSettings.clinicId, intent.clinicId), eq(workflowSettings.kind, "referral.write")));
  const autonomy = setting?.autonomy ?? "approve_all";

  let status = "rejected";
  let token: string | undefined;
  if (intent.action === "approve") {
    if (autonomy !== "approve_all") return { outcome: "refused", reason: "autonomy" };
    status = "running";
    token = mintApprovalToken(
      { referralId: intent.referralId, clinicId: intent.clinicId, exp: Date.now() + 15 * 60 * 1000 },
      intent.secret,
    );
    await db.insert(approvalTokens).values({
      id: crypto.randomUUID(),
      clinicId: intent.clinicId,
      referralId: intent.referralId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
  } else if (intent.action === "flag") {
    status = "flagged";
  }

  await db.update(referrals).set({ status }).where(eq(referrals.id, intent.referralId));
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    clinicId: intent.clinicId,
    actor: intent.actorId,
    action: intent.action,
    subjectType: "referral",
    subjectId: intent.referralId,
    tokenId: token ? tokenHash(token) : null,
  });
  await bump(db, intent.clinicId, intent.action);
  return { outcome: "applied", status, token, sessionId: referral.sessionId };
}
