CREATE INDEX IF NOT EXISTS generation_usage_user_ts_idx
  ON generation_usage (user_id, ts DESC);
