import type { FurnitureSpec } from "./spec/schema";

export interface CutListRow {
  qty: number;
  /** part names sharing this row, deduped, in spec order */
  names: string[];
  materialId: string;
  materialName: string;
  /** thinnest dimension, mm */
  thickness: number;
  /** longest face dimension, mm */
  length: number;
  /** middle face dimension, mm */
  width: number;
  grain: "length" | "width" | "none";
}

/**
 * Derive the cut list from a spec — never stored, always recomputed.
 * A part's cut rectangle is its two largest dimensions; the smallest is the
 * thickness. Parts group into one row when material, dims, and grain match.
 */
export function buildCutList(spec: FurnitureSpec): CutListRow[] {
  const rows = new Map<string, CutListRow>();

  for (const part of spec.parts) {
    const material = spec.materials.find((m) => m.id === part.materialId);
    const [length, width, thickness] = [part.size.w, part.size.h, part.size.d].sort(
      (a, b) => b - a
    );
    const grain = part.grain ?? "none";
    const key = [part.materialId, length, width, thickness, grain].join("|");

    const row = rows.get(key);
    if (row) {
      row.qty += 1;
      if (!row.names.includes(part.name)) row.names.push(part.name);
    } else {
      rows.set(key, {
        qty: 1,
        names: [part.name],
        materialId: part.materialId,
        materialName: material?.name ?? part.materialId,
        thickness,
        length,
        width,
        grain,
      });
    }
  }

  // Stable presentation order: by material, then biggest pieces first.
  return [...rows.values()].sort(
    (a, b) =>
      a.materialId.localeCompare(b.materialId) ||
      b.length * b.width - a.length * a.width
  );
}
