import postgres from "postgres";
import { auth } from "./auth";
import { env } from "./env";
import { migrate } from "./migrate";
import { giPreset } from "@clinic/domain";

await migrate();
const admin = postgres(env.databaseUrlAdmin, { max: 1 });

const existing = await admin<{ id: string }[]>`select id from "user" where email = ${env.seedEmail}`;
let userId = existing[0]?.id;
if (!userId) {
  const created = await auth.api.signUpEmail({
    body: { email: env.seedEmail, password: env.seedPassword, name: "Demo Staff" },
  });
  userId = created.user.id;
}

const orgId = "00000000-0000-4000-8000-000000000001";
await admin`
  insert into organization (id, name, slug)
  values (${orgId}, 'Demo GI', 'demo-gi')
  on conflict (id) do nothing
`;
await admin`
  insert into member (id, organization_id, user_id, role)
  values ('00000000-0000-4000-8000-000000000002', ${orgId}, ${userId}, 'staff')
  on conflict (id) do nothing
`;
await admin`
  insert into clinics (id, name) values (${orgId}, 'Demo GI')
  on conflict (id) do nothing
`;
await admin`
  insert into workflow_settings (clinic_id, kind, autonomy, max_concurrent)
  values (${orgId}, 'referral.write', 'approve_all', 4)
  on conflict (clinic_id, kind) do update set autonomy = 'approve_all'
`;
await admin`
  insert into clinic_rules (clinic_id, version, document)
  values (${orgId}, 1, ${admin.json(giPreset as never)})
  on conflict (clinic_id) do update set document = excluded.document
`;
await admin.end();
console.log(`seeded ${env.seedEmail} in clinic ${orgId}`);
process.exit(0);
