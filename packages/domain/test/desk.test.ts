import { describe, expect, it } from "vitest";
import { giPreset } from "../src/preset";
import { missingAuthFields, necessityNote } from "../src/prior-auth";
import { nextSlot } from "../src/schedule";
import { draftVisitNote } from "../src/scribe";
import { voiceScript } from "../src/voice";

describe("schedule", () => {
  it("offers the next open morning slot", () => {
    expect(nextSlot("morning", [])).toEqual({ day: "2026-10-24", time: "08:00" });
    expect(nextSlot("morning", ["08:00"])?.time).toBe("09:00");
    expect(nextSlot("morning", ["08:00", "09:00", "10:00"])).toBeNull();
    expect(nextSlot("end_of_day", [])?.time).toBe("15:00");
  });
});

describe("prior auth", () => {
  it("names every missing field and will not pretend a draft is ready", () => {
    expect(missingAuthFields({ cpt: "", diagnosis: "K62.5", serviceDate: "" })).toEqual(["CPT", "service date"]);
    expect(missingAuthFields({ cpt: "45378", diagnosis: "K62.5", serviceDate: "2026-10-24" })).toEqual([]);
  });

  it("drafts a necessity note from the referral", () => {
    const note = necessityNote({ patientName: "Avery Quinn", reason: "rectal bleeding", diagnosis: "K62.5", cpt: "45378" });
    expect(note).toContain("Avery Quinn");
    expect(note).toContain("45378");
    expect(note).toContain("rectal bleeding");
  });
});

describe("scribe", () => {
  it("turns a transcript into an H&P", () => {
    const note = draftVisitNote({
      patientName: "Avery Quinn",
      transcript: "Bleeding for three days.\nLikely hemorrhoidal source.\nSchedule colonoscopy.",
    });
    expect(note).toContain("History and physical for Avery Quinn.");
    expect(note).toContain("HPI: Bleeding for three days.");
    expect(note).toContain("Plan: Schedule colonoscopy.");
  });
});

describe("voice", () => {
  it("opens with a disclosure and the clinic screener", () => {
    const script = voiceScript(giPreset);
    expect(script.disclosure).toBe("This call is automated and recorded.");
    expect(script.questions).toEqual(["cardiac history", "driver"]);
  });
});
