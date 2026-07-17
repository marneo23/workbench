import { describe, expect, it } from "vitest";
import { buildRenderModel } from "@/lib/geometry/builder";
import { bookshelfSpec } from "@/lib/spec/examples";

describe("buildRenderModel", () => {
  const model = buildRenderModel(bookshelfSpec);

  it("re-centers the footprint on the origin with the floor at y=0", () => {
    const minX = Math.min(...model.parts.map((p) => p.center[0] - p.size[0] / 2));
    const maxX = Math.max(...model.parts.map((p) => p.center[0] + p.size[0] / 2));
    const minY = Math.min(...model.parts.map((p) => p.center[1] - p.size[1] / 2));
    const minZ = Math.min(...model.parts.map((p) => p.center[2] - p.size[2] / 2));
    expect(minX).toBeCloseTo(-400);
    expect(maxX).toBeCloseTo(400);
    expect(minY).toBeCloseTo(0);
    expect(minZ).toBeCloseTo(-150);
  });

  it("converts min-corner to center correctly", () => {
    const sideLeft = model.parts.find((p) => p.id === "side-left")!;
    // spec: position (0,0,0), size (18,1800,294); offset (-400,0,-150)
    expect(sideLeft.center).toEqual([-391, 900, -3]);
    expect(sideLeft.size).toEqual([18, 1800, 294]);
  });

  it("gives different materials different colors", () => {
    const side = model.parts.find((p) => p.id === "side-left")!;
    const back = model.parts.find((p) => p.id === "back")!;
    expect(side.color).not.toBe(back.color);
  });

  it("keeps one render part per spec part", () => {
    expect(model.parts.map((p) => p.id)).toEqual(bookshelfSpec.parts.map((p) => p.id));
  });
});
