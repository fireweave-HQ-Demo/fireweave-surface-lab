import postgres from "postgres";
import { giPreset } from "@clinic/domain";
import { env } from "./env";

export async function provisionClinic(id: string, name: string) {
  const admin = postgres(env.databaseUrlAdmin, { max: 1 });
  try {
    await admin`
      insert into clinics (id, name)
      values (${id}, ${name})
      on conflict (id) do nothing
    `;
    await admin`
      insert into workflow_settings (clinic_id, kind, autonomy, max_concurrent)
      values (${id}, 'referral.write', 'approve_all', 4)
      on conflict (clinic_id, kind) do nothing
    `;
    await admin`
      insert into clinic_rules (clinic_id, version, document)
      values (${id}, 1, ${admin.json(giPreset as never)})
      on conflict (clinic_id) do nothing
    `;
  } finally {
    await admin.end();
  }
}
