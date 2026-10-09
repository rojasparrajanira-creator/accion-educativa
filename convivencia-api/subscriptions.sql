ALTER TABLE users ADD COLUMN IF NOT EXISTS temporary_password_expires_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS mec_subscriptions (
 id UUID PRIMARY KEY, rbd TEXT NOT NULL, establishment_name TEXT NOT NULL, full_name TEXT NOT NULL, rut TEXT NOT NULL, email TEXT NOT NULL,
 plan_code TEXT NOT NULL CHECK(plan_code IN ('300','500','2000')), student_limit INT NOT NULL, price_clp INT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','enrolling','enrollment_uncertain','payment_pending','paid_pending_activation','active','payment_failed','cancelled')),
 management_token_hash TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE, enrollment_token_hash TEXT UNIQUE, enrollment_expires_at TIMESTAMPTZ,
 tbk_user_encrypted TEXT, establishment_id BIGINT UNIQUE REFERENCES establishments(id), user_id BIGINT REFERENCES users(id),
 recurring_consent_at TIMESTAMPTZ NOT NULL, consent_version TEXT NOT NULL DEFAULT '2026-10-09', activated_at TIMESTAMPTZ,
 access_until TIMESTAMPTZ, next_charge_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ, approved_by BIGINT REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mec_subscription_pending_rbd ON mec_subscriptions(rbd) WHERE cancelled_at IS NULL;
CREATE TABLE IF NOT EXISTS mec_subscription_payments (
 id BIGSERIAL PRIMARY KEY, subscription_id UUID NOT NULL REFERENCES mec_subscriptions(id), cycle_key TEXT NOT NULL,
 buy_order TEXT NOT NULL UNIQUE, amount_clp INT NOT NULL, state TEXT NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','uncertain','authorized','declined')),
 provider_status TEXT, response_code INT, authorization_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ,
 UNIQUE(subscription_id,cycle_key)
);
CREATE TABLE IF NOT EXISTS mec_subscription_mail (
 id UUID PRIMARY KEY, subscription_id UUID REFERENCES mec_subscriptions(id), recipient TEXT NOT NULL, subject TEXT NOT NULL,
 body_encrypted TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')), attempts INT NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mec_access_requests (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- El bloqueo del establecimiento serializa altas y reactivaciones de matrícula.
CREATE OR REPLACE FUNCTION mec_student_plan_limit() RETURNS trigger AS $$
DECLARE lim INT; total INT;
BEGIN
 IF NOT NEW.active THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.active AND OLD.establishment_id=NEW.establishment_id THEN RETURN NEW; END IF;
 -- Un upsert de una matrícula ya activa no agrega otro estudiante.
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM students WHERE establishment_id=NEW.establishment_id AND rut=NEW.rut AND active) THEN RETURN NEW; END IF;
 PERFORM id FROM establishments WHERE id=NEW.establishment_id FOR UPDATE;
 SELECT student_limit INTO lim FROM mec_subscriptions WHERE establishment_id=NEW.establishment_id;
 IF lim IS NULL THEN RETURN NEW; END IF;
 SELECT count(*) INTO total FROM students WHERE establishment_id=NEW.establishment_id AND active AND id<>coalesce(NEW.id,0);
 IF total>=lim THEN RAISE EXCEPTION 'student_plan_limit_reached'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS mec_student_plan_limit_trigger ON students;
CREATE TRIGGER mec_student_plan_limit_trigger BEFORE INSERT OR UPDATE OF active,establishment_id ON students FOR EACH ROW EXECUTE FUNCTION mec_student_plan_limit();
