import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { packetSchema } from "../src/index";

const root = resolve(import.meta.dirname, "../../..");

describe("packet fixtures", () => {
  for (const name of ["gi-stat.json", "gi-incomplete.json"]) {
    it(`parses ${name}`, () => {
      const raw = JSON.parse(readFileSync(resolve(root, "fixtures/packets", name), "utf8"));
      expect(packetSchema.parse(raw).patientName.length).toBeGreaterThan(0);
    });
  }
});
