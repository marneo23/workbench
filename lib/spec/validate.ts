import type { FurnitureSpec, Part } from "./schema";

export interface ValidationIssue {
  code: string;
  message: string;
  partId?: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const BBOX_TOLERANCE = 1; // mm slack when checking containment
const SHEET_TOLERANCE = 0.5; // mm slack for sheet-thickness match
const MIN_PART_DIM = 3; // mm — anything thinner is unbuildable
const MAX_BBOX = 4000; // mm — larger than any room furniture
const MIN_BBOX = 50; // mm — smaller than any furniture on all axes
const TOUCH_TOLERANCE = 1; // mm gap that still counts as "touching"

function dims(p: Part): [number, number, number] {
  return [p.size.w, p.size.h, p.size.d];
}

function overlap1D(min1: number, max1: number, min2: number, max2: number) {
  return Math.min(max1, max2) - Math.max(min1, min2);
}

/** Overlap depth per axis; all positive = boxes penetrate each other. */
function penetration(a: Part, b: Part): [number, number, number] {
  return [
    overlap1D(a.position.x, a.position.x + a.size.w, b.position.x, b.position.x + b.size.w),
    overlap1D(a.position.y, a.position.y + a.size.h, b.position.y, b.position.y + b.size.h),
    overlap1D(a.position.z, a.position.z + a.size.d, b.position.z, b.position.z + b.size.d),
  ];
}

/**
 * Cross-field rules that the Zod schema (and LLM structured outputs) cannot
 * enforce. Errors block the spec and trigger an LLM retry; warnings are
 * surfaced in the UI but the spec is still usable.
 */
export function validateSpec(spec: FurnitureSpec): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // --- errors -------------------------------------------------------------

  const materialIds = new Set<string>();
  for (const m of spec.materials) {
    if (materialIds.has(m.id)) {
      errors.push({ code: "duplicate-material-id", message: `duplicate material id "${m.id}"` });
    }
    materialIds.add(m.id);
    if (m.kind === "sheet" && m.thickness === undefined) {
      errors.push({
        code: "sheet-missing-thickness",
        message: `sheet material "${m.id}" has no thickness`,
      });
    }
  }

  const bboxDims = [spec.bbox.w, spec.bbox.h, spec.bbox.d];
  if (bboxDims.some((v) => v > MAX_BBOX)) {
    errors.push({
      code: "absurd-bbox",
      message: `bounding box ${spec.bbox.w}×${spec.bbox.h}×${spec.bbox.d}mm exceeds ${MAX_BBOX}mm — implausible for furniture`,
    });
  }
  if (bboxDims.every((v) => v < MIN_BBOX)) {
    errors.push({
      code: "absurd-bbox",
      message: `bounding box ${spec.bbox.w}×${spec.bbox.h}×${spec.bbox.d}mm is under ${MIN_BBOX}mm on every axis — implausible for furniture`,
    });
  }

  const partIds = new Set<string>();
  for (const p of spec.parts) {
    if (partIds.has(p.id)) {
      errors.push({ code: "duplicate-part-id", partId: p.id, message: `duplicate part id "${p.id}"` });
    }
    partIds.add(p.id);

    if (dims(p).some((v) => v <= 0)) {
      errors.push({
        code: "non-positive-size",
        partId: p.id,
        message: `part "${p.id}" has a zero or negative dimension`,
      });
      continue; // downstream checks assume positive sizes
    }

    const thinnest = Math.min(...dims(p));
    if (thinnest < MIN_PART_DIM) {
      errors.push({
        code: "part-too-thin",
        partId: p.id,
        message: `part "${p.id}" is ${thinnest}mm at its thinnest — under the ${MIN_PART_DIM}mm buildable minimum`,
      });
    }

    const outX = p.position.x < -BBOX_TOLERANCE || p.position.x + p.size.w > spec.bbox.w + BBOX_TOLERANCE;
    const outY = p.position.y < -BBOX_TOLERANCE || p.position.y + p.size.h > spec.bbox.h + BBOX_TOLERANCE;
    const outZ = p.position.z < -BBOX_TOLERANCE || p.position.z + p.size.d > spec.bbox.d + BBOX_TOLERANCE;
    if (outX || outY || outZ) {
      errors.push({
        code: "part-outside-bbox",
        partId: p.id,
        message: `part "${p.id}" extends outside the ${spec.bbox.w}×${spec.bbox.h}×${spec.bbox.d}mm bounding box`,
      });
    }

    const material = spec.materials.find((m) => m.id === p.materialId);
    if (!material) {
      errors.push({
        code: "unknown-material",
        partId: p.id,
        message: `part "${p.id}" references unknown material "${p.materialId}"`,
      });
    } else if (material.kind === "sheet" && material.thickness !== undefined) {
      if (Math.abs(thinnest - material.thickness) > SHEET_TOLERANCE) {
        errors.push({
          code: "sheet-thickness-mismatch",
          partId: p.id,
          message: `part "${p.id}" is ${thinnest}mm thin but its sheet material "${material.id}" is ${material.thickness}mm`,
        });
      }
    }
  }

  // --- warnings -----------------------------------------------------------
  // Pairwise checks; only meaningful once sizes are sane.

  const sane = spec.parts.filter((p) => dims(p).every((v) => v > 0));
  for (let i = 0; i < sane.length; i++) {
    for (let j = i + 1; j < sane.length; j++) {
      const a = sane[i];
      const b = sane[j];
      const pen = penetration(a, b);

      if (pen.every((v) => v > TOUCH_TOLERANCE)) {
        warnings.push({
          code: "parts-overlap",
          partId: a.id,
          message: `parts "${a.id}" and "${b.id}" overlap by ${pen.map((v) => Math.round(v)).join("×")}mm`,
        });
      }

      const samePlace =
        Math.abs(a.position.x - b.position.x) <= TOUCH_TOLERANCE &&
        Math.abs(a.position.y - b.position.y) <= TOUCH_TOLERANCE &&
        Math.abs(a.position.z - b.position.z) <= TOUCH_TOLERANCE;
      const sameSize =
        Math.abs(a.size.w - b.size.w) <= TOUCH_TOLERANCE &&
        Math.abs(a.size.h - b.size.h) <= TOUCH_TOLERANCE &&
        Math.abs(a.size.d - b.size.d) <= TOUCH_TOLERANCE;
      if (samePlace && sameSize) {
        warnings.push({
          code: "near-duplicate-parts",
          partId: b.id,
          message: `parts "${a.id}" and "${b.id}" have the same size and position — likely an accidental duplicate`,
        });
      }
    }
  }

  for (const p of sane) {
    const onFloor = p.position.y <= TOUCH_TOLERANCE;
    const touchesOther = sane.some((other) => {
      if (other === p) return false;
      const pen = penetration(p, other);
      // touching = ranges meet (or nearly meet) on every axis
      return pen.every((v) => v >= -TOUCH_TOLERANCE);
    });
    if (!onFloor && !touchesOther) {
      warnings.push({
        code: "floating-part",
        partId: p.id,
        message: `part "${p.id}" is not on the floor and touches no other part`,
      });
    }
  }

  const bboxVolume = spec.bbox.w * spec.bbox.h * spec.bbox.d;
  for (const p of sane) {
    const v = p.size.w * p.size.h * p.size.d;
    if (bboxVolume > 0 && v > 0.9 * bboxVolume) {
      warnings.push({
        code: "volume-anomaly",
        partId: p.id,
        message: `part "${p.id}" fills over 90% of the bounding box — is it really one solid block?`,
      });
    }
  }

  return { errors, warnings };
}
