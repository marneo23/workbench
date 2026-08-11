DO $migration$
BEGIN
  CREATE TABLE IF NOT EXISTS generation_artifacts (
    id text PRIMARY KEY,
    participant_id text NOT NULL,
    requested_parent_artifact_id text,
    parent_artifact_id text REFERENCES generation_artifacts(id) ON DELETE SET NULL,
    prompt text NOT NULL,
    input_spec jsonb,
    output_spec jsonb,
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
    outcome text NOT NULL CHECK (
      outcome IN ('success', 'retry-success', 'invalid', 'cancelled', 'api-error')
    ),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  );

  ALTER TABLE generation_usage
    ADD COLUMN IF NOT EXISTS artifact_id text;

  ALTER TABLE generation_artifacts
    ADD COLUMN IF NOT EXISTS requested_parent_artifact_id text;

  CREATE UNIQUE INDEX IF NOT EXISTS generation_usage_artifact_id_idx
    ON generation_usage (artifact_id)
    WHERE artifact_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS generation_artifacts_participant_created_idx
    ON generation_artifacts (participant_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS generation_artifacts_parent_idx
    ON generation_artifacts (parent_artifact_id)
    WHERE parent_artifact_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS generation_artifacts_requested_parent_idx
    ON generation_artifacts (requested_parent_artifact_id)
    WHERE requested_parent_artifact_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS generation_artifacts_expires_idx
    ON generation_artifacts (expires_at);
END
$migration$;
