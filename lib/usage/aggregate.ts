/**
 * Phase A3 — the cost model, as an aggregator over the JSONL that `sink.ts`
 * writes. Pure: the script in `scripts/usage-report.ts` does the I/O.
 *
 * The recurring hazard here is averaging over rows that never reported, which
 * silently drags every mean downward. Incomplete and unpriced rows are counted
 * and excluded rather than treated as zero.
 */

import {
  cacheHitRate,
  reasoningShare,
  sumTokens,
  type Outcome,
  type TokenCounts,
  type UsageRecord,
} from "./record";
import { estimateCostUsd, type Rates } from "./pricing";
import { USAGE_LOG_PREFIX } from "./sink";

const OUTCOMES: Outcome[] = [
  "success",
  "retry-success",
  "invalid",
  "cancelled",
  "api-error",
];

export type ParseResult = {
  records: UsageRecord[];
  /** Lines that were not a usage record; a dev log is full of other noise. */
  skipped: number;
};

/**
 * Reads a JSONL log, tolerating both the bare form and the stdout form where
 * each line is prefixed with the log marker.
 */
export function parseJsonl(text: string): ParseResult {
  const records: UsageRecord[] = [];
  let skipped = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const body = line.startsWith(USAGE_LOG_PREFIX)
      ? line.slice(USAGE_LOG_PREFIX.length).trim()
      : line;

    if (!body.startsWith("{")) {
      skipped++;
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(body);
      if (isUsageRecord(parsed)) records.push(parsed);
      else skipped++;
    } catch {
      skipped++;
    }
  }

  return { records, skipped };
}

function isUsageRecord(v: unknown): v is UsageRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<UsageRecord>;
  return r.kind === "generate" && Array.isArray(r.perAttempt);
}

export type Summary = {
  requests: number;
  outcomes: Record<Outcome, number>;
  /**
   * Share of requests whose FIRST attempt validated. The roadmap gates on this
   * (~70%): below it, strengthen the prompt rather than the architecture.
   * Denominator excludes cancellations and API errors — they never got a fair
   * attempt, and counting them as failures would understate the model.
   */
  firstPassValidity: number | null;
  retryRate: number | null;
  /** Requests that were billed but delivered nothing. */
  wasted: number;
  tokens: TokenCounts;
  meanTokens: TokenCounts | null;
  completeRows: number;
  incompleteRows: number;
  estimatedRows: number;
  cacheHitRate: number | null;
  reasoningShare: number | null;
  costUsd: number | null;
  meanCostUsd: number | null;
  pricedRows: number;
  meanDurationMs: number | null;
};

export type SummarizeOptions = {
  rates?: Record<string, Rates>;
};

/** Requests where the model was actually given a chance to produce a spec. */
function attempted(r: UsageRecord): boolean {
  return r.outcome === "success" || r.outcome === "retry-success" || r.outcome === "invalid";
}

function scaleTokens(t: TokenCounts, divisor: number): TokenCounts {
  const div = (v: number | undefined) => (v == null ? undefined : v / divisor);
  return {
    inputTokens: div(t.inputTokens),
    cacheReadTokens: div(t.cacheReadTokens),
    cacheWriteTokens: div(t.cacheWriteTokens),
    outputTokens: div(t.outputTokens),
    reasoningTokens: div(t.reasoningTokens),
    totalTokens: div(t.totalTokens),
  };
}

export function summarize(
  records: UsageRecord[],
  opts: SummarizeOptions = {}
): Summary {
  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<
    Outcome,
    number
  >;
  for (const r of records) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;

  const fair = records.filter(attempted);
  const firstPassClean = fair.filter(
    (r) => (r.perAttempt[0]?.validationErrors ?? 1) === 0
  );
  const retried = fair.filter((r) => r.attemptsUsed > 1);

  // Only rows that actually reported usage may enter the token arithmetic.
  const complete = records.filter((r) => r.complete);
  const tokens = sumTokens(complete.map((r) => r.tokens));

  const priced: number[] = [];
  if (opts.rates) {
    for (const r of complete) {
      const cost = estimateCostUsd(r.model, r.tokens, opts.rates);
      if (cost != null) priced.push(cost);
    }
  }
  const costUsd = priced.length ? priced.reduce((a, b) => a + b, 0) : null;

  const durations = records.map((r) => r.durationMs).filter((d) => Number.isFinite(d));

  return {
    requests: records.length,
    outcomes,
    firstPassValidity: fair.length ? firstPassClean.length / fair.length : null,
    retryRate: fair.length ? retried.length / fair.length : null,
    wasted: outcomes.invalid + outcomes.cancelled,
    tokens,
    meanTokens: complete.length ? scaleTokens(tokens, complete.length) : null,
    completeRows: complete.length,
    incompleteRows: records.length - complete.length,
    estimatedRows: records.filter((r) => r.estimated).length,
    cacheHitRate: cacheHitRate(tokens),
    reasoningShare: reasoningShare(tokens),
    costUsd,
    meanCostUsd: priced.length ? (costUsd as number) / priced.length : null,
    pricedRows: priced.length,
    meanDurationMs: durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null,
  };
}

export function groupBy<K>(
  records: UsageRecord[],
  key: (r: UsageRecord) => K
): Map<K, UsageRecord[]> {
  const out = new Map<K, UsageRecord[]>();
  for (const r of records) {
    const k = key(r);
    const bucket = out.get(k);
    if (bucket) bucket.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/**
 * Cost of a session under an assumed shape of use. Refinements dominate this
 * whenever users iterate, because each one regenerates the whole spec — which
 * is the finding Phase C acts on.
 */
export function costPerSession(
  byMode: { new: Summary; refinement: Summary },
  assume: { newRequests: number; refinements: number }
): number | null {
  const a = byMode.new.meanCostUsd;
  const b = byMode.refinement.meanCostUsd;
  if (a == null && b == null) return null;
  return (a ?? 0) * assume.newRequests + (b ?? 0) * assume.refinements;
}
