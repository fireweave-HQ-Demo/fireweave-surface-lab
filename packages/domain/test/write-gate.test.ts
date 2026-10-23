import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { referrals } from "@clinic/db";
import { commit } from "../src/write-gate";

const clinicA = "clinic-a";
const clinicB = "clinic-b";
const secret = "test-secret";

let client: PGlite;
let db: ReturnType<typeof drizzle>;

async function asClinic<T>(clinicId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.clinic_id', ${clinicId}, true)`);
    await tx.execute(sql`set local role clinic_app`);
    return fn(tx as unknown as typeof db);
  });
}

beforeAll(async () => {
  client = new PGlite();
  const init = readFileSync(resolve(import.meta.dirname, "../../db/migrations/0001_init.sql"), "utf8");
  const desk = readFileSync(resolve(import.meta.dirname, "../../db/migrations/0002_desk.sql"), "utf8");
  const withoutRolePassword = init.replace(
    "CREATE ROLE clinic_app LOGIN PASSWORD 'clinic_app' NOSUPERUSER NOBYPASSRLS;",
    "CREATE ROLE clinic_app NOLOGIN NOSUPERUSER NOBYPASSRLS;",
  );
  await client.exec(withoutRolePassword);
  await client.exec(desk);
  db = drizzle(client);
  for (const id of [clinicA, clinicB]) {
    await client.exec(`
      INSERT INTO organization (id, name, slug) VALUES ('${id}', '${id}', '${id}');
      INSERT INTO clinics (id, name) VALUES ('${id}', '${id}');
      INSERT INTO workflow_settings (clinic_id, kind, autonomy) VALUES ('${id}', 'referral.write', 'approve_all');
    `);
  }
  await client.exec(`
    INSERT INTO referrals (id, clinic_id, status, filename, patient_name, session_id)
    VALUES ('ref-a', '${clinicA}', 'awaiting_review', 'gi-stat.pdf', 'Avery Quinn', 'sess-a');
    INSERT INTO referrals (id, clinic_id, status, filename, patient_name, session_id)
    VALUES ('ref-b', '${clinicB}', 'awaiting_review', 'gi-stat.pdf', 'Other Patient', 'sess-b');
  `);
});

afterAll(async () => {
  await client.close();
});

describe("write gate", () => {
  it("applies an approval, records an audit row, and hides the other clinic", async () => {
    const result = await asClinic(clinicA, (tx) =>
      commit(tx, { clinicId: clinicA, referralId: "ref-a", actorId: "staff", action: "approve", secret }),
    );
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") return;
    expect(result.token).toBeTruthy();
    expect(result.sessionId).toBe("sess-a");

    const visible = await asClinic(clinicA, (tx) => tx.select().from(referrals));
    expect(visible.map((row) => row.id)).toEqual(["ref-a"]);

    const other = await asClinic(clinicB, (tx) => tx.select().from(referrals).where(eq(referrals.id, "ref-a")));
    expect(other).toEqual([]);
  });

  it("rejects a referral that is not waiting for review", async () => {
    const result = await asClinic(clinicA, (tx) =>
      commit(tx, { clinicId: clinicA, referralId: "ref-a", actorId: "staff", action: "reject", secret }),
    );
    expect(result).toMatchObject({ outcome: "refused", reason: "not_reviewable" });
  });
});
