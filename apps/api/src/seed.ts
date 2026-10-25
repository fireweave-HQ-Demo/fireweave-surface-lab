import postgres from "postgres";
import { auth } from "./auth";
import { env } from "./env";
import { migrate } from "./migrate";
import { giPreset } from "@clinic/domain";

const FIRST = [
  "Avery", "Jordan", "Riley", "Quinn", "Morgan", "Casey", "Parker", "Reese", "Rowan", "Sage",
  "Taylor", "Hayden", "Emerson", "Finley", "Harper", "Logan", "Peyton", "Skyler", "Drew", "Cameron",
];
const LAST = ["Nguyen", "Patel", "Brooks", "Alvarez", "Okonkwo"];

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
const clinicName = env.seedClinicName;
await admin`
  insert into organization (id, name, slug)
  values (${orgId}, ${clinicName}, 'demo-gi')
  on conflict (id) do nothing
`;
await admin`
  insert into member (id, organization_id, user_id, role)
  values ('00000000-0000-4000-8000-000000000002', ${orgId}, ${userId}, 'staff')
  on conflict (id) do nothing
`;
const [membership] = await admin<{ id: string }[]>`
  select id from member where user_id = ${userId} and organization_id = ${orgId}
`;
if (!membership) {
  await admin`
    insert into member (id, organization_id, user_id, role)
    values (${crypto.randomUUID()}, ${orgId}, ${userId}, 'staff')
  `;
}
await admin`
  insert into clinics (id, name) values (${orgId}, ${clinicName})
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
const roster = await seedRoster(admin, orgId, userId);
await admin.end();
console.log(`seeded ${env.seedEmail} in ${clinicName} (${orgId})${roster}`);
process.exit(0);

async function seedRoster(
  admin: postgres.Sql,
  orgId: string,
  staffId: string,
): Promise<string> {
  const count = env.seedUserCount;
  const domain = env.seedEmailDomain.toLowerCase();
  const groups = env.seedEmailGroups.map((group) => group.toLowerCase());
  if (!Number.isInteger(count) || count <= 0 || !domain || groups.length === 0) return "";
  const doctors = new Set(env.seedDoctorGroups.map((group) => group.toLowerCase()));
  const [credential] = await admin<{ password: string }[]>`
    select password from account
    where user_id = ${staffId} and provider_id = 'credential' and password is not null
  `;
  if (!credential?.password) throw new Error("seed staff account has no password");
  let added = 0;
  await admin.begin(async (tx) => {
    for (let index = 0; index < count; index += 1) {
      const group = groups[index % groups.length]!;
      const number = String(Math.floor(index / groups.length) + 1).padStart(2, "0");
      const email = `${group}.${number}@${domain}`;
      const name = `${FIRST[index % FIRST.length]} ${LAST[Math.floor(index / FIRST.length) % LAST.length]}`;
      const role = doctors.has(group) ? "doctor" : "staff";
      const [found] = await tx<{ id: string }[]>`select id from "user" where email = ${email}`;
      let id = found?.id;
      if (!id) {
        id = crypto.randomUUID();
        await tx`
          insert into "user" (id, name, email, email_verified)
          values (${id}, ${name}, ${email}, true)
        `;
        await tx`
          insert into account (id, account_id, provider_id, user_id, password)
          values (${crypto.randomUUID()}, ${id}, 'credential', ${id}, ${credential.password})
        `;
        added += 1;
      }
      const [membership] = await tx<{ id: string }[]>`
        select id from member where user_id = ${id} and organization_id = ${orgId}
      `;
      if (!membership) {
        await tx`
          insert into member (id, organization_id, user_id, role)
          values (${crypto.randomUUID()}, ${orgId}, ${id}, ${role})
        `;
      }
    }
  });
  return `; roster ${count} @${domain} (${groups.join(", ")}), ${added} new`;
}
