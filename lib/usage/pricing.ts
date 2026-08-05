/**
 * Cost model over recorded usage.
 *
 * The rate table is deliberately EMPTY. Rates must come from current provider
 * pricing at the time you fill them in — a plausible-looking wrong number is
 * worse than no number, because it silently poisons every aggregate built on
 * it. Until rates are supplied, `estimateCostUsd` returns null and the
 * aggregator reports token counts only.
 */

import type { TokenCounts } from "./record";

/** USD per 1,000,000 tokens. */
export type Rates = {
  input: number;
  /** Cache reads are billed at a discount; this is the discounted rate. */
  cachedInput: number;
  output: number;
};

/**
 * Fill in per model id, e.g. `"gpt-5.1": { input: ..., cachedInput: ..., output: ... }`.
 * Look the numbers up; do not recall them.
 */
export const RATES: Record<string, Rates> = {};

/**
 * Rates can also be supplied without editing code, which is what the golden
 * suite harness uses:
 *
 *   USAGE_RATES='{"gpt-5.1":{"input":1.25,"cachedInput":0.125,"output":10}}'
 *
 * (numbers above are a syntax illustration, not real pricing.)
 */
export function ratesFromEnv(raw: string | undefined): Record<string, Rates> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, Rates> = {};
    for (const [model, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const r = v as Record<string, unknown>;
      const nums = [r.input, r.cachedInput, r.output];
      if (nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
        out[model] = {
          input: r.input as number,
          cachedInput: r.cachedInput as number,
          output: r.output as number,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveRates(
  model: string,
  table: Record<string, Rates> = RATES
): Rates | null {
  return table[model] ?? null;
}

/**
 * Cost in USD, or null when rates are unknown or the counts are too incomplete
 * to price honestly.
 *
 * Two arithmetic traps this avoids:
 *  - cache reads are part of `inputTokens`, so the full-rate portion is
 *    `inputTokens - cacheReadTokens`, not `inputTokens`;
 *  - reasoning tokens are already part of `outputTokens`, so adding them again
 *    would double-charge the most expensive component.
 */
export function estimateCostUsd(
  model: string,
  tokens: TokenCounts,
  table: Record<string, Rates> = RATES
): number | null {
  const rates = resolveRates(model, table);
  if (!rates) return null;
  if (tokens.inputTokens == null || tokens.outputTokens == null) return null;

  const cached = tokens.cacheReadTokens ?? 0;
  const fullRateInput = Math.max(0, tokens.inputTokens - cached);

  const usd =
    (fullRateInput * rates.input +
      cached * rates.cachedInput +
      tokens.outputTokens * rates.output) /
    1_000_000;

  return usd;
}
