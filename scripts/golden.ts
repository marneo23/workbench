/**
 * Phase A2 — the golden-prompt suite.
 *
 *   npm run golden -- --yes [--runs=3] [--cases=bookshelf,desk] [--pdf] [--out=DIR]
 *
 * SPENDS REAL MONEY. Every run is a live generation, which is why `--yes` is
 * required and why this is not in CI.
 *
 * Requires the app running (`npm run dev`). Start it with USAGE_LOG_PATH set
 * and the same session's cost lands in the log:
 *
 *   USAGE_LOG_PATH=./usage.jsonl npm run dev
 *   npm run golden -- --yes --runs=3
 *   npm run usage:report
 *
 * Validity and cost are the same exercise — this measures the first, the log
 * captures the second, and `label` on each request joins them.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GOLDEN_CASES,
  goldenRunKey,
  orderGoldenCases,
  parentSpecFor,
  scoreRuns,
  type CaseRun,
} from "@/lib/golden/cases";
import {
  artifactFileName,
  buildGoldenArtifact,
  serializeGoldenArtifact,
} from "@/lib/golden/artifacts";
import { FurnitureSpecSchema, type FurnitureSpec } from "@/lib/spec/schema";
import { generateFurniturePdf } from "@/lib/pdf/generate";

/** The roadmap's gate: below this, fix the prompt before the architecture. */
const VALIDITY_GATE = 0.7;

type Args = {
  yes: boolean;
  runs: number;
  cases?: string[];
  base: string;
  pdf: boolean;
  outDir: string;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return {
    yes: argv.includes("--yes"),
    runs: Number(get("runs") ?? 1),
    cases: get("cases")?.split(",").map((s) => s.trim()).filter(Boolean),
    base: get("base") ?? "http://localhost:3000",
    pdf: argv.includes("--pdf"),
    outDir: get("out") ?? "./golden-out",
  };
}

const args = parseArgs(process.argv.slice(2));
// Refinement selections automatically bring along their complete parent chain.
const ordered = orderGoldenCases(GOLDEN_CASES, args.cases);

async function generate(
  prompt: string,
  label: string,
  currentSpec?: FurnitureSpec
): Promise<{ spec?: FurnitureSpec; error?: string; durationMs: number }> {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${args.base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Blocking mode: one JSON response instead of the NDJSON protocol. The
      // usage record is written either way.
      body: JSON.stringify({ prompt, label, stream: false, ...(currentSpec ? { currentSpec } : {}) }),
    });
    const durationMs = Date.now() - startedAt;
    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const err = (data as { error?: string; details?: string[] } | null);
      return {
        error: `${res.status} ${err?.error ?? "unknown"}${
          err?.details?.length ? ` — ${err.details.join("; ")}` : ""
        }`,
        durationMs,
      };
    }

    const parsed = FurnitureSpecSchema.safeParse((data as { spec?: unknown })?.spec);
    if (!parsed.success) {
      return { error: "response was not a valid spec", durationMs };
    }
    return { spec: parsed.data, durationMs };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function main() {
  const totalCalls = ordered.length * args.runs;

  if (!args.yes) {
    console.error(
      `This makes ${totalCalls} live generation call(s) and costs real money.\n` +
        `Re-run with --yes to confirm.\n\n` +
        `  npm run golden -- --yes --runs=${args.runs}`
    );
    process.exit(1);
  }

  console.log(
    `Golden suite: ${ordered.length} case(s) × ${args.runs} run(s) = ${totalCalls} calls against ${args.base}\n`
  );

  // JSON evidence is always preserved; --pdf only adds visual spot-checks.
  await mkdir(args.outDir, { recursive: true });

  const results: CaseRun[] = [];
  /** Specs are paired by case and repetition so refinement chains stay independent. */
  const specs = new Map<string, FurnitureSpec>();

  for (const testCase of ordered) {
    for (let run = 1; run <= args.runs; run++) {
      const tag = `${testCase.id} #${run}`;
      const previous = parentSpecFor(testCase, run, specs);

      if (testCase.refines && !previous) {
        console.log(`  ${tag}: SKIP — parent case "${testCase.refines}" never produced a spec`);
        const result: CaseRun = {
          caseId: testCase.id,
          run,
          ok: false,
          checks: [],
          error: `no parent spec from "${testCase.refines}"`,
          durationMs: 0,
        };
        results.push(result);
        await writeFile(
          path.join(args.outDir, artifactFileName(testCase.id, run)),
          serializeGoldenArtifact(
            buildGoldenArtifact({
              ...result,
              prompt: testCase.prompt,
              ...(testCase.refines ? { refines: testCase.refines } : {}),
            })
          )
        );
        continue;
      }

      process.stdout.write(`  ${tag}: `);
      const { spec, error, durationMs } = await generate(
        testCase.prompt,
        testCase.id,
        previous
      );

      if (!spec) {
        console.log(`FAIL — ${error}`);
        const result: CaseRun = {
          caseId: testCase.id,
          run,
          ok: false,
          checks: [],
          error,
          durationMs,
        };
        results.push(result);
        await writeFile(
          path.join(args.outDir, artifactFileName(testCase.id, run)),
          serializeGoldenArtifact(
            buildGoldenArtifact({
              ...result,
              prompt: testCase.prompt,
              ...(testCase.refines ? { refines: testCase.refines } : {}),
            })
          )
        );
        continue;
      }

      const checks = testCase.check(spec, previous);
      const ok = checks.every((c) => c.pass);
      specs.set(goldenRunKey(testCase.id, run), spec);

      console.log(
        `${ok ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length}, ${
          spec.parts.length
        } parts, ${(durationMs / 1000).toFixed(1)}s)`
      );
      for (const c of checks) {
        if (!c.pass) console.log(`      ✗ ${c.name} — ${c.detail}`);
      }

      await writeFile(
        path.join(args.outDir, artifactFileName(testCase.id, run)),
        serializeGoldenArtifact(
          buildGoldenArtifact({
            caseId: testCase.id,
            run,
            prompt: testCase.prompt,
            ...(testCase.refines ? { refines: testCase.refines } : {}),
            durationMs,
            ok,
            checks,
            spec,
          })
        )
      );

      if (args.pdf) {
        const bytes = await generateFurniturePdf(spec);
        const file = path.join(args.outDir, `${testCase.id}-${run}.pdf`);
        await writeFile(file, bytes);
        console.log(`      → ${file}`);
      }

      results.push({
        caseId: testCase.id,
        run,
        ok,
        checks,
        durationMs,
        parts: spec.parts.length,
      });
    }
  }

  // --- score ---------------------------------------------------------------

  console.log("\n═══ results ═══\n");
  for (const testCase of ordered) {
    const runs = results.filter((r) => r.caseId === testCase.id);
    const { passed, total, rate } = scoreRuns(runs);
    console.log(
      `  ${testCase.id.padEnd(22)} ${passed}/${total}  ${
        rate == null ? "—" : `${(rate * 100).toFixed(0)}%`
      }`
    );
  }

  const overall = scoreRuns(results);
  console.log(
    `\n  overall${" ".repeat(16)} ${overall.passed}/${overall.total}  ${
      overall.rate == null ? "—" : `${(overall.rate * 100).toFixed(0)}%`
    }`
  );

  if (overall.failedChecks.size > 0) {
    console.log("\n  most-failed checks:");
    for (const [name, count] of [...overall.failedChecks].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(3)}×  ${name}`);
    }
  }

  // This is pass-rate over all checks, not the first-pass validity the gate is
  // written against — that comes from the usage log, which knows how many
  // attempts each request actually used.
  console.log(
    `\n  Gate is first-pass validity < ${(VALIDITY_GATE * 100).toFixed(0)}% → strengthen the worked` +
      `\n  example in the system prompt. Read it from: npm run usage:report`
  );

  process.exit(overall.rate != null && overall.rate < VALIDITY_GATE ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
