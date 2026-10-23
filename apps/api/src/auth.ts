import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { account, invitation, member, organization as organizationTable, session, user, verification } from "@clinic/db";
import { db } from "./db";
import { env } from "./env";
import { provisionClinic } from "./provision";

function originPair(url: string): string[] {
  const parsed = new URL(url);
  const twin =
    parsed.hostname === "localhost"
      ? parsed.host.replace("localhost", "127.0.0.1")
      : parsed.hostname === "127.0.0.1"
        ? parsed.host.replace("127.0.0.1", "localhost")
        : parsed.host;
  return [...new Set([parsed.origin, `${parsed.protocol}//${twin}`])];
}

export const auth = betterAuth({
  secret: env.authSecret,
  baseURL: env.authUrl,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, organization: organizationTable, member, invitation },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [
    organization({
      organizationHooks: {
        afterCreateOrganization: async ({ organization }) => {
          await provisionClinic(organization.id, organization.name);
        },
      },
    }),
  ],
  trustedOrigins: originPair(env.authUrl),
});
