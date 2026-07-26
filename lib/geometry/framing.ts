import type { Size3 } from "@/lib/spec/schema";

/**
 * Pure camera framing math — no three.js import, so the viewport's geometry is
 * unit-testable in Node (same principle as builder.ts).
 *
 * Scene convention, inherited from builder.ts: the model is re-centered so its
 * footprint sits on the origin with the floor at y = 0. A part's spec z = 0 is
 * the FRONT of the piece (schema.ts), and the builder's offset maps that to
 * scene z = -d/2 — so the front of a piece faces NEGATIVE z and a camera must
 * have z < 0 to see it. Getting this backwards framed every design from behind.
 */

/** Outward normal of the front face, in scene coordinates. */
export const FRONT_NORMAL: Vec3Tuple = [0, 0, -1];

/** Vertical field of view, degrees. Shared by <Canvas> and the framing math. */
export const CAMERA_FOV = 40;

/** Relative change in size that counts as "a different piece" worth re-framing. */
export const REFRAME_THRESHOLD = 0.08;

/** Hard cap on assembly drift, radians (~17°). */
export const DRIFT_MAX = 0.3;

export type Vec3Tuple = [number, number, number];

export interface Framing {
  /** bounding-box diagonal, mm — the scale everything else is derived from */
  diag: number;
  position: Vec3Tuple;
  /** orbit pivot: the model's mid-height on the vertical axis */
  target: Vec3Tuple;
  near: number;
  far: number;
}

/**
 * The canonical three-quarter view of a piece: front-right, slightly above
 * mid-height, pulled back along the bounding-box diagonal.
 */
export function framingFor(bbox: Size3): Framing {
  const diag = Math.hypot(bbox.w, bbox.h, bbox.d);
  return {
    diag,
    position: [diag * 1.1, diag * 0.75, -diag * 1.1],
    target: [0, bbox.h / 2, 0],
    near: diag * 0.02,
    far: diag * 12,
  };
}

/** Rotate about the world Y axis — matches THREE.Vector3.applyAxisAngle(UP, a). */
export function rotateAboutY(v: Vec3Tuple, angle: number): Vec3Tuple {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** True when the piece changed size enough that the camera should re-frame. */
export function needsReframe(
  prevDiag: number,
  diag: number,
  threshold = REFRAME_THRESHOLD
): boolean {
  if (prevDiag <= 0) return false;
  return Math.abs(diag - prevDiag) / prevDiag > threshold;
}

/** True when the camera is on the side of the piece its front faces. */
export function seesFront(position: Vec3Tuple, target: Vec3Tuple): boolean {
  const dot =
    (position[0] - target[0]) * FRONT_NORMAL[0] +
    (position[1] - target[1]) * FRONT_NORMAL[1] +
    (position[2] - target[2]) * FRONT_NORMAL[2];
  return dot > 0;
}
