import type { FurnitureSpec } from "@/lib/spec/schema";
import type { ValidationIssue } from "@/lib/spec/validate";
import type { Outcome } from "@/lib/usage/record";

export const ARTIFACT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ArtifactAttempt = {
  attempt: number;
  responseSpec?: FurnitureSpec;
  rawResponse?: string;
  validationErrors: ValidationIssue[];
};

export type GenerationArtifact = {
  generationId: string;
  participantId: string;
  parentGenerationId?: string;
  prompt: string;
  inputSpec?: FurnitureSpec;
  outputSpec?: FurnitureSpec;
  warnings: ValidationIssue[];
  attempts: ArtifactAttempt[];
  outcome: Outcome;
  createdAt: string;
  expiresAt: string;
};

export type BuildGenerationArtifactInput = Omit<
  GenerationArtifact,
  "createdAt" | "expiresAt"
> & {
  now?: () => Date;
};

export function buildGenerationArtifact(
  input: BuildGenerationArtifactInput
): GenerationArtifact {
  const created = input.now?.() ?? new Date();
  return {
    generationId: input.generationId,
    participantId: input.participantId,
    parentGenerationId: input.parentGenerationId,
    prompt: input.prompt,
    inputSpec: input.inputSpec,
    outputSpec: input.outputSpec,
    warnings: input.warnings,
    attempts: input.attempts,
    outcome: input.outcome,
    createdAt: created.toISOString(),
    expiresAt: new Date(
      created.getTime() + ARTIFACT_RETENTION_DAYS * DAY_MS
    ).toISOString(),
  };
}
