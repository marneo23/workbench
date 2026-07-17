import type { FurnitureSpec, Part } from "@/lib/spec/schema";

/**
 * Orthographic projections of a spec whose parts are all axis-aligned boxes:
 * projection is pure axis-dropping, no hidden-line removal (v1).
 *
 * View coordinate systems (paper convention, y up — matches pdf-lib):
 * - plan  (looking down):        paper x = spec x, paper y = spec z
 * - front (looking from front):  paper x = spec x, paper y = spec y
 * - side  (looking from right):  paper x = spec z, paper y = spec y
 */

export type ViewName = "plan" | "front" | "side";

export interface ViewRect {
  partId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewProjection {
  rects: ViewRect[];
  /** overall extents of the view (from bbox), mm */
  width: number;
  height: number;
}

function projectPart(p: Part, view: ViewName): ViewRect {
  switch (view) {
    case "plan":
      return { partId: p.id, x: p.position.x, y: p.position.z, w: p.size.w, h: p.size.d };
    case "front":
      return { partId: p.id, x: p.position.x, y: p.position.y, w: p.size.w, h: p.size.h };
    case "side":
      return { partId: p.id, x: p.position.z, y: p.position.y, w: p.size.d, h: p.size.h };
  }
}

export function projectView(spec: FurnitureSpec, view: ViewName): ViewProjection {
  const rects = spec.parts.map((p) => projectPart(p, view));
  switch (view) {
    case "plan":
      return { rects, width: spec.bbox.w, height: spec.bbox.d };
    case "front":
      return { rects, width: spec.bbox.w, height: spec.bbox.h };
    case "side":
      return { rects, width: spec.bbox.d, height: spec.bbox.h };
  }
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Normalize so a segment and its reverse share one key (0.01mm grid). */
function segKey(s: Segment): string {
  const a: [number, number] = [Math.round(s.x1 * 100), Math.round(s.y1 * 100)];
  const b: [number, number] = [Math.round(s.x2 * 100), Math.round(s.y2 * 100)];
  const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
}

/**
 * Explode rects into their four edge segments, dropping exact duplicates so
 * coincident part edges print as a single clean line.
 */
export function rectsToSegments(rects: ViewRect[]): Segment[] {
  const out = new Map<string, Segment>();
  for (const r of rects) {
    const edges: Segment[] = [
      { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y },
      { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h },
      { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h },
      { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h },
    ];
    for (const e of edges) {
      const key = segKey(e);
      if (!out.has(key)) out.set(key, e);
    }
  }
  return [...out.values()];
}

export interface IsoProjection {
  segments: Segment[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/**
 * True vector isometric wireframe: each box's 8 corners through a fixed iso
 * matrix, 12 edges each, deduped. Never a raster screenshot — the drawing
 * must be measured from the model.
 */
export function isoWireframe(spec: FurnitureSpec): IsoProjection {
  const project = (x: number, y: number, z: number): [number, number] => [
    (x - z) * COS30,
    y + (x + z) * SIN30,
  ];

  const out = new Map<string, Segment>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of spec.parts) {
    const { x, y, z } = p.position;
    const { w, h, d } = p.size;
    // 8 corners indexed by bit flags (dx, dy, dz)
    const corners: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const c = project(x + (i & 1 ? w : 0), y + (i & 2 ? h : 0), z + (i & 4 ? d : 0));
      corners.push(c);
      minX = Math.min(minX, c[0]);
      minY = Math.min(minY, c[1]);
      maxX = Math.max(maxX, c[0]);
      maxY = Math.max(maxY, c[1]);
    }
    // 12 edges = corner pairs differing in exactly one bit
    for (let i = 0; i < 8; i++) {
      for (const bit of [1, 2, 4]) {
        const j = i | bit;
        if (j === i) continue;
        const seg: Segment = {
          x1: corners[i][0],
          y1: corners[i][1],
          x2: corners[j][0],
          y2: corners[j][1],
        };
        const key = segKey(seg);
        if (!out.has(key)) out.set(key, seg);
      }
    }
  }

  return { segments: [...out.values()], minX, minY, maxX, maxY };
}
