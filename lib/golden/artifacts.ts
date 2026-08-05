import type { Check } from "./cases";
import type { FurnitureSpec } from "@/lib/spec/schema";

export type GoldenArtifact = {
  caseId: string;
  run: number;
  prompt: string;
  refines?: string;
  durationMs: number;
  ok: boolean;
  checks: Check[];
  error?: string;
  parts?: number;
  spec?: FurnitureSpec;
};

export type BuildGoldenArtifactInput = Omit<GoldenArtifact, "parts">;

export function artifactFileName(caseId: string, run: number): string {
  return `${caseId}-${run}.json`;
}

export function buildGoldenArtifact(
  input: BuildGoldenArtifactInput
): GoldenArtifact {
  return {
    caseId: input.caseId,
    run: input.run,
    prompt: input.prompt,
    ...(input.refines ? { refines: input.refines } : {}),
    durationMs: input.durationMs,
    ok: input.ok,
    checks: input.checks,
    ...(input.error ? { error: input.error } : {}),
    ...(input.spec
      ? { parts: input.spec.parts.length, spec: input.spec }
      : {}),
  };
}

export function serializeGoldenArtifact(artifact: GoldenArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
