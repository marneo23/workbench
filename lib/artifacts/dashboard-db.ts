import type { FurnitureSpec } from "@/lib/spec/schema";
import type { ValidationIssue } from "@/lib/spec/validate";
import type { Outcome } from "@/lib/usage/record";
import type { ArtifactAttempt } from "./record";

export interface ArtifactQuery {
  <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
}

type ArtifactDetailRow = {
  id: string;
  participant_id: string;
  parent_artifact_id: string | null;
  prompt: string;
  input_spec: FurnitureSpec | null;
  output_spec: FurnitureSpec | null;
  warnings: ValidationIssue[];
  attempts: ArtifactAttempt[];
  outcome: Outcome;
  created_at: string | Date;
  expires_at: string | Date;
};

export type GenerationArtifactDetail = {
  id: string;
  participantId: string;
  parentArtifactId: string | null;
  prompt: string;
  inputSpec: FurnitureSpec | null;
  outputSpec: FurnitureSpec | null;
  warnings: ValidationIssue[];
  attempts: ArtifactAttempt[];
  outcome: Outcome;
  createdAt: string;
  expiresAt: string;
};

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export async function queryGenerationArtifact(
  sql: ArtifactQuery,
  id: string
): Promise<GenerationArtifactDetail | null> {
  const rows = await sql<ArtifactDetailRow>`
    SELECT
      id, participant_id, parent_artifact_id, prompt, input_spec,
      output_spec, warnings, attempts, outcome, created_at, expires_at
    FROM generation_artifacts
    WHERE id = ${id} AND expires_at > now()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    participantId: row.participant_id,
    parentArtifactId: row.parent_artifact_id,
    prompt: row.prompt,
    inputSpec: row.input_spec,
    outputSpec: row.output_spec,
    warnings: row.warnings,
    attempts: row.attempts,
    outcome: row.outcome,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
  };
}

export async function deleteGenerationArtifact(
  sql: ArtifactQuery,
  id: string
): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    DELETE FROM generation_artifacts
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteExpiredGenerationArtifacts(
  sql: ArtifactQuery
): Promise<number> {
  const rows = await sql<{ id: string }>`
    DELETE FROM generation_artifacts
    WHERE expires_at <= now()
    RETURNING id
  `;
  return rows.length;
}

async function queryFor(connectionString: string): Promise<ArtifactQuery> {
  const { neon } = await import("@neondatabase/serverless");
  return neon(connectionString) as unknown as ArtifactQuery;
}

export async function loadGenerationArtifact(
  connectionString: string,
  id: string
): Promise<GenerationArtifactDetail | null> {
  return queryGenerationArtifact(await queryFor(connectionString), id);
}

export async function removeGenerationArtifact(
  connectionString: string,
  id: string
): Promise<boolean> {
  return deleteGenerationArtifact(await queryFor(connectionString), id);
}

export async function purgeExpiredGenerationArtifacts(
  connectionString: string
): Promise<number> {
  return deleteExpiredGenerationArtifacts(await queryFor(connectionString));
}
