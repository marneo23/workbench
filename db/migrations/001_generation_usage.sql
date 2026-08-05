CREATE TABLE IF NOT EXISTS generation_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts timestamptz NOT NULL,
  user_id text NOT NULL,
  model text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('new', 'refinement')),
  label text,
  parts integer CHECK (parts IS NULL OR parts >= 0),
  attempts integer NOT NULL CHECK (attempts >= 0),
  tokens_in bigint CHECK (tokens_in IS NULL OR tokens_in >= 0),
  tokens_out bigint CHECK (tokens_out IS NULL OR tokens_out >= 0),
  tokens_cached bigint CHECK (tokens_cached IS NULL OR tokens_cached >= 0),
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  outcome text NOT NULL CHECK (
    outcome IN ('success', 'retry-success', 'invalid', 'cancelled', 'api-error')
  ),
  cost_cents numeric(18, 8) CHECK (cost_cents IS NULL OR cost_cents >= 0),
  complete boolean NOT NULL,
  estimated boolean NOT NULL,
  error_code text,
  record jsonb NOT NULL
);
