import { describe, expect, it, vi } from "vitest";
import { bookshelfSpec } from "@/lib/spec/examples";
import { buildGenerationArtifact } from "@/lib/artifacts/record";
import {
  createArtifactSink,
  neonArtifactSink,
  safeWriteArtifact,
  type ArtifactWriter,
} from "@/lib/artifacts/sink";

describe("buildGenerationArtifact", () => {
  it("retains an anonymous generation artifact for 90 days", () => {
    const artifact = buildGenerationArtifact({
      generationId: "550e8400-e29b-41d4-a716-446655440000",
      participantId: "p_7f5c2a91",
      parentGenerationId: "550e8400-e29b-41d4-a716-446655440001",
      prompt: "make the bookshelf wider",
      inputSpec: bookshelfSpec,
      outputSpec: { ...bookshelfSpec, name: "Wide bookshelf" },
      warnings: [{ code: "example", message: "Example warning" }],
      attempts: [
        {
          attempt: 1,
          responseSpec: { ...bookshelfSpec, name: "Wide bookshelf" },
          validationErrors: [],
        },
      ],
      outcome: "success",
      now: () => new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(artifact).toMatchObject({
      generationId: "550e8400-e29b-41d4-a716-446655440000",
      participantId: "p_7f5c2a91",
      parentGenerationId: "550e8400-e29b-41d4-a716-446655440001",
      prompt: "make the bookshelf wider",
      outcome: "success",
      createdAt: "2026-08-07T12:00:00.000Z",
      expiresAt: "2026-11-05T12:00:00.000Z",
    });
    expect(artifact.inputSpec).toEqual(bookshelfSpec);
    expect(artifact.outputSpec?.name).toBe("Wide bookshelf");
    expect(artifact.warnings).toEqual([
      { code: "example", message: "Example warning" },
    ]);
    expect(artifact.attempts).toHaveLength(1);
  });
});

describe("artifact persistence", () => {
  it("loads Neon lazily and writes one separate artifact row", async () => {
    const artifact = buildGenerationArtifact({
      generationId: "550e8400-e29b-41d4-a716-446655440000",
      participantId: "p_7f5c2a91",
      prompt: "a bookshelf",
      outputSpec: bookshelfSpec,
      warnings: [],
      attempts: [],
      outcome: "success",
    });
    const writer = vi.fn<ArtifactWriter>().mockResolvedValue(undefined);
    const loadWriter = vi.fn(async () => writer);
    const sink = neonArtifactSink(
      "postgresql://example.invalid/db",
      loadWriter
    );

    expect(loadWriter).not.toHaveBeenCalled();
    await sink.write(artifact);
    await sink.write(artifact);

    expect(loadWriter).toHaveBeenCalledOnce();
    expect(writer).toHaveBeenCalledTimes(2);
    expect(writer).toHaveBeenLastCalledWith(artifact);

    const factory = vi.fn(() => sink);
    expect(createArtifactSink({}, factory)).toBeNull();
    expect(
      createArtifactSink(
        { DATABASE_URL: "postgresql://example.invalid/db" },
        factory
      )
    ).toBe(sink);
  });

  it("reports persistence failure without logging sensitive error details", async () => {
    const artifact = buildGenerationArtifact({
      generationId: "550e8400-e29b-41d4-a716-446655440000",
      participantId: "p_7f5c2a91",
      prompt: "private prompt",
      warnings: [],
      attempts: [],
      outcome: "success",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      safeWriteArtifact(
        {
          write() {
            throw new Error("database rejected private prompt");
          },
        },
        artifact
      )
    ).resolves.toBe(false);

    expect(log).toHaveBeenCalledWith("artifact sink failed", "Error");
    expect(log.mock.calls.flat().join(" ")).not.toContain("private prompt");
    log.mockRestore();
  });
});
