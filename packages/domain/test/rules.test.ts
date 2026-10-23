import { describe, expect, it } from "vitest";
import statPacket from "../../../fixtures/packets/gi-stat.json";
import incompletePacket from "../../../fixtures/packets/gi-incomplete.json";
import { packetSchema, type Packet } from "@clinic/contracts";
import { giPreset } from "../src/preset";
import { evaluate, planVisit } from "../src/rules";

const stat = packetSchema.parse(statPacket);
const incomplete = packetSchema.parse(incompletePacket);

function withReason(packet: Packet, reason: string, sections = packet.sections): Packet {
  return { ...packet, reason, sections };
}

describe("GI preset", () => {
  it("marks a complete bleeding referral STAT and ready", () => {
    expect(evaluate(stat, giPreset)).toMatchObject({ kind: "ready", category: "STAT", missing: [] });
  });

  it("sends an incomplete packet back for labs and insurance", () => {
    expect(evaluate(incomplete, giPreset)).toMatchObject({
      kind: "fax_back",
      missing: ["labs", "insurance"],
    });
  });

  it("classifies screening and symptomatic referrals", () => {
    expect(evaluate(withReason(stat, "routine colonoscopy"), giPreset).category).toBe("screening");
    expect(evaluate(withReason(stat, "chronic diarrhea"), giPreset).category).toBe("symptomatic");
  });

  it("asks a human when the reason is not in the preset", () => {
    expect(evaluate(withReason(stat, "rash"), giPreset).kind).toBe("needs_human");
  });

  it("drops a packet from outside the service area", () => {
    expect(evaluate({ ...stat, serviceArea: "out" }, giPreset)).toMatchObject({
      kind: "ineligible",
      detail: "outside service area",
    });
  });

  it("drops a colonoscopy that is inside the exclusion window", () => {
    const now = new Date("2026-10-23T00:00:00Z");
    expect(evaluate({ ...stat, lastColonoscopy: "2026-10-01" }, giPreset, now).kind).toBe("ineligible");
    expect(evaluate({ ...stat, lastColonoscopy: "2020-01-01" }, giPreset, now).kind).toBe("ready");
  });

  it("books the default doctor when the payer is not on the list", () => {
    const withDefault = {
      ...giPreset,
      payerRouting: [
        { payer: "Cigna PPO", provider: "Dr. Patel", timeOfDay: "morning" as const },
        { payer: "default", provider: "Dr. Kim", timeOfDay: "morning" as const },
      ],
    };
    expect(evaluate({ ...stat, payer: "Aetna" }, giPreset)).toMatchObject({
      kind: "ready",
      category: "STAT",
    });
    expect(planVisit({ ...stat, payer: "Aetna" }, withDefault)).toEqual({ provider: "Dr. Kim", timeOfDay: "morning" });
    expect(planVisit(stat, withDefault)).toEqual({ provider: "Dr. Patel", timeOfDay: "morning" });
  });

  it("asks a human when the clinic has no doctors to route to", () => {
    expect(evaluate(stat, { ...giPreset, payerRouting: [] })).toMatchObject({
      kind: "needs_human",
      detail: "no payer route",
    });
  });

  it("changes fax-back when a clinic adds a required document", () => {
    const rules = {
      ...giPreset,
      requiredDocuments: [{ when: "always", need: ["labs", "insurance", "pathology"] }],
    };
    expect(evaluate(stat, rules).missing).toEqual(["pathology"]);
  });
});
