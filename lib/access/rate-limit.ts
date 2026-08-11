export interface RateLimitQuery {
  <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
}

type Bucket = "minute" | "day";
type QuotaDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const REQUESTS_PER_MINUTE = 5;
const REQUESTS_PER_DAY = 50;

function minuteStart(now: Date): Date {
  const start = new Date(now);
  start.setUTCSeconds(0, 0);
  return start;
}

function dayStart(now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function secondsUntil(windowStart: Date, durationMs: number, now: Date): number {
  return Math.max(1, Math.ceil((windowStart.getTime() + durationMs - now.getTime()) / 1000));
}

async function consumeBucket(
  sql: RateLimitQuery,
  participantId: string,
  bucket: Bucket,
  windowStartedAt: Date,
  limit: number
): Promise<boolean> {
  const rows = await sql<{ request_count: number }>`
    INSERT INTO generation_rate_limits (
      participant_id, bucket, window_started_at, request_count
    ) VALUES (
      ${participantId}, ${bucket}, ${windowStartedAt}, 1
    )
    ON CONFLICT (participant_id, bucket) DO UPDATE SET
      window_started_at = EXCLUDED.window_started_at,
      request_count = CASE
        WHEN generation_rate_limits.window_started_at < EXCLUDED.window_started_at
          THEN 1
        ELSE generation_rate_limits.request_count + 1
      END
    WHERE generation_rate_limits.window_started_at < EXCLUDED.window_started_at
       OR generation_rate_limits.request_count < ${limit}
    RETURNING request_count
  `;
  return rows.length > 0;
}

export async function consumeGenerationQuota(
  sql: RateLimitQuery,
  participantId: string,
  now = new Date()
): Promise<QuotaDecision> {
  const minute = minuteStart(now);
  if (!(await consumeBucket(sql, participantId, "minute", minute, REQUESTS_PER_MINUTE))) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(minute, 60_000, now),
    };
  }

  const day = dayStart(now);
  if (!(await consumeBucket(sql, participantId, "day", day, REQUESTS_PER_DAY))) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(day, 86_400_000, now),
    };
  }

  return { allowed: true };
}

export async function enforceGenerationQuota(
  connectionString: string,
  participantId: string
): Promise<QuotaDecision> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionString) as unknown as RateLimitQuery;
  return consumeGenerationQuota(sql, participantId);
}
