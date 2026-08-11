CREATE TABLE IF NOT EXISTS generation_rate_limits (
  participant_id text NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('minute', 'day')),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (participant_id, bucket)
);
