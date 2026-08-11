import type { GenerationArtifact } from "./record";

export interface ArtifactSink {
  write(artifact: GenerationArtifact): void | Promise<void>;
}

export type ArtifactWriter = (
  artifact: GenerationArtifact
) => Promise<void>;
export type ArtifactWriterLoader = (
  connectionString: string
) => Promise<ArtifactWriter>;

async function loadNeonArtifactWriter(
  connectionString: string
): Promise<ArtifactWriter> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionString);
  return async (artifact) => {
    await sql`DELETE FROM generation_artifacts WHERE expires_at <= now()`;
    await sql`
      INSERT INTO generation_artifacts (
        id, participant_id, requested_parent_artifact_id, parent_artifact_id,
        prompt, input_spec, output_spec, warnings, attempts, outcome,
        created_at, expires_at
      ) VALUES (
        ${artifact.generationId},
        ${artifact.participantId},
        ${artifact.parentGenerationId ?? null},
        CASE
          WHEN ${artifact.parentGenerationId ?? null}::text IS NULL THEN NULL
          WHEN EXISTS (
            SELECT 1
            FROM generation_artifacts parent
            WHERE parent.id = ${artifact.parentGenerationId ?? null}
              AND parent.participant_id = ${artifact.participantId}
          ) THEN ${artifact.parentGenerationId ?? null}
          ELSE NULL
        END,
        ${artifact.prompt},
        ${artifact.inputSpec ? JSON.stringify(artifact.inputSpec) : null}::jsonb,
        ${artifact.outputSpec ? JSON.stringify(artifact.outputSpec) : null}::jsonb,
        ${JSON.stringify(artifact.warnings)}::jsonb,
        ${JSON.stringify(artifact.attempts)}::jsonb,
        ${artifact.outcome},
        ${artifact.createdAt},
        ${artifact.expiresAt}
      )
    `;
    // A refinement can finish before the parent stream's finally block writes
    // its artifact. Resolve either insertion order without allowing lineage to
    // cross participant boundaries.
    await sql`
      UPDATE generation_artifacts child
      SET parent_artifact_id = child.requested_parent_artifact_id
      WHERE child.parent_artifact_id IS NULL
        AND child.requested_parent_artifact_id = ${artifact.generationId}
        AND child.participant_id = ${artifact.participantId}
    `;
  };
}

export function neonArtifactSink(
  connectionString: string,
  loadWriter: ArtifactWriterLoader = loadNeonArtifactWriter
): ArtifactSink {
  let writer: Promise<ArtifactWriter> | undefined;
  return {
    async write(artifact) {
      writer ??= loadWriter(connectionString);
      await (await writer)(artifact);
    },
  };
}

type ArtifactSinkFactory = (
  connectionString: string
) => ArtifactSink;

type ArtifactSinkEnv = {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
};

export function createArtifactSink(
  env: ArtifactSinkEnv = process.env,
  factory: ArtifactSinkFactory = neonArtifactSink
): ArtifactSink | null {
  return env.DATABASE_URL ? factory(env.DATABASE_URL) : null;
}

export async function safeWriteArtifact(
  sink: ArtifactSink | null,
  artifact: GenerationArtifact
): Promise<boolean> {
  if (!sink) return false;
  try {
    await sink.write(artifact);
    return true;
  } catch (error) {
    console.error(
      "artifact sink failed",
      error instanceof Error ? error.name : "unknown"
    );
    return false;
  }
}
