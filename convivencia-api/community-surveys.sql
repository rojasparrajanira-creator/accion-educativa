-- Encuestas adultas PGCE 2027: instalación OPCIONAL bajo bandera
-- MEC_COMMUNITY_SURVEYS_ENABLED=1. No registrar respuestas de NNA en este módulo.
-- Almacenar códigos de invitación / PIN solamente como hashes.
CREATE TABLE IF NOT EXISTS community_survey_invitations (
  id BIGSERIAL PRIMARY KEY,
  establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  school_year INT NOT NULL CHECK(school_year BETWEEN 2027 AND 2100),
  audience TEXT NOT NULL CHECK(audience IN ('familia','docente','asistente','directivo')),
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  guardian_slot SMALLINT CHECK(guardian_slot BETWEEN 1 AND 2),
  staff_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  link_verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  link_evidence_ref TEXT,
  code_hash CHAR(64) NOT NULL UNIQUE,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0 CHECK(failed_attempts>=0),
  locked_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  issued_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT family_requires_verified_link CHECK(
    (audience='familia' AND student_id IS NOT NULL AND guardian_slot IS NOT NULL AND link_verified_by IS NOT NULL AND length(trim(link_evidence_ref))>=6 AND staff_user_id IS NULL)
    OR (audience<>'familia' AND student_id IS NULL AND guardian_slot IS NULL AND staff_user_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_community_invites_est_audience
 ON community_survey_invitations(establishment_id,school_year,audience);
CREATE INDEX IF NOT EXISTS idx_community_invites_expiry
 ON community_survey_invitations(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_one_staff_invite
 ON community_survey_invitations(establishment_id,school_year,audience,staff_user_id)
 WHERE staff_user_id IS NOT NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_one_family_invite
 ON community_survey_invitations(establishment_id,school_year,audience,student_id,guardian_slot)
 WHERE student_id IS NOT NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS community_survey_sessions (
  session_hash CHAR(64) PRIMARY KEY,
  invitation_id BIGINT NOT NULL REFERENCES community_survey_invitations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_sessions_expiry ON community_survey_sessions(expires_at);

CREATE TABLE IF NOT EXISTS community_survey_submissions (
  id BIGSERIAL PRIMARY KEY,
  invitation_id BIGINT NOT NULL UNIQUE REFERENCES community_survey_invitations(id) ON DELETE CASCADE,
  establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  school_year INT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN ('familia','docente','asistente','directivo')),
  bank_version TEXT NOT NULL,
  answers JSONB NOT NULL CHECK(jsonb_typeof(answers)='object'),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_submissions_group
 ON community_survey_submissions(establishment_id,school_year,audience);

CREATE TABLE IF NOT EXISTS community_survey_audit_events (
  id BIGSERIAL PRIMARY KEY,
  establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  invitation_id BIGINT REFERENCES community_survey_invitations(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('issued','revoked','submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_audit_est_created
 ON community_survey_audit_events(establishment_id,created_at DESC);

-- Borradores institucionales del PGCE 2027: habilitados solo en el piloto.
-- Un plan anual por establecimiento; revisión optimista para evitar sobrescrituras.
-- Nunca guardar respuestas individuales, RUN ni datos de estudiantes en el plan.
CREATE TABLE IF NOT EXISTS community_pgce_drafts_2027 (
  establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  school_year INT NOT NULL DEFAULT 2027 CHECK(school_year=2027),
  revision INT NOT NULL DEFAULT 1 CHECK(revision>=1),
  draft JSONB NOT NULL CHECK(jsonb_typeof(draft)='object'),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(establishment_id,school_year)
);
CREATE TABLE IF NOT EXISTS community_pgce_draft_audit_2027 (
  id BIGSERIAL PRIMARY KEY,
  establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  school_year INT NOT NULL CHECK(school_year=2027),
  revision INT NOT NULL CHECK(revision>=1),
  performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL DEFAULT 'draft_saved' CHECK(action='draft_saved'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(establishment_id,school_year,revision)
);
CREATE INDEX IF NOT EXISTS idx_community_pgce_draft_audit_est
 ON community_pgce_draft_audit_2027(establishment_id,created_at DESC);
