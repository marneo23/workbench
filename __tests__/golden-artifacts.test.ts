import { describe, expect, it } from "vitest";
import {
  artifactFileName,
  buildGoldenArtifact,
  serializeGoldenArtifact,
} from "@/lib/golden/artifacts";
import { bookshelfSpec } from "@/lib/spec/examples";

const checks = [{ name: "valid", pass: true, detail: "clean" }];

describe("golden artifacts", () => {
  it("uses a stable per-case, per-run JSON filename", () => {
    expect(artifactFileName("bookshelf-wider", 3)).toBe("bookshelf-wider-3.json");
  });

  it("preserves the generated spec and the evidence used to score it", () => {
    const artifact = buildGoldenArtifact({
      caseId: "bookshelf",
      run: 1,
      prompt: "Build a bookshelf",
      durationMs: 1234,
      ok: true,
      checks,
      spec: bookshelfSpec,
    });

    expect(artifact).toMatchObject({
      caseId: "bookshelf",
      run: 1,
      durationMs: 1234,
      ok: true,
      parts: bookshelfSpec.parts.length,
      checks,
      spec: bookshelfSpec,
    });
    expect(JSON.parse(serializeGoldenArtifact(artifact))).toEqual(artifact);
    expect(serializeGoldenArtifact(artifact)).toMatch(/\n$/);
  });

  it("records failed calls even when no spec was produced", () => {
    const artifact = buildGoldenArtifact({
      caseId: "wardrobe",
      run: 2,
      prompt: "Build a wardrobe",
      durationMs: 500,
      ok: false,
      checks: [],
      error: "502 provider error",
    });

    expect(artifact).toMatchObject({
      ok: false,
      error: "502 provider error",
    });
    expect(artifact).not.toHaveProperty("parts");
    expect(artifact).not.toHaveProperty("spec");
  });
});
