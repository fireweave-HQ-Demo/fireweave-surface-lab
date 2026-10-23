CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  active_organization_id text
);

CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitation (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  inviter_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinics (
  id text PRIMARY KEY REFERENCES organization(id),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_settings (
  clinic_id text NOT NULL REFERENCES clinics(id),
  kind text NOT NULL,
  autonomy text NOT NULL,
  max_concurrent integer NOT NULL DEFAULT 4,
  PRIMARY KEY (clinic_id, kind)
);

CREATE TABLE IF NOT EXISTS clinic_rules (
  clinic_id text PRIMARY KEY REFERENCES clinics(id),
  version integer NOT NULL,
  document jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  object_key text NOT NULL,
  sha256 text NOT NULL,
  filename text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  referral_id text NOT NULL,
  workflow_id text NOT NULL,
  status text NOT NULL,
  lease_holder text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  document_id text,
  session_id text,
  status text NOT NULL,
  disposition text,
  triage text,
  confidence integer,
  filename text NOT NULL,
  patient_name text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extracted_fields (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  referral_id text NOT NULL REFERENCES referrals(id),
  name text NOT NULL,
  value text NOT NULL,
  confidence integer NOT NULL
);

CREATE TABLE IF NOT EXISTS review_decisions (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  referral_id text NOT NULL REFERENCES referrals(id),
  actor text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  session_id text NOT NULL REFERENCES agent_sessions(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  actor text NOT NULL,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  token_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_tokens (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  referral_id text NOT NULL REFERENCES referrals(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS metric_daily (
  clinic_id text NOT NULL REFERENCES clinics(id),
  day date NOT NULL,
  kind text NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (clinic_id, day, kind)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'clinic_app') THEN
    CREATE ROLE clinic_app LOGIN PASSWORD 'clinic_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO clinic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "user", session, account, verification, organization, member, invitation,
  clinics, workflow_settings, clinic_rules, documents, agent_sessions, referrals,
  extracted_fields, review_decisions, activity_events, approval_tokens, metric_daily
TO clinic_app;
GRANT SELECT, INSERT ON TABLE audit_log TO clinic_app;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_tenant ON documents;
CREATE POLICY documents_tenant ON documents
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_tenant ON referrals;
CREATE POLICY referrals_tenant ON referrals
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE extracted_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_fields FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extracted_fields_tenant ON extracted_fields;
CREATE POLICY extracted_fields_tenant ON extracted_fields
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_sessions_tenant ON agent_sessions;
CREATE POLICY agent_sessions_tenant ON agent_sessions
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_events_tenant ON activity_events;
CREATE POLICY activity_events_tenant ON activity_events
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant ON audit_log;
CREATE POLICY audit_log_tenant ON audit_log
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE approval_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_tokens_tenant ON approval_tokens;
CREATE POLICY approval_tokens_tenant ON approval_tokens
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE metric_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_daily FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metric_daily_tenant ON metric_daily;
CREATE POLICY metric_daily_tenant ON metric_daily
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE workflow_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_settings_tenant ON workflow_settings;
CREATE POLICY workflow_settings_tenant ON workflow_settings
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE clinic_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_rules_tenant ON clinic_rules;
CREATE POLICY clinic_rules_tenant ON clinic_rules
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));
