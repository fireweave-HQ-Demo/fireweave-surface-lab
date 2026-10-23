ALTER TABLE referrals ADD COLUMN IF NOT EXISTS detail text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS appointments (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  referral_id text NOT NULL REFERENCES referrals(id),
  patient_name text NOT NULL,
  provider text NOT NULL,
  day text NOT NULL,
  time_of_day text NOT NULL,
  slot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_attempts (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  referral_id text NOT NULL REFERENCES referrals(id),
  attempt integer NOT NULL,
  result text NOT NULL,
  disclosure text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prior_auths (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  referral_id text NOT NULL REFERENCES referrals(id),
  patient_name text NOT NULL,
  cpt text NOT NULL DEFAULT '',
  diagnosis text NOT NULL DEFAULT '',
  service_date text NOT NULL DEFAULT '',
  necessity text NOT NULL DEFAULT '',
  status text NOT NULL,
  auth_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinical_notes (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id),
  patient_name text NOT NULL,
  transcript text NOT NULL,
  draft text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE approval_tokens DROP CONSTRAINT IF EXISTS approval_tokens_referral_id_fkey;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE appointments, call_attempts, prior_auths, clinical_notes TO clinic_app;

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_tenant ON appointments;
CREATE POLICY appointments_tenant ON appointments
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_attempts_tenant ON call_attempts;
CREATE POLICY call_attempts_tenant ON call_attempts
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE prior_auths ENABLE ROW LEVEL SECURITY;
ALTER TABLE prior_auths FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prior_auths_tenant ON prior_auths;
CREATE POLICY prior_auths_tenant ON prior_auths
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinical_notes_tenant ON clinical_notes;
CREATE POLICY clinical_notes_tenant ON clinical_notes
  USING (clinic_id = current_setting('app.clinic_id', true))
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true));
