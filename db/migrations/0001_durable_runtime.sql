CREATE SCHEMA IF NOT EXISTS oplera;
REVOKE ALL ON SCHEMA oplera FROM PUBLIC;

CREATE TABLE IF NOT EXISTS oplera.recovery_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_crm TEXT NOT NULL,
  external_opportunity_id TEXT NOT NULL,
  external_contact_id TEXT,
  external_company_id TEXT,
  recovery_status TEXT NOT NULL DEFAULT 'discovered',
  recovery_score INTEGER NOT NULL DEFAULT 0 CHECK (recovery_score BETWEEN 0 AND 100),
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT,
  reason_code TEXT,
  last_activity_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recovery_opportunities_external_unique UNIQUE (external_crm, external_opportunity_id)
);

CREATE TABLE IF NOT EXISTS oplera.recovery_sessions (
  id TEXT PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES oplera.recovery_opportunities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  strategy TEXT,
  channel TEXT,
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oplera.recovery_tasks (
  id TEXT PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES oplera.recovery_opportunities(id) ON DELETE CASCADE,
  recovery_session_id TEXT NOT NULL REFERENCES oplera.recovery_sessions(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'leased', 'running', 'succeeded', 'failed', 'cancelled')),
  leased_at TIMESTAMPTZ,
  leased_by TEXT,
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts > 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS recovery_tasks_claim_idx
  ON oplera.recovery_tasks (status, due_at, priority DESC, id);
CREATE INDEX IF NOT EXISTS recovery_tasks_lease_idx
  ON oplera.recovery_tasks (status, leased_at)
  WHERE status IN ('leased', 'running');

CREATE TABLE IF NOT EXISTS oplera.recovery_messages (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES oplera.recovery_opportunities(id) ON DELETE CASCADE,
  recovery_session_id TEXT REFERENCES oplera.recovery_sessions(id) ON DELETE SET NULL,
  external_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  actor TEXT NOT NULL,
  channel TEXT NOT NULL,
  content TEXT NOT NULL,
  received_or_sent_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_messages_external_unique
  ON oplera.recovery_messages (channel, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS oplera.recovery_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES oplera.recovery_opportunities(id) ON DELETE CASCADE,
  recovery_session_id TEXT REFERENCES oplera.recovery_sessions(id) ON DELETE SET NULL,
  decision_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  short_reason TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS oplera.recovery_events (
  id UUID PRIMARY KEY,
  opportunity_id UUID REFERENCES oplera.recovery_opportunities(id) ON DELETE SET NULL,
  recovery_session_id TEXT REFERENCES oplera.recovery_sessions(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES oplera.recovery_tasks(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  decision TEXT NOT NULL,
  policy_result TEXT,
  result TEXT NOT NULL,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION oplera.reject_recovery_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'recovery_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS recovery_events_append_only ON oplera.recovery_events;
CREATE TRIGGER recovery_events_append_only
BEFORE UPDATE OR DELETE ON oplera.recovery_events
FOR EACH ROW EXECUTE FUNCTION oplera.reject_recovery_event_mutation();

CREATE TABLE IF NOT EXISTS oplera.recovery_handoffs (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES oplera.recovery_opportunities(id) ON DELETE CASCADE,
  recovery_session_id TEXT REFERENCES oplera.recovery_sessions(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  summary TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS oplera.pilot_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt >= 0),
  fingerprint TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT pilot_approvals_fingerprint_unique UNIQUE (opportunity_id, fingerprint)
);

CREATE UNIQUE INDEX IF NOT EXISTS pilot_approvals_one_active_idx
  ON oplera.pilot_approvals (opportunity_id)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS oplera.pilot_outbound_operations (
  idempotency_key TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'accepted', 'writeback_completed', 'uncertain')),
  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_accepted_at TIMESTAMPTZ,
  crm_writeback_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS pilot_outbound_provider_message_unique
  ON oplera.pilot_outbound_operations (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS oplera.pilot_inbound_messages (
  provider TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  opportunity_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, external_message_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA oplera FROM anon';
    EXECUTE 'REVOKE ALL ON SCHEMA oplera FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA oplera FROM authenticated';
    EXECUTE 'REVOKE ALL ON SCHEMA oplera FROM authenticated';
  END IF;
END;
$$;
