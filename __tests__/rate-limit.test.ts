import { describe, expect, it, vi } from "vitest";
import {
  consumeGenerationQuota,
  type RateLimitQuery,
} from "@/lib/access/rate-limit";

function queryReturning(...results: boolean[]): RateLimitQuery {
  let index = 0;
  return vi.fn(
    async () => (results[index++] ? [{ request_count: 1 }] : [])
  ) as unknown as RateLimitQuery;
}

describe("generation quota", () => {
  it("allows a request only after consuming minute and daily buckets", async () => {
    const query = queryReturning(true, true);

    await expect(
      consumeGenerationQuota(query, "p_security", new Date("2026-08-11T12:34:20Z"))
    ).resolves.toEqual({ allowed: true });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects at the minute limit without consuming the daily bucket", async () => {
    const query = queryReturning(false);

    await expect(
      consumeGenerationQuota(query, "p_security", new Date("2026-08-11T12:34:20Z"))
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 40 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects at the daily limit", async () => {
    const query = queryReturning(true, false);

    await expect(
      consumeGenerationQuota(query, "p_security", new Date("2026-08-11T12:34:20Z"))
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 41140 });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
