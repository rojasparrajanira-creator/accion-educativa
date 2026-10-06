CREATE TABLE IF NOT EXISTS establishments(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,rbd TEXT UNIQUE,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,establishment_id BIGINT REFERENCES establishments(id),email TEXT NOT NULL,rut TEXT,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'professional',active BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(establishment_id,email));
CREATE TABLE IF NOT EXISTS courses(id BIGSERIAL PRIMARY KEY,establishment_id BIGINT NOT NULL REFERENCES establishments(id),name TEXT NOT NULL,school_year INT NOT NULL,UNIQUE(establishment_id,name,school_year));
CREATE TABLE IF NOT EXISTS students(id BIGSERIAL PRIMARY KEY,establishment_id BIGINT NOT NULL REFERENCES establishments(id),course_id BIGINT REFERENCES courses(id),rut TEXT,name TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(establishment_id,rut));
CREATE TABLE IF NOT EXISTS measurements(id BIGSERIAL PRIMARY KEY,establishment_id BIGINT NOT NULL REFERENCES establishments(id),code TEXT NOT NULL CHECK(code IN ('M1','M2','M3')),school_year INT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',UNIQUE(establishment_id,code,school_year));
CREATE TABLE IF NOT EXISTS survey_applications(id BIGSERIAL PRIMARY KEY,measurement_id BIGINT NOT NULL REFERENCES measurements(id),student_id BIGINT NOT NULL REFERENCES students(id),survey_level TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',started_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,UNIQUE(measurement_id,student_id));
CREATE TABLE IF NOT EXISTS responses(id BIGSERIAL PRIMARY KEY,application_id BIGINT NOT NULL REFERENCES survey_applications(id) ON DELETE CASCADE,item_code TEXT NOT NULL,value TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(application_id,item_code));
CREATE TABLE IF NOT EXISTS pgce_interventions(
 id BIGSERIAL PRIMARY KEY,
 establishment_id BIGINT NOT NULL REFERENCES establishments(id),
 source_application_id BIGINT REFERENCES survey_applications(id),
 dimension_code TEXT NOT NULL CHECK(dimension_code ~ '^D(0[1-9]|1[0-6])$'),
 priority TEXT NOT NULL CHECK(priority IN ('high','medium','low')),
 professional_decision TEXT NOT NULL CHECK(professional_decision IN ('aprobar','ajustar')),
 status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','in_progress','completed','reprogrammed','suspended')),
 responsible TEXT NOT NULL,
 start_date DATE NOT NULL,
 end_date DATE NOT NULL,
 indicator TEXT NOT NULL,
 target TEXT NOT NULL,
 evidence TEXT[] NOT NULL DEFAULT '{}',
 rationale TEXT[] NOT NULL DEFAULT '{}',
 pgce_objectives TEXT[] NOT NULL DEFAULT '{}',
 pgce_action_ids INT[] NOT NULL DEFAULT '{}',
 created_by BIGINT REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_pgce_interventions_establishment ON pgce_interventions(establishment_id);
CREATE INDEX IF NOT EXISTS idx_pgce_interventions_source_application ON pgce_interventions(source_application_id);
CREATE INDEX IF NOT EXISTS idx_pgce_interventions_dimension ON pgce_interventions(dimension_code);
CREATE TABLE IF NOT EXISTS pgce_intervention_updates(
 id BIGSERIAL PRIMARY KEY,
 intervention_id BIGINT NOT NULL REFERENCES pgce_interventions(id) ON DELETE CASCADE,
 measurement_code TEXT CHECK(measurement_code IN ('M1','M2','M3')),
 status TEXT NOT NULL CHECK(status IN ('approved','in_progress','completed','reprogrammed','suspended')),
 progress_percent INT CHECK(progress_percent BETWEEN 0 AND 100),
 evidence_note TEXT,
 adjustment_note TEXT,
 created_by BIGINT REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS measurement_settings(
 measurement_id BIGINT PRIMARY KEY REFERENCES measurements(id) ON DELETE CASCADE,
 start_date DATE NOT NULL,
 end_date DATE NOT NULL,
 modality TEXT NOT NULL DEFAULT 'individual' CHECK(modality IN ('individual','group_support')),
 estimated_minutes INT NOT NULL DEFAULT 25 CHECK(estimated_minutes BETWEEN 5 AND 90),
 initial_message TEXT NOT NULL DEFAULT 'Responde con tranquilidad. No existen respuestas correctas o incorrectas. Tu opinión es importante.',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(end_date >= start_date)
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth_sessions(
 token_hash TEXT PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

ALTER TABLE survey_applications ADD COLUMN IF NOT EXISTS access_token_hash TEXT;
ALTER TABLE survey_applications ADD COLUMN IF NOT EXISTS access_token_created_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_applications_access_token_hash ON survey_applications(access_token_hash) WHERE access_token_hash IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS response_drafts(
 application_id BIGINT NOT NULL REFERENCES survey_applications(id) ON DELETE CASCADE,
 item_code TEXT NOT NULL,
 value TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(application_id,item_code)
);
CREATE INDEX IF NOT EXISTS idx_response_drafts_application ON response_drafts(application_id);

CREATE TABLE IF NOT EXISTS application_reviews(
 application_id BIGINT PRIMARY KEY REFERENCES survey_applications(id) ON DELETE CASCADE,
 establishment_id BIGINT NOT NULL REFERENCES establishments(id),
 status TEXT NOT NULL CHECK(status IN ('reviewed','context_required')),
 note TEXT,
 reviewed_by BIGINT NOT NULL REFERENCES users(id),
 reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_application_reviews_establishment ON application_reviews(establishment_id);

CREATE TABLE IF NOT EXISTS professional_audit_events(
 id BIGSERIAL PRIMARY KEY,
 establishment_id BIGINT NOT NULL REFERENCES establishments(id),
 user_id BIGINT REFERENCES users(id),
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_professional_audit_establishment_created ON professional_audit_events(establishment_id,created_at DESC);

CREATE TABLE IF NOT EXISTS professional_tasks(
 id BIGSERIAL PRIMARY KEY,
 establishment_id BIGINT NOT NULL REFERENCES establishments(id),
 title TEXT NOT NULL,
 description TEXT,
 assigned_to BIGINT NOT NULL REFERENCES users(id),
 assigned_by BIGINT NOT NULL REFERENCES users(id),
 due_date DATE,
 priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
 related_type TEXT,
 related_id TEXT,
 completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_professional_tasks_assigned_to ON professional_tasks(assigned_to,status,due_date);
CREATE INDEX IF NOT EXISTS idx_professional_tasks_establishment ON professional_tasks(establishment_id,status,due_date);

CREATE TABLE IF NOT EXISTS professional_notifications(
 id BIGSERIAL PRIMARY KEY,
 establishment_id BIGINT NOT NULL REFERENCES establishments(id),
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 title TEXT NOT NULL,
 message TEXT,
 link TEXT,
 read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_professional_notifications_user ON professional_notifications(user_id,read_at,created_at DESC);
