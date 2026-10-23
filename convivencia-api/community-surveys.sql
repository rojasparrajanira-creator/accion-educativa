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


-- Seguimiento de acciones institucionales 2027, escrito exclusivamente por profesionales.
-- M1/M2/M3 identifica el corte de seguimiento, no una comparación automática
-- de puntajes entre cursos ni una medición oficial.
CREATE TABLE IF NOT EXISTS community_pgce_action_followups_2027 (
  establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  school_year INT NOT NULL DEFAULT 2027 CHECK(school_year=2027),
  clause TEXT NOT NULL CHECK(clause IN ('a','b','c','d','e','f','g')),
  measurement_code TEXT NOT NULL CHECK(measurement_code IN ('M1','M2','M3')),
  revision INT NOT NULL DEFAULT 1 CHECK(revision>=1),
  status TEXT NOT NULL CHECK(status IN ('pending','in_progress','completed','reprogrammed','suspended')),
  progress_percent INT NOT NULL CHECK(progress_percent BETWEEN 0 AND 100),
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(evidence_refs)='array'),
  professional_note TEXT NOT NULL DEFAULT '',
  adjustment_note TEXT NOT NULL DEFAULT '',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(establishment_id,school_year,clause,measurement_code)
);
CREATE TABLE IF NOT EXISTS community_pgce_followup_audit_2027 (
  id BIGSERIAL PRIMARY KEY,
  establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  school_year INT NOT NULL DEFAULT 2027 CHECK(school_year=2027),
  clause TEXT NOT NULL CHECK(clause IN ('a','b','c','d','e','f','g')),
  measurement_code TEXT NOT NULL CHECK(measurement_code IN ('M1','M2','M3')),
  revision INT NOT NULL CHECK(revision>=1),
  performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(establishment_id,school_year,clause,measurement_code,revision)
);
CREATE INDEX IF NOT EXISTS idx_community_pgce_followup_establishment_2027
 ON community_pgce_followup_audit_2027(establishment_id,created_at DESC);


-- Identificador estable para varias acciones dentro del mismo apartado legal.
-- Migración ADITIVA: conserva ambas tablas antiguas y sus auditorías.
-- Únicamente se aplica cuando se ejecuta el esquema opt-in del piloto.
CREATE TABLE IF NOT EXISTS community_pgce_action_followups_v2_2027 (
 establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
 school_year INT NOT NULL DEFAULT 2027 CHECK(school_year=2027),
 action_id TEXT NOT NULL CHECK(action_id ~ '^ACT-[a-g]-[0-9]{3,5}$'),
 clause TEXT NOT NULL CHECK(clause IN ('a','b','c','d','e','f','g')),
 measurement_code TEXT NOT NULL CHECK(measurement_code IN ('M1','M2','M3')),
 revision INT NOT NULL DEFAULT 1 CHECK(revision>=1),
 status TEXT NOT NULL CHECK(status IN ('pending','in_progress','completed','reprogrammed','suspended')),
 progress_percent INT NOT NULL CHECK(progress_percent BETWEEN 0 AND 100),
 evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(evidence_refs)='array'),
 professional_note TEXT NOT NULL DEFAULT '',
 adjustment_note TEXT NOT NULL DEFAULT '',
 updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(establishment_id,school_year,action_id,measurement_code),
 CONSTRAINT v2_followup_clause_id_matches CHECK(split_part(action_id,'-',2)=clause)
);
CREATE TABLE IF NOT EXISTS community_pgce_followup_audit_v2_2027 (
 id BIGSERIAL PRIMARY KEY,
 establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
 school_year INT NOT NULL DEFAULT 2027 CHECK(school_year=2027),
 action_id TEXT NOT NULL CHECK(action_id ~ '^ACT-[a-g]-[0-9]{3,5}$'),
 clause TEXT NOT NULL CHECK(clause IN ('a','b','c','d','e','f','g')),
 measurement_code TEXT NOT NULL CHECK(measurement_code IN ('M1','M2','M3')),
 revision INT NOT NULL CHECK(revision>=1),
 performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(establishment_id,school_year,action_id,measurement_code,revision),
 CONSTRAINT v2_audit_clause_id_matches CHECK(split_part(action_id,'-',2)=clause)
);
CREATE INDEX IF NOT EXISTS idx_community_pgce_followup_audit_v2_est
 ON community_pgce_followup_audit_v2_2027(establishment_id,created_at DESC);

-- Legacy: one action per clause; reserve sequence 001 to retain M1/M2/M3.
-- Repeated schema initialization must not overwrite newer V2 professional edits.
INSERT INTO community_pgce_action_followups_v2_2027
(establishment_id,school_year,action_id,clause,measurement_code,revision,
 status,progress_percent,evidence_refs,professional_note,adjustment_note,
 updated_by,updated_at)
SELECT establishment_id,school_year,'ACT-'||clause||'-001',clause,
 measurement_code,revision,status,progress_percent,evidence_refs,
 professional_note,adjustment_note,updated_by,updated_at
FROM community_pgce_action_followups_2027
WHERE true
ON CONFLICT(establishment_id,school_year,action_id,measurement_code) DO NOTHING;
INSERT INTO community_pgce_followup_audit_v2_2027
(establishment_id,school_year,action_id,clause,measurement_code,
 revision,performed_by,created_at)
SELECT establishment_id,school_year,'ACT-'||clause||'-001',clause,
 measurement_code,revision,performed_by,created_at
FROM community_pgce_followup_audit_2027
WHERE true
ON CONFLICT(establishment_id,school_year,action_id,measurement_code,revision) DO NOTHING;


-- Revisión de privacidad PREVIA a descargar textos libres del borrador PGCE.
-- No equivale a una aprobación legal del plan ni garantiza anonimización.
CREATE TABLE IF NOT EXISTS community_pgce_export_reviews_2027 (
 establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
 school_year INT NOT NULL DEFAULT 2027 CHECK(school_year=2027),
 draft_revision INT NOT NULL CHECK(draft_revision>=1),
 followup_fingerprint TEXT NOT NULL CHECK(followup_fingerprint ~ '^[0-9a-f]{64}$'),
 reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(establishment_id,school_year)
);
CREATE TABLE IF NOT EXISTS community_pgce_export_audit_2027 (
 id BIGSERIAL PRIMARY KEY,
 establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
 school_year INT NOT NULL DEFAULT 2027 CHECK(school_year=2027),
 action TEXT NOT NULL CHECK(action IN ('privacy_reviewed','csv_downloaded')),
 draft_revision INT NOT NULL CHECK(draft_revision>=1),
 followup_fingerprint TEXT NOT NULL CHECK(followup_fingerprint ~ '^[0-9a-f]{64}$'),
 performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_pgce_export_audit_est
 ON community_pgce_export_audit_2027(establishment_id,created_at DESC);


-- Registro de referencias documentales de gobernanza; separado de borradores.
-- Jamás acredita autenticidad del documento o aprobación legal por sí solo.
CREATE TABLE IF NOT EXISTS community_pgce_governance_2027 (
 id BIGSERIAL PRIMARY KEY,
 establishment_id BIGINT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
 school_year INT NOT NULL DEFAULT 2027 CHECK(school_year=2027),
 stage TEXT NOT NULL CHECK(stage IN ('council_review','direction_act')),
 draft_revision INT NOT NULL CHECK(draft_revision>=1),
 document_ref TEXT NOT NULL CHECK(length(document_ref) BETWEEN 6 AND 120),
 document_date DATE NOT NULL,
 recorded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(establishment_id,school_year,stage,draft_revision)
);
CREATE INDEX IF NOT EXISTS idx_community_pgce_governance_est_2027
 ON community_pgce_governance_2027(establishment_id,stage,draft_revision DESC);
