import { describe, expect, it } from "vitest";
import { bookshelfSpec } from "@/lib/spec/examples";
import {
  deleteGenerationArtifact,
  deleteExpiredGenerationArtifacts,
  queryGenerationArtifact,
  type ArtifactQuery,
} from "@/lib/artifacts/dashboard-db";

function queryReturning(rows: unknown[]) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const query = (async <T>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    calls.push({ sql: strings.join("?"), values });
    return rows as T[];
  }) as ArtifactQuery;
  return { query, calls };
}

describe("owner artifact queries", () => {
  it("loads one unexpired artifact on demand", async () => {
    const { query, calls } = queryReturning([
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        participant_id: "p_7f5c2a91",
        parent_artifact_id: null,
        prompt: "a bookshelf",
        input_spec: null,
        output_spec: bookshelfSpec,
        warnings: [],
        attempts: [],
        outcome: "success",
        created_at: "2026-08-07T12:00:00.000Z",
        expires_at: "2026-11-05T12:00:00.000Z",
      },
    ]);

    const artifact = await queryGenerationArtifact(
      query,
      "550e8400-e29b-41d4-a716-446655440000"
    );

    expect(artifact).toMatchObject({
      id: "550e8400-e29b-41d4-a716-446655440000",
      participantId: "p_7f5c2a91",
      prompt: "a bookshelf",
      outputSpec: bookshelfSpec,
      outcome: "success",
    });
    expect(calls[0].sql).toContain("expires_at > now()");
    expect(calls[0].values).toEqual([
      "550e8400-e29b-41d4-a716-446655440000",
    ]);
  });

  it("deletes only the selected artifact", async () => {
    const { query, calls } = queryReturning([{ id: "artifact-id" }]);

    await expect(
      deleteGenerationArtifact(query, "artifact-id")
    ).resolves.toBe(true);
    expect(calls[0].sql).toContain("DELETE FROM generation_artifacts");
    expect(calls[0].sql).toContain("RETURNING id");
    expect(calls[0].values).toEqual(["artifact-id"]);
  });

  it("deletes every artifact whose retention window has expired", async () => {
    const { query, calls } = queryReturning([{ id: "one" }, { id: "two" }]);

    await expect(deleteExpiredGenerationArtifacts(query)).resolves.toBe(2);
    expect(calls[0].sql).toContain("expires_at <= now()");
    expect(calls[0].sql).toContain("RETURNING id");
    expect(calls[0].values).toEqual([]);
  });
});
