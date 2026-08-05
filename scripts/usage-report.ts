/**
 * Phase A3 — prints the cost model over a usage log.
 *
 *   npm run usage:report -- [path/to/usage.jsonl]
 *
 * Defaults to $USAGE_LOG_PATH, then ./usage.jsonl. Rates come from
 * $USAGE_RATES or `lib/usage/pricing.ts`; with neither, this reports tokens
 * and leaves every money column blank rather than inventing a number.
 */

import { readFile } from "node:fs/promises";
import { parseJsonl, summarize, groupBy, costPerSession } from "@/lib/usage/aggregate";
import { RATES, ratesFromEnv, type Rates } from "@/lib/usage/pricing";
import type { Summary } from "@/lib/usage/aggregate";
import type { UsageRecord } from "@/lib/usage/record";

const path =
  process.argv[2] ?? process.env.USAGE_LOG_PATH ?? "./usage.jsonl";

const rates: Record<string, Rates> = { ...RATES, ...ratesFromEnv(process.env.USAGE_RATES) };
const havePricing = Object.keys(rates).length > 0;

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const n0 = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("en-US");
const usd = (v: number | null | undefined) =>
  v == null ? "—" : `$${v.toFixed(4)}`;

function printSummary(label: string, s: Summary) {
  console.log(`\n── ${label} ─────────────────────────────`);
  console.log(`  requests            ${s.requests}`);
  console.log(
    `  outcomes            ` +
      Object.entries(s.outcomes)
        .filter(([, c]) => c > 0)
        .map(([k, c]) => `${k}:${c}`)
        .join("  ") || "  outcomes            —"
  );
  console.log(`  first-pass validity ${pct(s.firstPassValidity)}`);
  console.log(`  retry rate          ${pct(s.retryRate)}`);
  console.log(`  paid, undelivered   ${s.wasted}`);
  console.log(`  mean duration       ${n0(s.meanDurationMs)}ms`);
  console.log(`  tokens in / out     ${n0(s.tokens.inputTokens)} / ${n0(s.tokens.outputTokens)}`);
  console.log(
    `  mean per request    ${n0(s.meanTokens?.inputTokens)} in, ${n0(s.meanTokens?.outputTokens)} out`
  );
  console.log(`  cached input        ${pct(s.cacheHitRate)}  (${n0(s.tokens.cacheReadTokens)} tokens)`);
  console.log(
    `  reasoning share     ${pct(s.reasoningShare)}  (${n0(s.tokens.reasoningTokens)} tokens, billed as output)`
  );
  if (havePricing) {
    console.log(`  cost                ${usd(s.costUsd)} total, ${usd(s.meanCostUsd)} mean`);
    if (s.pricedRows < s.requests) {
      console.log(`  (priced ${s.pricedRows} of ${s.requests} rows)`);
    }
  }
  if (s.incompleteRows > 0) {
    console.log(
      `  ⚠ ${s.incompleteRows} row(s) reported no usage and are excluded from token/cost means`
    );
  }
  if (s.estimatedRows > 0) {
    console.log(`  ⚠ ${s.estimatedRows} row(s) carry estimated, not measured, counts`);
  }
}

function bySelector(
  records: UsageRecord[],
  title: string,
  key: (r: UsageRecord) => string | undefined
) {
  const groups = groupBy(records, (r) => key(r) ?? "(none)");
  if (groups.size <= 1) return;
  console.log(`\n\n═══ by ${title} ═══`);
  for (const [k, rows] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    printSummary(`${title}: ${k}`, summarize(rows, { rates }));
  }
}

async function main() {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    console.error(`No usage log at ${path}.`);
    console.error(`Run the app with USAGE_LOG_PATH=${path} to produce one.`);
    process.exit(1);
  }

  const { records, skipped } = parseJsonl(text);
  console.log(`Read ${records.length} usage record(s) from ${path}` +
    (skipped ? ` (${skipped} non-record line(s) ignored)` : ""));

  if (records.length === 0) {
    console.error("Nothing to report.");
    process.exit(1);
  }

  if (!havePricing) {
    console.log(
      "\n⚠ No rates configured — token counts only. Set USAGE_RATES or fill in\n" +
        "  lib/usage/pricing.ts from current provider pricing (look it up)."
    );
  }

  printSummary("overall", summarize(records, { rates }));
  bySelector(records, "user", (r) => r.userId);
  bySelector(records, "mode", (r) => r.mode);
  bySelector(records, "case", (r) => r.label);

  // Session cost only means something once both modes have priced rows.
  const byMode = groupBy(records, (r) => r.mode);
  const newSummary = summarize(byMode.get("new") ?? [], { rates });
  const refineSummary = summarize(byMode.get("refinement") ?? [], { rates });
  const assume = { newRequests: 1, refinements: 3 };
  const session = costPerSession(
    { new: newSummary, refinement: refineSummary },
    assume
  );
  if (session != null) {
    console.log(
      `\n\nAssumed session (${assume.newRequests} new + ${assume.refinements} refinements): ${usd(session)}`
    );
    console.log(
      "  Refinements resend and regenerate the whole spec, so this scales with\n" +
        "  part count on every iteration — see Phase C."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
