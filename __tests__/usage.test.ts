import { describe, expect, it } from "vitest";
import {
  addTokens,
  buildUsageRecord,
  cacheHitRate,
  classifyOutcome,
  fromProviderUsage,
  reasoningShare,
  sumTokens,
  type Attempt,
  type TokenCounts,
} from "@/lib/usage/record";
import { estimateCostUsd, ratesFromEnv, type Rates } from "@/lib/usage/pricing";

/**
 * The point of this instrumentation is to answer "what does a request cost",
 * and every way of getting that wrong is silent — a plausible number that is
 * simply too low. So these are arithmetic invariants, not snapshots.
 */

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  attempt: 1,
  tokens: {},
  reported: true,
  validationErrors: 0,
  estimated: false,
  ...over,
});

describe("addTokens", () => {
  it("keeps 'not reported' distinct from zero", () => {
    // OpenAI omits the cache/reasoning details on some responses. If undefined
    // collapsed to 0, a provider that stopped reporting cache hits would look
    // exactly like caching being broken — the one thing this measures.
    expect(addTokens({}, {}).cacheReadTokens).toBeUndefined();
    expect(addTokens({ cacheReadTokens: 0 }, {}).cacheReadTokens).toBe(0);
  });

  it("treats a one-sided gap as zero rather than erasing the sum", () => {
    const merged = addTokens({ inputTokens: 100 }, {});
    expect(merged.inputTokens).toBe(100);
  });

  it("adds every field independently", () => {
    const a: TokenCounts = {
      inputTokens: 100,
      cacheReadTokens: 40,
      outputTokens: 10,
      reasoningTokens: 6,
      totalTokens: 110,
    };
    expect(addTokens(a, a)).toEqual({
      inputTokens: 200,
      cacheReadTokens: 80,
      cacheWriteTokens: undefined,
      outputTokens: 20,
      reasoningTokens: 12,
      totalTokens: 220,
    });
  });
});

describe("summing across retry attempts", () => {
  // MAX_ATTEMPTS = 2 and a retry resends the failed spec on top of the original
  // messages, so attempt 2 costs MORE than attempt 1. Recording only the
  // attempt that succeeded is the easy mistake, and it understates spend by
  // however often retries fire.
  const failed: TokenCounts = { inputTokens: 2000, outputTokens: 4000 };
  const retried: TokenCounts = { inputTokens: 6500, outputTokens: 4000 };

  it("charges for both calls, not just the one that worked", () => {
    const total = sumTokens([failed, retried]);
    expect(total.inputTokens).toBe(8500);
    expect(total.outputTokens).toBe(8000);
    // The naive version — last attempt only — would report this instead:
    expect(total.inputTokens).not.toBe(retried.inputTokens);
    expect(total.outputTokens).not.toBe(retried.outputTokens);
  });

  it("makes the retry visible as more expensive than the first pass", () => {
    expect(retried.inputTokens!).toBeGreaterThan(failed.inputTokens!);
  });
});

describe("fromProviderUsage", () => {
  it("flattens the SDK's nested cache and reasoning details", () => {
    expect(
      fromProviderUsage({
        inputTokens: 2000,
        inputTokenDetails: { cacheReadTokens: 1900, cacheWriteTokens: 0 },
        outputTokens: 3000,
        outputTokenDetails: { reasoningTokens: 2200 },
        totalTokens: 5000,
      })
    ).toEqual({
      inputTokens: 2000,
      cacheReadTokens: 1900,
      cacheWriteTokens: 0,
      outputTokens: 3000,
      reasoningTokens: 2200,
      totalTokens: 5000,
    });
  });

  it("yields an empty record rather than throwing when nothing was reported", () => {
    expect(fromProviderUsage(undefined)).toEqual({});
    expect(fromProviderUsage({})).toEqual({
      inputTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });
});

describe("classifyOutcome", () => {
  it("separates a clean first pass from one that needed the retry", () => {
    expect(
      classifyOutcome({ attempts: [attempt()], succeeded: true })
    ).toBe("success");
    expect(
      classifyOutcome({
        attempts: [attempt({ validationErrors: 3 }), attempt({ attempt: 2 })],
        succeeded: true,
      })
    ).toBe("retry-success");
  });

  it("names the two paid-but-delivered-nothing cases", () => {
    expect(
      classifyOutcome({ attempts: [attempt(), attempt()], succeeded: false })
    ).toBe("invalid");
    expect(
      classifyOutcome({ attempts: [attempt()], succeeded: false, cancelled: true })
    ).toBe("cancelled");
  });

  it("reports cancellation ahead of an API error, since the abort causes it", () => {
    expect(
      classifyOutcome({
        attempts: [],
        succeeded: false,
        cancelled: true,
        apiError: true,
      })
    ).toBe("cancelled");
  });
});

describe("buildUsageRecord", () => {
  const base = {
    model: "test-model",
    mode: "new" as const,
    streaming: true,
    durationMs: 1234,
    promptChars: 42,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };

  it("sums attempts into the row and keeps the per-attempt split", () => {
    const record = buildUsageRecord({
      ...base,
      succeeded: true,
      attempts: [
        attempt({ tokens: { inputTokens: 2000, outputTokens: 4000 }, validationErrors: 2 }),
        attempt({ attempt: 2, tokens: { inputTokens: 6500, outputTokens: 4000 } }),
      ],
    });

    expect(record.tokens.inputTokens).toBe(8500);
    expect(record.attemptsUsed).toBe(2);
    expect(record.outcome).toBe("retry-success");
    // Per-attempt survives: attempt 2 should show a bigger cache read than
    // attempt 1 once caching is confirmed, and folding them together loses that.
    expect(record.perAttempt).toHaveLength(2);
  });

  it("flags a row as incomplete when any attempt went unreported", () => {
    const record = buildUsageRecord({
      ...base,
      succeeded: true,
      attempts: [attempt(), attempt({ attempt: 2, reported: false })],
    });
    expect(record.complete).toBe(false);
  });

  it("flags estimated rows so aggregates can exclude them", () => {
    const record = buildUsageRecord({
      ...base,
      succeeded: false,
      cancelled: true,
      attempts: [attempt({ reported: false, estimated: true })],
    });
    expect(record.estimated).toBe(true);
    expect(record.complete).toBe(false);
    expect(record.outcome).toBe("cancelled");
  });

  it("records a refinement's input part count, the driver of its cost", () => {
    const record = buildUsageRecord({
      ...base,
      mode: "refinement",
      succeeded: true,
      attempts: [attempt()],
      inputParts: 60,
      outputParts: 61,
    });
    expect(record.mode).toBe("refinement");
    expect(record.inputParts).toBe(60);
  });
});

describe("derived ratios", () => {
  it("returns null rather than a fake zero when nothing was reported", () => {
    expect(cacheHitRate({})).toBeNull();
    expect(cacheHitRate({ inputTokens: 0, cacheReadTokens: 0 })).toBeNull();
    expect(reasoningShare({ outputTokens: 100 })).toBeNull();
  });

  it("measures the cached share of input", () => {
    expect(cacheHitRate({ inputTokens: 2000, cacheReadTokens: 1900 })).toBeCloseTo(0.95);
  });

  it("measures the invisible share of output", () => {
    expect(reasoningShare({ outputTokens: 4000, reasoningTokens: 3000 })).toBeCloseTo(0.75);
  });
});

describe("estimateCostUsd", () => {
  // Illustrative rates only — the shipped table is empty on purpose.
  const rates: Record<string, Rates> = {
    "test-model": { input: 1.25, cachedInput: 0.125, output: 10 },
  };

  it("returns null when the model has no rates, instead of guessing", () => {
    expect(estimateCostUsd("unpriced", { inputTokens: 1, outputTokens: 1 }, rates)).toBeNull();
  });

  it("returns null when the counts are too incomplete to price", () => {
    expect(estimateCostUsd("test-model", { inputTokens: 1000 }, rates)).toBeNull();
  });

  it("bills cache reads at the discounted rate, not the full one", () => {
    const cost = estimateCostUsd(
      "test-model",
      { inputTokens: 10_000, cacheReadTokens: 2000, outputTokens: 1000 },
      rates
    );
    // 8000 @ 1.25 + 2000 @ 0.125 + 1000 @ 10, per million.
    expect(cost).toBeCloseTo(0.02025, 8);

    const uncached = estimateCostUsd(
      "test-model",
      { inputTokens: 10_000, cacheReadTokens: 0, outputTokens: 1000 },
      rates
    );
    expect(uncached!).toBeGreaterThan(cost!);
  });

  it("does not double-charge reasoning, which is already inside outputTokens", () => {
    const withReasoning = estimateCostUsd(
      "test-model",
      { inputTokens: 1000, outputTokens: 4000, reasoningTokens: 3000 },
      rates
    );
    const without = estimateCostUsd(
      "test-model",
      { inputTokens: 1000, outputTokens: 4000 },
      rates
    );
    expect(withReasoning).toBe(without);
  });
});

describe("ratesFromEnv", () => {
  it("ignores malformed input rather than throwing on boot", () => {
    expect(ratesFromEnv(undefined)).toEqual({});
    expect(ratesFromEnv("not json")).toEqual({});
    expect(ratesFromEnv('{"m":{"input":1}}')).toEqual({});
  });

  it("accepts a complete triple", () => {
    expect(ratesFromEnv('{"m":{"input":1,"cachedInput":0.1,"output":8}}')).toEqual({
      m: { input: 1, cachedInput: 0.1, output: 8 },
    });
  });
});
