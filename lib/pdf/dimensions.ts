import type { FurnitureSpec } from "@/lib/spec/schema";
import { projectView, type ViewName } from "./projections";

/**
 * The "show all relevant dimensions" rule made algorithmic: per view axis,
 * every part boundary coordinate becomes a tick, and consecutive ticks form a
 * dimension chain. The chain provably sums to the overall dimension.
 */

export type ChainAxis = "horizontal" | "vertical";

export interface ChainSegment {
  from: number;
  to: number;
  /** segment length, mm */
  length: number;
}

const DEDUPE_TOLERANCE = 0.1; // mm

/**
 * Sorted, deduped boundary coordinates along one axis of a view, always
 * including 0 and the overall extent.
 */
export function boundaries(spec: FurnitureSpec, view: ViewName, axis: ChainAxis): number[] {
  const projection = projectView(spec, view);
  const coords: number[] = [0, axis === "horizontal" ? projection.width : projection.height];
  for (const r of projection.rects) {
    if (axis === "horizontal") {
      coords.push(r.x, r.x + r.w);
    } else {
      coords.push(r.y, r.y + r.h);
    }
  }
  coords.sort((a, b) => a - b);

  const deduped: number[] = [];
  for (const c of coords) {
    if (deduped.length === 0 || c - deduped[deduped.length - 1] > DEDUPE_TOLERANCE) {
      deduped.push(c);
    }
  }
  // Anchor the chain: if dedupe swallowed the overall extent (a part boundary
  // sat within tolerance below it), snap the last tick back to the overall so
  // the chain always sums exactly to the outside dimension.
  const overall = Math.max(...coords);
  if (overall - deduped[deduped.length - 1] <= DEDUPE_TOLERANCE) {
    deduped[deduped.length - 1] = overall;
  }
  return deduped;
}

/** Consecutive boundary pairs → chain segments. */
export function chain(bounds: number[]): ChainSegment[] {
  const segments: ChainSegment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    segments.push({ from: bounds[i], to: bounds[i + 1], length: bounds[i + 1] - bounds[i] });
  }
  return segments;
}

export function dimensionChain(
  spec: FurnitureSpec,
  view: ViewName,
  axis: ChainAxis
): ChainSegment[] {
  return chain(boundaries(spec, view, axis));
}
