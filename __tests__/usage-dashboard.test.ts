import { describe, expect, it } from "vitest";
import {
  buildUsageDashboard,
  type DashboardAggregateRow,
  type DashboardTimelineRow,
} from "@/lib/usage/dashboard";
import {
  queryUsageDashboard,
  type DashboardQuery,
} from "@/lib/usage/dashboard-db";

const aggregate = (
  over: Partial<DashboardAggregateRow> = {}
): DashboardAggregateRow => ({
  user_id: "alice",
  requests: "3",
  tokens_in: "6000",
  tokens_out: "3000",
  tokens_cached: "2000",
  cost_cents: "4.25",
  retry_requests: "1",
  success_count: "1",
  retry_success_count: "1",
  invalid_count: "1",
  cancelled_count: "0",
  api_error_count: "0",
  ...over,
});

const timeline = (
  over: Partial<DashboardTimelineRow> = {}
): DashboardTimelineRow => ({
  id: "7",
  ts: "2026-08-05T12:00:00.000Z",
  user_id: "alice",
  mode: "new",
  parts: 8,
  attempts: 2,
  tokens_in: "2000",
  tokens_out: "1000",
  tokens_cached: "750",
  duration_ms: 9400,
  outcome: "retry-success",
  cost_cents: "1.5",
  ...over,
});

describe("buildUsageDashboard", () => {
  it("builds weighted owner totals, per-user metrics, outcomes, and timeline", () => {
    const result = buildUsageDashboard(
      [
        aggregate(),
        aggregate({
          user_id: "bob",
          requests: "1",
          tokens_in: "500",
          tokens_out: "250",
          tokens_cached: "0",
          cost_cents: null,
          retry_requests: "1",
          success_count: "0",
          retry_success_count: "0",
          invalid_count: "0",
          cancelled_count: "0",
          api_error_count: "1",
        }),
      ],
      [timeline()],
      "2026-08-05T12:05:00.000Z"
    );

    expect(result.generatedAt).toBe("2026-08-05T12:05:00.000Z");
    expect(result.totals).toEqual({
      requests: 4,
      tokensIn: 6500,
      tokensOut: 3250,
      tokensCached: 2000,
      costCents: null,
      retryRate: 0.5,
      outcomes: {
        success: 1,
        "retry-success": 1,
        invalid: 1,
        cancelled: 0,
        "api-error": 1,
      },
    });
    expect(result.users[0]).toMatchObject({
      userId: "alice",
      requests: 3,
      costCents: 4.25,
      retryRate: 1 / 3,
    });
    expect(result.timeline[0]).toEqual({
      id: "7",
      ts: "2026-08-05T12:00:00.000Z",
      userId: "alice",
      mode: "new",
      parts: 8,
      attempts: 2,
      tokensIn: 2000,
      tokensOut: 1000,
      tokensCached: 750,
      durationMs: 9400,
      outcome: "retry-success",
      costCents: 1.5,
    });
  });

  it("returns honest zero-state metrics without dividing by zero", () => {
    expect(buildUsageDashboard([], [], "2026-08-05T12:05:00.000Z")).toEqual({
      generatedAt: "2026-08-05T12:05:00.000Z",
      totals: {
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
      },
      users: [],
      timeline: [],
    });
  });
});

describe("queryUsageDashboard", () => {
  it("queries grouped users and a bounded recent timeline", async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const query = (async <T>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T[]> => {
      const sql = strings.join("?");
      calls.push({ sql, values });
      return (sql.includes("GROUP BY user_id") ? [aggregate()] : [timeline()]) as T[];
    }) as DashboardQuery;

    const result = await queryUsageDashboard(
      query,
      () => new Date("2026-08-05T12:05:00.000Z")
    );

    expect(result.totals.requests).toBe(3);
    expect(result.timeline).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).toContain("ORDER BY ts DESC, id DESC");
    expect(calls[1].values).toEqual([100]);
  });
});
