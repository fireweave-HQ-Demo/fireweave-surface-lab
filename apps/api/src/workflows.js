import { condition, defineSignal, proxyActivities, setHandler, sleep } from "@temporalio/workflow";

export const reviewSignal = defineSignal("review");

const agent = proxyActivities({
  startToCloseTimeout: "2 minutes",
  taskQueue: "agent-py",
  retry: { maximumAttempts: 1 },
});

const clinic = proxyActivities({
  startToCloseTimeout: "1 minute",
  taskQueue: "clinic-ts",
  retry: { maximumAttempts: 3 },
});

export async function ReferralFlow(input) {
  try {
    return await runReferral(input);
  } catch (error) {
    await clinic.markFailed({ referralId: input.referralId, clinicId: input.clinicId, sessionId: null });
    throw error;
  }
}

async function runReferral(input) {
  const file = await clinic.loadPdf({ referralId: input.referralId, clinicId: input.clinicId });
  const packet = await agent.extract({ filename: file.filename, pdfBase64: file.base64 });
  const saved = await clinic.persistExtraction({
    referralId: input.referralId,
    clinicId: input.clinicId,
    packet,
  });
  if (saved.disposition !== "ready") return saved;

  let decision = null;
  setHandler(reviewSignal, (value) => {
    decision = value;
  });
  const arrived = await condition(() => decision !== null, "15 minutes");
  if (!arrived || !decision || decision.action !== "approve" || !saved.sessionId) return saved;

  const slot = await clinic.reserveSlot({
    clinicId: input.clinicId,
    provider: saved.provider,
    timeOfDay: saved.timeOfDay,
  });
  await clinic.recordActivity({
    clinicId: input.clinicId,
    sessionId: saved.sessionId,
    message: "step started chart write",
  });
  const filled = await agent.fillChart({
    sessionId: saved.sessionId,
    approvalToken: decision.token,
    sandboxUrl: input.sandboxUrl,
    fields: {
      patientName: saved.patientName,
      dob: saved.dob,
      provider: saved.provider,
      timeOfDay: saved.timeOfDay,
      slot: slot.time,
      day: slot.day,
    },
  });
  if (!filled.ok) {
    await clinic.markFailed({ referralId: input.referralId, clinicId: input.clinicId, sessionId: saved.sessionId });
    return filled;
  }
  await clinic.recordAppointment({
    clinicId: input.clinicId,
    referralId: input.referralId,
    sessionId: saved.sessionId,
    patientName: saved.patientName,
    provider: saved.provider,
    day: slot.day,
    timeOfDay: saved.timeOfDay,
    slot: slot.time,
  });
  await clinic.recordActivity({
    clinicId: input.clinicId,
    sessionId: saved.sessionId,
    message: "step completed chart write",
  });

  let attempt = 0;
  let result = "no_answer";
  while (attempt < saved.maxAttempts && result !== "answered") {
    attempt += 1;
    if (attempt > 1 && saved.waitMs > 0) await sleep(saved.waitMs);
    const call = await agent.placeCall({ phone: saved.phone, attempt, questions: saved.screener });
    result = call.result;
    await clinic.recordCall({
      clinicId: input.clinicId,
      referralId: input.referralId,
      sessionId: saved.sessionId,
      attempt,
      result: call.result,
      disclosure: call.disclosure,
    });
  }

  await clinic.markCompleted({
    referralId: input.referralId,
    clinicId: input.clinicId,
    sessionId: saved.sessionId,
  });
  return { ok: true };
}
