/**
 * Usage instrumentation — the record shape and the pure arithmetic over it.
 *
 * No `ai` / `three` / store imports on purpose. The load-bearing logic here is
 * summing token counts across retry attempts, and that has a right answer, so
 * per AGENTS.md it lives in `lib/` where vitest can reach it. The route keeps
 * only the wiring.
 */

/**
 * Token counts for a single model call.
 *
 * `undefined` means "the provider did not report this"; `0` means "reported,
 * and it was zero". OpenAI marks the cache and reasoning details as optional
 * and omits them in some responses, so collapsing the two would make a provider
 * that stopped reporting cache hits look identical to caching being broken —
 * which is the one question this instrumentation exists to answer.
 */
export type TokenCounts = {
  inputTokens?: number;
  /** Input tokens served from the provider's prompt cache, at a discount. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Total output, which already includes `reasoningTokens`. */
  outputTokens?: number;
  /** Billed as output but never present in the delivered spec. */
  reasoningTokens?: number;
  totalTokens?: number;
};

/**
 * Structural mirror of the AI SDK's `LanguageModelUsage`, restated here so this
 * module stays free of `ai` imports. Kept loose (all optional) because every
 * field on the real type is nullable.
 */
export type ProviderUsage = {
  inputTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokens?: number;
  outputTokenDetails?: {
    textTokens?: number;
    reasoningTokens?: number;
  };
  totalTokens?: number;
};

/** Flattens the SDK's nested usage into the shape we store. */
export function fromProviderUsage(usage: ProviderUsage | undefined): TokenCounts {
  if (!usage) return {};
  return {
    inputTokens: usage.inputTokens,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens,
    totalTokens: usage.totalTokens,
  };
}

/**
 * Adds two counts, preserving "not reported".
 *
 * Mirrors the SDK's own internal `addTokenCounts`: undefined only survives when
 * neither side reported, so a single silent attempt degrades one field rather
 * than erasing the whole sum.
 */
function addCount(a: number | undefined, b: number | undefined): number | undefined {
  return a == null && b == null ? undefined : (a ?? 0) + (b ?? 0);
}

export function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    inputTokens: addCount(a.inputTokens, b.inputTokens),
    cacheReadTokens: addCount(a.cacheReadTokens, b.cacheReadTokens),
    cacheWriteTokens: addCount(a.cacheWriteTokens, b.cacheWriteTokens),
    outputTokens: addCount(a.outputTokens, b.outputTokens),
    reasoningTokens: addCount(a.reasoningTokens, b.reasoningTokens),
    totalTokens: addCount(a.totalTokens, b.totalTokens),
  };
}

export function sumTokens(list: TokenCounts[]): TokenCounts {
  return list.reduce<TokenCounts>((acc, t) => addTokens(acc, t), {});
}

/** One model call. A request has one of these per attempt, not one in total. */
export type Attempt = {
  /** 1-based. */
  attempt: number;
  tokens: TokenCounts;
  /** False when the provider reported no usage at all for this call. */
  reported: boolean;
  /** Validation errors that sent this attempt to a retry; 0 means it passed. */
  validationErrors: number;
  /** True when the counts are inferred locally rather than reported. */
  estimated: boolean;
};

export type Outcome =
  /** Valid spec on the first attempt. */
  | "success"
  /** Valid spec, but only after the retry — paid twice, delivered once. */
  | "retry-success"
  /** Exhausted every attempt without a valid spec (the 422). Paid, delivered nothing. */
  | "invalid"
  /** User aborted mid-stream. Paid for whatever had been generated. */
  | "cancelled"
  /** Provider or transport failure. */
  | "api-error";

export function classifyOutcome(input: {
  attempts: Attempt[];
  succeeded: boolean;
  cancelled?: boolean;
  apiError?: boolean;
}): Outcome {
  if (input.cancelled) return "cancelled";
  if (input.apiError) return "api-error";
  if (!input.succeeded) return "invalid";
  return input.attempts.length > 1 ? "retry-success" : "success";
}

export type UsageRecord = {
  /** Discriminator, so a log can carry more than one record type later. */
  kind: "generate";
  ts: string;
  /** Stable attribution from the server-side access-key mapping; never the key. */
  userId: string;
  model: string;
  /**
   * A refinement resends the whole spec and regenerates the whole spec
   * (`lib/llm/prompts.ts` — "Return the COMPLETE updated spec, not a diff"), so
   * it is not a cheaper follow-up and has to be measured separately.
   */
  mode: "new" | "refinement";
  /** Caller-supplied tag; the golden suite sets it to the case id. */
  label?: string;
  streaming: boolean;
  outcome: Outcome;
  attemptsUsed: number;
  /** Summed across every attempt. */
  tokens: TokenCounts;
  perAttempt: Attempt[];
  /**
   * False when any attempt failed to report usage. Aggregates that average
   * cost must exclude incomplete rows rather than treating gaps as zero.
   */
  complete: boolean;
  /** True when any attempt's counts were inferred rather than reported. */
  estimated: boolean;
  durationMs: number;
  /** Raw sizes, so a cost model can estimate tokens for rows that lack them. */
  promptChars: number;
  inputSpecChars?: number;
  emittedChars?: number;
  /** Parts in the spec sent up (refinements only) — an input-cost driver. */
  inputParts?: number;
  /** Parts delivered, or assembled so far when cancelled. */
  outputParts?: number;
  errorCode?: string;
};

export type BuildRecordInput = {
  userId: string;
  model: string;
  mode: "new" | "refinement";
  label?: string;
  streaming: boolean;
  attempts: Attempt[];
  succeeded: boolean;
  cancelled?: boolean;
  apiError?: boolean;
  durationMs: number;
  promptChars: number;
  inputSpecChars?: number;
  emittedChars?: number;
  inputParts?: number;
  outputParts?: number;
  errorCode?: string;
  /** Injectable for tests. */
  now?: () => Date;
};

export function buildUsageRecord(input: BuildRecordInput): UsageRecord {
  const attempts = input.attempts;
  return {
    kind: "generate",
    ts: (input.now?.() ?? new Date()).toISOString(),
    userId: input.userId,
    model: input.model,
    mode: input.mode,
    label: input.label,
    streaming: input.streaming,
    outcome: classifyOutcome(input),
    attemptsUsed: attempts.length,
    tokens: sumTokens(attempts.map((a) => a.tokens)),
    perAttempt: attempts,
    complete: attempts.length > 0 && attempts.every((a) => a.reported),
    estimated: attempts.some((a) => a.estimated),
    durationMs: input.durationMs,
    promptChars: input.promptChars,
    inputSpecChars: input.inputSpecChars,
    emittedChars: input.emittedChars,
    inputParts: input.inputParts,
    outputParts: input.outputParts,
    errorCode: input.errorCode,
  };
}

/**
 * Share of input tokens served from cache, or null when unmeasurable.
 *
 * The system prompt is frozen and sent first specifically so it caches
 * (`lib/llm/prompts.ts`). Nothing has ever checked whether that works — this is
 * the number that checks it.
 */
export function cacheHitRate(tokens: TokenCounts): number | null {
  const input = tokens.inputTokens;
  const cached = tokens.cacheReadTokens;
  if (input == null || cached == null || input === 0) return null;
  return cached / input;
}

/** Share of output tokens spent on reasoning nobody sees, or null. */
export function reasoningShare(tokens: TokenCounts): number | null {
  const output = tokens.outputTokens;
  const reasoning = tokens.reasoningTokens;
  if (output == null || reasoning == null || output === 0) return null;
  return reasoning / output;
}
