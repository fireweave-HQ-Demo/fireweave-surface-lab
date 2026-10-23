import { boolean, date, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull(),
  activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clinics = pgTable("clinics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowSettings = pgTable(
  "workflow_settings",
  {
    clinicId: text("clinic_id").notNull(),
    kind: text("kind").notNull(),
    autonomy: text("autonomy").notNull(),
    maxConcurrent: integer("max_concurrent").notNull().default(4),
  },
  (table) => [primaryKey({ columns: [table.clinicId, table.kind] })],
);

export const clinicRules = pgTable("clinic_rules", {
  clinicId: text("clinic_id").primaryKey(),
  version: integer("version").notNull(),
  document: jsonb("document").notNull(),
});

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  filename: text("filename").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentSessions = pgTable("agent_sessions", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  referralId: text("referral_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  status: text("status").notNull(),
  leaseHolder: text("lease_holder"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const referrals = pgTable("referrals", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  documentId: text("document_id"),
  sessionId: text("session_id"),
  status: text("status").notNull(),
  disposition: text("disposition"),
  triage: text("triage"),
  confidence: integer("confidence"),
  filename: text("filename").notNull(),
  patientName: text("patient_name"),
  reason: text("reason"),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const extractedFields = pgTable("extracted_fields", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  referralId: text("referral_id").notNull(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  confidence: integer("confidence").notNull(),
});

export const reviewDecisions = pgTable("review_decisions", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  referralId: text("referral_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityEvents = pgTable("activity_events", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  sessionId: text("session_id").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  tokenId: text("token_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvalTokens = pgTable("approval_tokens", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  referralId: text("referral_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const metricDaily = pgTable(
  "metric_daily",
  {
    clinicId: text("clinic_id").notNull(),
    day: date("day").notNull(),
    kind: text("kind").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.clinicId, table.day, table.kind] })],
);

export const appointments = pgTable("appointments", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  referralId: text("referral_id").notNull(),
  patientName: text("patient_name").notNull(),
  provider: text("provider").notNull(),
  day: text("day").notNull(),
  timeOfDay: text("time_of_day").notNull(),
  slot: text("slot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const callAttempts = pgTable("call_attempts", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  referralId: text("referral_id").notNull(),
  attempt: integer("attempt").notNull(),
  result: text("result").notNull(),
  disclosure: text("disclosure").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priorAuths = pgTable("prior_auths", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  referralId: text("referral_id").notNull(),
  patientName: text("patient_name").notNull(),
  cpt: text("cpt").notNull().default(""),
  diagnosis: text("diagnosis").notNull().default(""),
  serviceDate: text("service_date").notNull().default(""),
  necessity: text("necessity").notNull().default(""),
  status: text("status").notNull(),
  authNumber: text("auth_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clinicalNotes = pgTable("clinical_notes", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  patientName: text("patient_name").notNull(),
  transcript: text("transcript").notNull(),
  draft: text("draft").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = {
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
  clinics,
  workflowSettings,
  clinicRules,
  documents,
  agentSessions,
  referrals,
  extractedFields,
  reviewDecisions,
  activityEvents,
  auditLog,
  approvalTokens,
  metricDaily,
  appointments,
  callAttempts,
  priorAuths,
  clinicalNotes,
};
