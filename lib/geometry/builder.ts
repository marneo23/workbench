import type { FurnitureSpec } from "@/lib/spec/schema";

/**
 * Pure spec → render-data conversion. No three.js imports — returns plain
 * numbers so it stays unit-testable in Node and the viewport provably renders
 * the same values the spec (and therefore the PDF) holds.
 *
 * Scene convention: mm units, Y-up. The model is re-centered so the bbox
 * footprint is centered on the origin with the floor at y = 0.
 */

export interface RenderPart {
  id: string;
  name: string;
  materialId: string;
  /** box center in scene coordinates, mm */
  center: [number, number, number];
  /** box extents, mm */
  size: [number, number, number];
  color: string;
}

export interface RenderModel {
  parts: RenderPart[];
  bbox: { w: number; h: number; d: number };
  /** translation applied to every part (spec coords + offset = scene coords) */
  offset: [number, number, number];
}

const SHEET_PALETTE = ["#d9b98c", "#c7a06b", "#e4cba4", "#b98f5e"];
const SOLID_PALETTE = ["#a97c50", "#8f6844", "#c19467"];
const ROD_COLOR = "#9aa0a6";

/** Stable color per material: kind picks the palette, order picks the shade. */
function materialColors(spec: FurnitureSpec): Map<string, string> {
  const colors = new Map<string, string>();
  let sheetIdx = 0;
  let solidIdx = 0;
  for (const m of spec.materials) {
    if (m.kind === "sheet") {
      colors.set(m.id, SHEET_PALETTE[sheetIdx++ % SHEET_PALETTE.length]);
    } else if (m.kind === "solid") {
      colors.set(m.id, SOLID_PALETTE[solidIdx++ % SOLID_PALETTE.length]);
    } else {
      colors.set(m.id, ROD_COLOR);
    }
  }
  return colors;
}

const FALLBACK_COLOR = "#cccccc";

export function buildRenderModel(spec: FurnitureSpec): RenderModel {
  const colors = materialColors(spec);
  const offset: [number, number, number] = [-spec.bbox.w / 2, 0, -spec.bbox.d / 2];

  const parts: RenderPart[] = spec.parts.map((p) => ({
    id: p.id,
    name: p.name,
    materialId: p.materialId,
    center: [
      p.position.x + p.size.w / 2 + offset[0],
      p.position.y + p.size.h / 2 + offset[1],
      p.position.z + p.size.d / 2 + offset[2],
    ],
    size: [p.size.w, p.size.h, p.size.d],
    color: colors.get(p.materialId) ?? FALLBACK_COLOR,
  }));

  return { parts, bbox: { ...spec.bbox }, offset };
}
