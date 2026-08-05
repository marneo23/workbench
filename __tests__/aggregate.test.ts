import { describe, expect, it } from "vitest";
import {
  costPerSession,
  groupBy,
  parseJsonl,
  summarize,
} from "@/lib/usage/aggregate";
import { buildUsageRecord, type Attempt, type UsageRecord } from "@/lib/usage/record";
import type { Rates } from "@/lib/usage/pricing";

const rates: Record<string, Rates> = {
  m: { input: 1.25, cachedInput: 0.125, output: 10 },
};

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  attempt: 1,
  tokens: { inputTokens: 2000, outputTokens: 1000 },
  reported: true,
  validationErrors: 0,
  estimated: false,
  ...over,
});

const row = (over: Partial<Parameters<typeof buildUsageRecord>[0]> = {}): UsageRecord =>
  buildUsageRecord({
    userId: "local",
    model: "m",
    mode: "new",
    streaming: true,
    succeeded: true,
    attempts: [attempt()],
    durationMs: 1000,
    promptChars: 10,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  });

describe("parseJsonl", () => {
  it("reads bare rows and stdout-prefixed rows alike", () => {
    const bare = JSON.stringify(row());
    const text = [bare, `workbench.usage ${bare}`].join("\n");
    expect(parseJsonl(text).records).toHaveLength(2);
  });

  it("ignores the surrounding noise of a dev server log", () => {
    const text = [
      "  ▲ Next.js 16.2.10",
      "",
      JSON.stringify(row()),
      "not json at all",
      '{"kind":"something-else"}',
      "{ broken",
    ].join("\n");
    const { records, skipped } = parseJsonl(text);
    expect(records).toHaveLength(1);
    expect(skipped).toBe(4);
  });
});

describe("summarize", () => {
  it("counts a retry against the retry rate but not against validity twice", () => {
    const records = [
      row(), // clean first pass
      row({
        attempts: [attempt({ validationErrors: 2 }), attempt({ attempt: 2 })],
      }),
    ];
    const s = summarize(records, { rates });
    expect(s.requests).toBe(2);
    expect(s.firstPassValidity).toBe(0.5);
    expect(s.retryRate).toBe(0.5);
  });

  it("excludes cancellations from first-pass validity", () => {
    // A cancelled request never got a fair attempt. Counting it as a failure
    // would make the prompt look worse than it is and trip the gate wrongly.
    const records = [
      row(),
      row({ succeeded: false, cancelled: true, attempts: [attempt({ reported: false })] }),
    ];
    const s = summarize(records, { rates });
    expect(s.firstPassValidity).toBe(1);
    expect(s.outcomes.cancelled).toBe(1);
    expect(s.wasted).toBe(1);
  });

  it("keeps unreported rows out of the token means rather than averaging in zeros", () => {
    const records = [
      row(),
      row({ attempts: [attempt({ reported: false, tokens: {} })] }),
    ];
    const s = summarize(records, { rates });
    expect(s.completeRows).toBe(1);
    expect(s.incompleteRows).toBe(1);
    // Mean is over the one row that reported, not diluted by the one that didn't.
    expect(s.meanTokens?.inputTokens).toBe(2000);
  });

  it("reports no cost at all when rates are missing", () => {
    const s = summarize([row()]);
    expect(s.costUsd).toBeNull();
    expect(s.meanCostUsd).toBeNull();
    expect(s.pricedRows).toBe(0);
    // Tokens still count — the absence of pricing must not hide usage.
    expect(s.tokens.inputTokens).toBe(2000);
  });

  it("surfaces the cached and reasoning shares that motivate Phase C", () => {
    const s = summarize(
      [
        row({
          attempts: [
            attempt({
              tokens: {
                inputTokens: 2000,
                cacheReadTokens: 1900,
                outputTokens: 4000,
                reasoningTokens: 3000,
              },
            }),
          ],
        }),
      ],
      { rates }
    );
    expect(s.cacheHitRate).toBeCloseTo(0.95);
    expect(s.reasoningShare).toBeCloseTo(0.75);
  });

  it("handles an empty log without dividing by zero", () => {
    const s = summarize([]);
    expect(s.requests).toBe(0);
    expect(s.firstPassValidity).toBeNull();
    expect(s.retryRate).toBeNull();
    expect(s.meanTokens).toBeNull();
  });
});

describe("groupBy + costPerSession", () => {
  it("separates the two modes, which have different cost shapes", () => {
    const records = [row(), row({ mode: "refinement" }), row({ mode: "refinement" })];
    const groups = groupBy(records, (r) => r.mode);
    expect(groups.get("new")).toHaveLength(1);
    expect(groups.get("refinement")).toHaveLength(2);
  });

  it("weights a session by refinements, which dominate when users iterate", () => {
    const newS = summarize([row()], { rates });
    const refineS = summarize(
      [row({ mode: "refinement", attempts: [attempt({ tokens: { inputTokens: 6500, outputTokens: 4000 } })] })],
      { rates }
    );
    const one = costPerSession({ new: newS, refinement: refineS }, {
      newRequests: 1,
      refinements: 0,
    });
    const four = costPerSession({ new: newS, refinement: refineS }, {
      newRequests: 1,
      refinements: 3,
    });
    expect(four!).toBeGreaterThan(one!);
    // Three refinements of a spec cost more than creating it once — the whole
    // argument for diff-based refinement.
    expect(four! - one!).toBeGreaterThan(one!);
  });

  it("returns null rather than 0 when nothing could be priced", () => {
    const s = summarize([row()]);
    expect(costPerSession({ new: s, refinement: s }, { newRequests: 1, refinements: 3 })).toBeNull();
  });
});
