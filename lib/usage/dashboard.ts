import type { Outcome, UsageRecord } from "./record";

export type DashboardAggregateRow = {
  user_id: string;
  requests: number | string;
  tokens_in: number | string;
  tokens_out: number | string;
  tokens_cached: number | string;
  cost_cents: number | string | null;
  retry_requests: number | string;
  success_count: number | string;
  retry_success_count: number | string;
  invalid_count: number | string;
  cancelled_count: number | string;
  api_error_count: number | string;
};

export type DashboardTimelineRow = {
  id: number | string;
  ts: string | Date;
  user_id: string;
  mode: UsageRecord["mode"];
  parts: number | null;
  attempts: number;
  tokens_in: number | string | null;
  tokens_out: number | string | null;
  tokens_cached: number | string | null;
  duration_ms: number;
  outcome: Outcome;
  cost_cents: number | string | null;
};

export type DashboardOutcomes = Record<Outcome, number>;

export type DashboardSummary = {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  costCents: number | null;
  retryRate: number | null;
  outcomes: DashboardOutcomes;
};

export type DashboardUser = DashboardSummary & { userId: string };

export type DashboardTimelineItem = {
  id: string;
  ts: string;
  userId: string;
  mode: UsageRecord["mode"];
  parts: number | null;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  durationMs: number;
  outcome: Outcome;
  costCents: number | null;
};

export type UsageDashboard = {
  generatedAt: string;
  totals: DashboardSummary;
  users: DashboardUser[];
  timeline: DashboardTimelineItem[];
};

function count(value: number | string | null): number {
  return value == null ? 0 : Number(value);
}

function cost(value: number | string | null): number | null {
  return value == null ? null : Number(value);
}

function outcomes(row: DashboardAggregateRow): DashboardOutcomes {
  return {
    success: count(row.success_count),
    "retry-success": count(row.retry_success_count),
    invalid: count(row.invalid_count),
    cancelled: count(row.cancelled_count),
    "api-error": count(row.api_error_count),
  };
}

function addOutcomes(left: DashboardOutcomes, right: DashboardOutcomes) {
  for (const key of Object.keys(left) as Outcome[]) left[key] += right[key];
}

export function buildUsageDashboard(
  aggregateRows: DashboardAggregateRow[],
  timelineRows: DashboardTimelineRow[],
  generatedAt = new Date().toISOString()
): UsageDashboard {
  const users = aggregateRows.map((row): DashboardUser => {
    const requests = count(row.requests);
    return {
      userId: row.user_id,
      requests,
      tokensIn: count(row.tokens_in),
      tokensOut: count(row.tokens_out),
      tokensCached: count(row.tokens_cached),
      costCents: cost(row.cost_cents),
      retryRate: requests ? count(row.retry_requests) / requests : null,
      outcomes: outcomes(row),
    };
  });

  const totals: DashboardSummary = {
    requests: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensCached: 0,
    costCents: 0,
    retryRate: null,
    outcomes: {
      success: 0,
      "retry-success": 0,
      invalid: 0,
      cancelled: 0,
      "api-error": 0,
    },
  };
  let retryRequests = 0;
  for (let index = 0; index < users.length; index++) {
    const user = users[index];
    totals.requests += user.requests;
    totals.tokensIn += user.tokensIn;
    totals.tokensOut += user.tokensOut;
    totals.tokensCached += user.tokensCached;
    retryRequests += count(aggregateRows[index].retry_requests);
    if (totals.costCents != null) {
      totals.costCents = user.costCents == null ? null : totals.costCents + user.costCents;
    }
    addOutcomes(totals.outcomes, user.outcomes);
  }
  totals.retryRate = totals.requests ? retryRequests / totals.requests : null;

  const timeline = timelineRows.map(
    (row): DashboardTimelineItem => ({
      id: String(row.id),
      ts: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
      userId: row.user_id,
      mode: row.mode,
      parts: row.parts,
      attempts: row.attempts,
      tokensIn: count(row.tokens_in),
      tokensOut: count(row.tokens_out),
      tokensCached: count(row.tokens_cached),
      durationMs: row.duration_ms,
      outcome: row.outcome,
      costCents: cost(row.cost_cents),
    })
  );

  return { generatedAt, totals, users, timeline };
}
