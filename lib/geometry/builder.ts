import type { FurnitureSpec, Material, Part, Size3 } from "@/lib/spec/schema";

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
function materialColors(materials: Material[]): Map<string, string> {
  const colors = new Map<string, string>();
  let sheetIdx = 0;
  let solidIdx = 0;
  for (const m of materials) {
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

/**
 * Core conversion shared by the full-spec and streaming-partial builders.
 * Only needs bbox (for centering), materials (for color), and the parts so far,
 * so it renders identically whether it sees a complete spec or a spec that is
 * still assembling part-by-part over the stream.
 */
function renderFromParts(
  bbox: Size3,
  materials: Material[],
  parts: Part[]
): RenderModel {
  const colors = materialColors(materials);
  const offset: [number, number, number] = [-bbox.w / 2, 0, -bbox.d / 2];

  const renderParts: RenderPart[] = parts.map((p) => ({
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

  return { parts: renderParts, bbox: { ...bbox }, offset };
}

export function buildRenderModel(spec: FurnitureSpec): RenderModel {
  return renderFromParts(spec.bbox, spec.materials, spec.parts);
}

/**
 * Render data for a spec that is still streaming in. `bbox` and `materials`
 * arrive first (the "meta" event); `parts` grows as each part closes. Produces
 * exactly what buildRenderModel would for the same parts, so the progressive
 * preview and the final committed model line up with no visual jump.
 */
export function buildPartialRenderModel(pending: {
  bbox: Size3;
  materials: Material[];
  parts: Part[];
}): RenderModel {
  return renderFromParts(pending.bbox, pending.materials, pending.parts);
}
