/**
 * Where usage records go.
 *
 * Kept behind an interface with a single `write` so Phase B swaps stdout for a
 * Neon insert without the route changing. This is the impure edge of
 * `lib/usage/*` — the arithmetic lives in `record.ts` and is what gets tested.
 */

import type { UsageRecord } from "./record";
import { estimateCostUsd, ratesFromEnv, type Rates } from "./pricing";

/**
 * Line marker, so records can be pulled out of noisy `next dev` output:
 *   npm run dev | grep '^workbench.usage ' | sed 's/^workbench.usage //' > usage.jsonl
 */
export const USAGE_LOG_PREFIX = "workbench.usage";

export interface UsageSink {
  write(record: UsageRecord): void | Promise<void>;
}

/** One prefixed JSON line per record. Captured by Vercel's log drain in prod. */
export const stdoutSink: UsageSink = {
  write(record) {
    console.log(`${USAGE_LOG_PREFIX} ${JSON.stringify(record)}`);
  },
};

export const nullSink: UsageSink = { write() {} };

export type UsageDatabaseRow = {
  ts: string;
  userId: string;
  model: string;
  mode: UsageRecord["mode"];
  label: string | null;
  parts: number | null;
  attempts: number;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensCached: number | null;
  durationMs: number;
  outcome: UsageRecord["outcome"];
  costCents: number | null;
  complete: boolean;
  estimated: boolean;
  errorCode: string | null;
  record: UsageRecord;
};

export function usageDatabaseRow(
  record: UsageRecord,
  rates: Record<string, Rates>
): UsageDatabaseRow {
  const costUsd = estimateCostUsd(record.model, record.tokens, rates);
  return {
    ts: record.ts,
    userId: record.userId,
    model: record.model,
    mode: record.mode,
    label: record.label ?? null,
    parts: record.outputParts ?? record.inputParts ?? null,
    attempts: record.attemptsUsed,
    tokensIn: record.tokens.inputTokens ?? null,
    tokensOut: record.tokens.outputTokens ?? null,
    tokensCached: record.tokens.cacheReadTokens ?? null,
    durationMs: record.durationMs,
    outcome: record.outcome,
    costCents: costUsd == null ? null : costUsd * 100,
    complete: record.complete,
    estimated: record.estimated,
    errorCode: record.errorCode ?? null,
    record,
  };
}

export type UsageRowWriter = (row: UsageDatabaseRow) => Promise<void>;
export type UsageRowWriterLoader = (
  connectionString: string
) => Promise<UsageRowWriter>;

export function databaseSink(
  writeRow: UsageRowWriter,
  rates: Record<string, Rates>
): UsageSink {
  return {
    write(record) {
      return writeRow(usageDatabaseRow(record, rates));
    },
  };
}

async function loadNeonWriter(connectionString: string): Promise<UsageRowWriter> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionString);
  return async (row) => {
    await sql`
      INSERT INTO generation_usage (
        ts, user_id, model, mode, label, parts, attempts,
        tokens_in, tokens_out, tokens_cached, duration_ms, outcome,
        cost_cents, complete, estimated, error_code, record
      ) VALUES (
        ${row.ts}, ${row.userId}, ${row.model}, ${row.mode}, ${row.label},
        ${row.parts}, ${row.attempts}, ${row.tokensIn}, ${row.tokensOut},
        ${row.tokensCached}, ${row.durationMs}, ${row.outcome}, ${row.costCents},
        ${row.complete}, ${row.estimated}, ${row.errorCode},
        ${JSON.stringify(row.record)}::jsonb
      )
    `;
  };
}

/** The driver and connection are initialized only on the first usage write. */
export function neonUsageSink(
  connectionString: string,
  rates: Record<string, Rates>,
  loadWriter: UsageRowWriterLoader = loadNeonWriter
): UsageSink {
  let writer: Promise<UsageRowWriter> | undefined;
  return {
    async write(record) {
      writer ??= loadWriter(connectionString);
      await databaseSink(await writer, rates).write(record);
    },
  };
}

type DatabaseSinkFactory = (
  connectionString: string,
  rates: Record<string, Rates>
) => UsageSink;

type UsageSinkEnv = {
  [key: string]: string | undefined;
  USAGE_LOG?: string;
  USAGE_LOG_PATH?: string;
  USAGE_RATES?: string;
  DATABASE_URL?: string;
};

function combinedSink(sinks: UsageSink[]): UsageSink {
  return {
    async write(record) {
      await Promise.all(sinks.map((sink) => sink.write(record)));
    },
  };
}

/**
 * Appends to a real JSONL file. `node:fs` is imported dynamically so nothing
 * that reaches a browser bundle pulls it in at module load.
 */
export function fileSink(path: string): UsageSink {
  return {
    async write(record) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(path, JSON.stringify(record) + "\n", "utf8");
    },
  };
}

/**
 * Env-driven default:
 *   USAGE_LOG_PATH  — also append to this JSONL file (the golden suite uses it)
 *   DATABASE_URL    — also insert into Neon Postgres
 *   USAGE_LOG=0     — disable entirely
 */
export function createUsageSink(
  env: UsageSinkEnv = process.env,
  databaseFactory: DatabaseSinkFactory = neonUsageSink
): UsageSink {
  if (env.USAGE_LOG === "0") return nullSink;

  const sinks: UsageSink[] = [stdoutSink];
  const path = env.USAGE_LOG_PATH;
  if (path) sinks.push(fileSink(path));

  const connectionString = env.DATABASE_URL;
  if (connectionString) {
    sinks.push(databaseFactory(connectionString, ratesFromEnv(env.USAGE_RATES)));
  }

  return sinks.length === 1 ? stdoutSink : combinedSink(sinks);
}

/**
 * Records must never take a request down with them — instrumentation that can
 * break generation is worse than no instrumentation.
 */
export async function safeWrite(sink: UsageSink, record: UsageRecord): Promise<void> {
  try {
    await sink.write(record);
  } catch (e) {
    console.error("usage sink failed", e);
  }
}
