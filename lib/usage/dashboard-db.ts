import {
  buildUsageDashboard,
  type DashboardAggregateRow,
  type DashboardTimelineRow,
  type UsageDashboard,
} from "./dashboard";

export interface DashboardQuery {
  <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
}

export async function queryUsageDashboard(
  sql: DashboardQuery,
  now: () => Date = () => new Date()
): Promise<UsageDashboard> {
  const [aggregateRows, timelineRows] = await Promise.all([
    sql<DashboardAggregateRow>`
      SELECT
        user_id,
        COUNT(*) AS requests,
        COALESCE(SUM(tokens_in), 0) AS tokens_in,
        COALESCE(SUM(tokens_out), 0) AS tokens_out,
        COALESCE(SUM(tokens_cached), 0) AS tokens_cached,
        CASE
          WHEN COUNT(cost_cents) = COUNT(*) THEN COALESCE(SUM(cost_cents), 0)
          ELSE NULL
        END AS cost_cents,
        COUNT(*) FILTER (WHERE attempts > 1) AS retry_requests,
        COUNT(*) FILTER (WHERE outcome = 'success') AS success_count,
        COUNT(*) FILTER (WHERE outcome = 'retry-success') AS retry_success_count,
        COUNT(*) FILTER (WHERE outcome = 'invalid') AS invalid_count,
        COUNT(*) FILTER (WHERE outcome = 'cancelled') AS cancelled_count,
        COUNT(*) FILTER (WHERE outcome = 'api-error') AS api_error_count
      FROM generation_usage
      GROUP BY user_id
      ORDER BY COUNT(*) DESC, user_id ASC
    `,
    sql<DashboardTimelineRow>`
      SELECT
        id,
        ts,
        user_id,
        mode,
        parts,
        attempts,
        tokens_in,
        tokens_out,
        tokens_cached,
        duration_ms,
        outcome,
        cost_cents
      FROM generation_usage
      ORDER BY ts DESC, id DESC
      LIMIT ${100}
    `,
  ]);

  return buildUsageDashboard(aggregateRows, timelineRows, now().toISOString());
}

/** Loads the Neon driver only after owner authorization succeeds. */
export async function loadUsageDashboard(
  connectionString: string
): Promise<UsageDashboard> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionString) as unknown as DashboardQuery;
  return queryUsageDashboard(sql);
}
