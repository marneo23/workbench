/**
 * Where usage records go.
 *
 * Kept behind an interface with a single `write` so Phase B swaps stdout for a
 * Neon insert without the route changing. This is the impure edge of
 * `lib/usage/*` — the arithmetic lives in `record.ts` and is what gets tested.
 */

import type { UsageRecord } from "./record";

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
 *   USAGE_LOG=0     — disable entirely
 */
export function createUsageSink(env: NodeJS.ProcessEnv = process.env): UsageSink {
  if (env.USAGE_LOG === "0") return nullSink;

  const path = env.USAGE_LOG_PATH;
  if (!path) return stdoutSink;

  const file = fileSink(path);
  return {
    async write(record) {
      stdoutSink.write(record);
      await file.write(record);
    },
  };
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
