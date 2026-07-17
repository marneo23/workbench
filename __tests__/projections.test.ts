import { describe, expect, it } from "vitest";
import { isoWireframe, projectView, rectsToSegments } from "@/lib/pdf/projections";
import { boundaries, dimensionChain } from "@/lib/pdf/dimensions";
import { bookshelfSpec } from "@/lib/spec/examples";
import type { FurnitureSpec } from "@/lib/spec/schema";

describe("projectView", () => {
  it("plan view drops Y: side-left is an 18×294 rect at origin", () => {
    const plan = projectView(bookshelfSpec, "plan");
    const rect = plan.rects.find((r) => r.partId === "side-left")!;
    expect(rect).toMatchObject({ x: 0, y: 0, w: 18, h: 294 });
    expect(plan.width).toBe(800);
    expect(plan.height).toBe(300);
  });

  it("front view drops Z: shelf-1 sits at y=350", () => {
    const front = projectView(bookshelfSpec, "front");
    const rect = front.rects.find((r) => r.partId === "shelf-1")!;
    expect(rect).toMatchObject({ x: 18, y: 350, w: 764, h: 18 });
    expect(front.width).toBe(800);
    expect(front.height).toBe(1800);
  });

  it("side view drops X: back panel is at paper x=294, 6 wide", () => {
    const side = projectView(bookshelfSpec, "side");
    const rect = side.rects.find((r) => r.partId === "back")!;
    expect(rect).toMatchObject({ x: 294, y: 0, w: 6, h: 1800 });
    expect(side.width).toBe(300);
    expect(side.height).toBe(1800);
  });
});

describe("rectsToSegments", () => {
  it("dedupes coincident edges", () => {
    const segments = rectsToSegments([
      { partId: "a", x: 0, y: 0, w: 10, h: 10 },
      { partId: "b", x: 10, y: 0, w: 10, h: 10 }, // shares the x=10 edge
    ]);
    expect(segments).toHaveLength(7); // 8 minus 1 shared
  });
});

describe("isoWireframe", () => {
  it("emits at most 12 edges per part and finite bounds", () => {
    const iso = isoWireframe(bookshelfSpec);
    expect(iso.segments.length).toBeLessThanOrEqual(bookshelfSpec.parts.length * 12);
    expect(iso.segments.length).toBeGreaterThan(0);
    expect(iso.maxX).toBeGreaterThan(iso.minX);
    expect(iso.maxY).toBeGreaterThan(iso.minY);
  });

  it("keeps vertical edges vertical (pure y translation)", () => {
    const iso = isoWireframe({
      ...bookshelfSpec,
      parts: [bookshelfSpec.parts[0]],
    });
    const verticals = iso.segments.filter((s) => Math.abs(s.x1 - s.x2) < 1e-9);
    expect(verticals).toHaveLength(4);
    for (const v of verticals) {
      expect(Math.abs(Math.abs(v.y2 - v.y1) - 1800)).toBeLessThan(1e-9);
    }
  });
});

describe("dimension chains", () => {
  it("front horizontal boundaries are the side positions", () => {
    expect(boundaries(bookshelfSpec, "front", "horizontal")).toEqual([0, 18, 782, 800]);
  });

  it("chain segments sum to the overall dimension on every view/axis", () => {
    for (const view of ["plan", "front", "side"] as const) {
      for (const axis of ["horizontal", "vertical"] as const) {
        const projection = projectView(bookshelfSpec, view);
        const overall = axis === "horizontal" ? projection.width : projection.height;
        const segments = dimensionChain(bookshelfSpec, view, axis);
        const sum = segments.reduce((acc, s) => acc + s.length, 0);
        expect(sum).toBeCloseTo(overall, 6);
      }
    }
  });

  it("chain sums hold for randomized specs", () => {
    // deterministic LCG so failures reproduce
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed / 2 ** 32;
    };

    for (let run = 0; run < 20; run++) {
      const bbox = { w: 400 + rand() * 1500, h: 400 + rand() * 1500, d: 200 + rand() * 500 };
      const parts = Array.from({ length: 8 }, (_, i) => {
        const size = {
          w: 10 + rand() * (bbox.w - 10),
          h: 10 + rand() * (bbox.h - 10),
          d: 10 + rand() * (bbox.d - 10),
        };
        return {
          id: `p${i}`,
          name: `Part ${i}`,
          shape: "box" as const,
          size,
          position: {
            x: rand() * (bbox.w - size.w),
            y: rand() * (bbox.h - size.h),
            z: rand() * (bbox.d - size.d),
          },
          materialId: "ply-18",
        };
      });
      const spec: FurnitureSpec = {
        version: 1,
        name: "random",
        units: "mm",
        bbox,
        materials: [{ id: "ply-18", name: "ply", kind: "sheet", thickness: 18 }],
        parts,
      };

      for (const view of ["plan", "front", "side"] as const) {
        for (const axis of ["horizontal", "vertical"] as const) {
          const projection = projectView(spec, view);
          const overall = axis === "horizontal" ? projection.width : projection.height;
          const sum = dimensionChain(spec, view, axis).reduce((acc, s) => acc + s.length, 0);
          expect(sum).toBeCloseTo(overall, 4);
        }
      }
    }
  });
});
