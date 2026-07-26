import { describe, expect, it } from "vitest";
import {
  CAMERA_FOV,
  DRIFT_MAX,
  framingFor,
  needsReframe,
  rotateAboutY,
  seesFront,
  type Vec3Tuple,
} from "@/lib/geometry/framing";
import { bookshelfSpec } from "@/lib/spec/examples";
import type { Size3 } from "@/lib/spec/schema";

/**
 * These are the regression tests for the framing bugs that only ever showed up
 * by looking at the screen. Each one is a geometric invariant, so it runs in
 * Node with no browser and no GPU.
 */

/** A spread of real furniture shapes plus the extremes the schema allows. */
const SHAPES: Record<string, Size3> = {
  bookshelf: bookshelfSpec.bbox,
  wardrobe: { w: 1000, h: 2000, d: 600 },
  desk: { w: 1400, h: 730, d: 700 },
  bedsideTable: { w: 500, h: 550, d: 400 },
  wideLowSideboard: { w: 2400, h: 700, d: 450 },
  tallNarrowShelf: { w: 300, h: 2200, d: 250 },
  tinyStool: { w: 300, h: 300, d: 300 },
  hugeWall: { w: 4000, h: 2400, d: 600 },
};

const dist = (a: Vec3Tuple, b: Vec3Tuple) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("framingFor", () => {
  it("puts the camera in front of the piece, not behind it", () => {
    // The bug this guards: the camera sat at +z while the spec puts the front
    // of a piece at z = 0 (which the builder maps to negative scene z), so
    // every design was framed from behind — a bookshelf showed its back panel
    // and none of its shelves.
    for (const [name, bbox] of Object.entries(SHAPES)) {
      const { position, target } = framingFor(bbox);
      expect(position[2], `${name} camera must be at negative z`).toBeLessThan(0);
      expect(seesFront(position, target), `${name} must show its front`).toBe(true);
    }
  });

  it("looks down at the piece from above its mid-height", () => {
    for (const [name, bbox] of Object.entries(SHAPES)) {
      const { position, target } = framingFor(bbox);
      expect(position[1], `${name} camera above the floor`).toBeGreaterThan(0);
      expect(position[1], `${name} camera above the pivot`).toBeGreaterThan(target[1]);
    }
  });

  it("pivots around the model's mid-height", () => {
    for (const bbox of Object.values(SHAPES)) {
      expect(framingFor(bbox).target).toEqual([0, bbox.h / 2, 0]);
    }
  });

  it("fits the whole piece inside the vertical field of view", () => {
    // The model's bounding sphere is centered on the target with radius
    // diag/2, so it is fully visible when d * sin(fov/2) >= radius.
    const halfFov = ((CAMERA_FOV / 2) * Math.PI) / 180;
    for (const [name, bbox] of Object.entries(SHAPES)) {
      const { position, target, diag } = framingFor(bbox);
      const fits = dist(position, target) * Math.sin(halfFov);
      expect(fits, `${name} must fit the frame`).toBeGreaterThan(diag / 2);
    }
  });

  it("keeps the whole piece between the near and far clip planes", () => {
    // The bug this guards: near/far are set from the bounding-box diagonal and
    // the <Canvas camera> prop only applies on mount, so a much larger or
    // smaller piece rendered later would clip.
    for (const [name, bbox] of Object.entries(SHAPES)) {
      const { position, target, diag, near, far } = framingFor(bbox);
      const d = dist(position, target);
      expect(near, `${name} near plane`).toBeLessThan(d - diag / 2);
      expect(far, `${name} far plane`).toBeGreaterThan(d + diag / 2);
      expect(near).toBeGreaterThan(0);
    }
  });

  it("scales the framing with the piece, so every piece is framed alike", () => {
    // Two pieces of the same proportions at different scales should produce
    // the same view — only further away.
    const small = framingFor({ w: 400, h: 900, d: 150 });
    const large = framingFor({ w: 800, h: 1800, d: 300 });
    expect(large.diag / small.diag).toBeCloseTo(2);
    for (let i = 0; i < 3; i++) {
      expect(large.position[i]).toBeCloseTo(small.position[i] * 2);
    }
  });
});

describe("assembly drift", () => {
  it("still shows the front of the piece at maximum drift", () => {
    // The bug this guards: uncapped drift accumulated ~34° per generation and
    // froze the camera wherever it landed, ending on a view of the back.
    for (const [name, bbox] of Object.entries(SHAPES)) {
      const { position, target } = framingFor(bbox);
      for (const angle of [0, DRIFT_MAX / 2, DRIFT_MAX, -DRIFT_MAX]) {
        const drifted = rotateAboutY(position, angle);
        expect(seesFront(drifted, target), `${name} @ ${angle} rad`).toBe(true);
      }
    }
  });

  it("orbits without changing the distance to the piece", () => {
    const { position, target } = framingFor(SHAPES.wardrobe);
    const before = dist(position, target);
    for (const angle of [0.1, DRIFT_MAX, 1.0]) {
      // The pivot is on the Y axis, so a Y rotation is a pure orbit.
      expect(dist(rotateAboutY(position, angle), target)).toBeCloseTo(before, 6);
    }
  });

  it("keeps the camera at the same height while it drifts", () => {
    const { position } = framingFor(SHAPES.desk);
    expect(rotateAboutY(position, DRIFT_MAX)[1]).toBeCloseTo(position[1]);
  });

  it("is a no-op at zero, so a settled rig leaves the view exactly alone", () => {
    const { position } = framingFor(SHAPES.bookshelf);
    expect(rotateAboutY(position, 0)).toEqual(position);
  });
});

describe("needsReframe", () => {
  const { diag } = framingFor(SHAPES.bookshelf);

  it("ignores small changes, so nudging a dimension doesn't move the camera", () => {
    expect(needsReframe(diag, diag)).toBe(false);
    expect(needsReframe(diag, diag * 1.05)).toBe(false);
    expect(needsReframe(diag, diag * 0.95)).toBe(false);
  });

  it("re-frames when a materially different piece arrives", () => {
    expect(needsReframe(diag, diag * 1.5)).toBe(true);
    expect(needsReframe(diag, diag * 0.5)).toBe(true);
    // The case from the bug report: a wardrobe generated after a bookshelf.
    expect(needsReframe(diag, framingFor(SHAPES.wardrobe).diag)).toBe(true);
  });

  it("is symmetric in direction — growing and shrinking both re-frame", () => {
    const grown = diag * 1.3;
    expect(needsReframe(diag, grown)).toBe(needsReframe(grown, diag));
  });

  it("never divides by zero on the first frame", () => {
    expect(needsReframe(0, diag)).toBe(false);
  });
});
