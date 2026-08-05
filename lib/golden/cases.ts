/**
 * Phase A2 — the golden-prompt suite's expectations.
 *
 * The deterministic pipeline has unit tests; the model does not, so a fixed set
 * of prompts with known-correct answers is the only measurement available. The
 * checks live here as pure functions over a spec so they can be tested against
 * the reference spec without spending a token — `scripts/golden.ts` supplies
 * the real ones.
 *
 * Checks assert the arithmetic the prompt makes non-negotiable (an 800mm
 * carcass with 18mm sides has a 764mm interior, full stop) and stay loose about
 * everything the request leaves open. A check that encodes taste will fail on a
 * perfectly good design and get ignored, which is worse than not having it.
 */

import type { FurnitureSpec, Part } from "@/lib/spec/schema";
import { validateSpec } from "@/lib/spec/validate";

export type Check = {
  name: string;
  pass: boolean;
  /** What was actually found, so a failure is diagnosable from the log. */
  detail: string;
};

export type GoldenCase = {
  id: string;
  prompt: string;
  /**
   * When set, this case is a refinement: it runs against the spec produced by
   * the named case, and receives it as `previous`.
   */
  refines?: string;
  check(spec: FurnitureSpec, previous?: FurnitureSpec): Check[];
};

const TOL = 1; // mm

const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol;
const thinnest = (p: Part) => Math.min(p.size.w, p.size.h, p.size.d);
/** Horizontal panel: thin in Y, broad in X and Z. */
const isHorizontalPanel = (p: Part) =>
  p.size.h < p.size.w && p.size.h < p.size.d && p.size.h <= 30;
const mentions = (p: Part, word: string) =>
  `${p.id} ${p.name}`.toLowerCase().includes(word);

function check(name: string, pass: boolean, detail: string): Check {
  return { name, pass, detail };
}

/** Every case must produce a spec the pipeline itself accepts. */
function validates(spec: FurnitureSpec): Check {
  const { errors, warnings } = validateSpec(spec);
  return check(
    "passes validateSpec",
    errors.length === 0,
    errors.length
      ? errors.map((e) => e.message).join("; ")
      : `clean (${warnings.length} warning${warnings.length === 1 ? "" : "s"})`
  );
}

function bboxMatches(spec: FurnitureSpec, w: number, h: number, d: number): Check {
  const got = `${spec.bbox.w}×${spec.bbox.h}×${spec.bbox.d}`;
  return check(
    `bbox is ${w}×${h}×${d}mm`,
    near(spec.bbox.w, w) && near(spec.bbox.h, h) && near(spec.bbox.d, d),
    got
  );
}

/** Ids are the handle the UI edits by; a refinement that renames parts breaks it. */
function idsPreserved(spec: FurnitureSpec, previous: FurnitureSpec | undefined): Check {
  if (!previous) return check("ids preserved", false, "no previous spec");
  const now = new Set(spec.parts.map((p) => p.id));
  const lost = previous.parts.map((p) => p.id).filter((id) => !now.has(id));
  return check(
    "ids of untouched parts preserved",
    lost.length === 0,
    lost.length ? `lost: ${lost.join(", ")}` : `all ${previous.parts.length} kept`
  );
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "bookshelf",
    prompt:
      "Bookshelf, 800 wide, 1800 tall, 300 deep, 4 shelves, 18mm plywood.",
    check(spec) {
      // The one case where the arithmetic is fully determined: 18mm sides in an
      // 800mm carcass leave a 764mm interior, and every shelf spans it.
      const interior = 764;
      const spanning = spec.parts.filter(
        (p) => isHorizontalPanel(p) && near(p.size.w, interior)
      );
      const back = spec.parts.find((p) => near(thinnest(p), 6, 0.5));
      return [
        validates(spec),
        bboxMatches(spec, 800, 1800, 300),
        check(
          "shelves/top/bottom span the 764mm interior",
          spanning.length >= 6,
          `${spanning.length} horizontal parts at 764mm (expect 4 shelves + top + bottom)`
        ),
        check(
          "has a 6mm back panel",
          back !== undefined,
          back ? `${back.id} at ${thinnest(back)}mm` : "no 6mm part found"
        ),
        check(
          "sheet thicknesses are 18mm and 6mm only",
          spec.materials
            .filter((m) => m.kind === "sheet")
            .every((m) => m.thickness === 18 || m.thickness === 6),
          spec.materials.map((m) => `${m.id}:${m.thickness ?? "-"}`).join(" ")
        ),
      ];
    },
  },
  {
    id: "bookshelf-wider",
    refines: "bookshelf",
    prompt: "Make it 200mm wider.",
    check(spec, previous) {
      const interior = 964; // 1000 − 2×18
      const spanning = spec.parts.filter(
        (p) => isHorizontalPanel(p) && near(p.size.w, interior)
      );
      return [
        validates(spec),
        check("bbox width became 1000mm", near(spec.bbox.w, 1000), `${spec.bbox.w}mm`),
        check(
          "height and depth unchanged",
          previous
            ? near(spec.bbox.h, previous.bbox.h) && near(spec.bbox.d, previous.bbox.d)
            : false,
          `${spec.bbox.h}×${spec.bbox.d}`
        ),
        check(
          "shelves re-derived to 964mm",
          spanning.length >= 6,
          `${spanning.length} horizontal parts at 964mm`
        ),
        idsPreserved(spec, previous),
      ];
    },
  },
  {
    id: "bookshelf-add-shelf",
    refines: "bookshelf",
    prompt: "Add a shelf.",
    check(spec, previous) {
      return [
        validates(spec),
        check(
          "exactly one part added",
          previous ? spec.parts.length === previous.parts.length + 1 : false,
          previous ? `${previous.parts.length} → ${spec.parts.length}` : "no previous"
        ),
        check(
          "bbox unchanged",
          previous
            ? near(spec.bbox.w, previous.bbox.w) &&
                near(spec.bbox.h, previous.bbox.h) &&
                near(spec.bbox.d, previous.bbox.d)
            : false,
          `${spec.bbox.w}×${spec.bbox.h}×${spec.bbox.d}`
        ),
        idsPreserved(spec, previous),
      ];
    },
  },
  {
    id: "bedside-table",
    prompt:
      "Bedside table with one drawer and an open shelf below it, 500 wide, 400 deep, 550 tall.",
    check(spec) {
      const drawerParts = spec.parts.filter((p) => mentions(p, "drawer"));
      return [
        validates(spec),
        bboxMatches(spec, 500, 550, 400),
        check(
          "models a drawer as a sub-assembly, not one block",
          drawerParts.length >= 3,
          `${drawerParts.length} drawer parts: ${drawerParts.map((p) => p.id).join(", ") || "none"}`
        ),
        check(
          "has an open shelf below the drawer",
          spec.parts.some((p) => isHorizontalPanel(p) && p.position.y > 0 && p.position.y < 400),
          `${spec.parts.filter(isHorizontalPanel).length} horizontal panels`
        ),
      ];
    },
  },
  {
    id: "desk",
    prompt: "A simple desk, 1400 wide and 700 deep, at a standard working height.",
    check(spec) {
      // Domain knowledge the prompt does not state: the system prompt claims
      // 730–760mm, so this measures whether that instruction survives.
      const { warnings } = validateSpec(spec);
      const floating = warnings.filter((w) => w.code === "floating-part");
      return [
        validates(spec),
        check("width 1400mm", near(spec.bbox.w, 1400), `${spec.bbox.w}mm`),
        check("depth 700mm", near(spec.bbox.d, 700), `${spec.bbox.d}mm`),
        check(
          "height is a standard desk height (730–760mm)",
          spec.bbox.h >= 730 && spec.bbox.h <= 760,
          `${spec.bbox.h}mm`
        ),
        check(
          "nothing floating",
          floating.length === 0,
          floating.map((w) => w.partId).join(", ") || "all parts connected"
        ),
      ];
    },
  },
  {
    id: "wardrobe",
    prompt:
      "Wardrobe 1000 wide, 2000 tall, 600 deep, with a shelf across the top and hanging space below it.",
    check(spec) {
      // Hanging needs >= 900mm clear. Find the lowest horizontal panel in the
      // upper half and measure down to the next obstruction below it.
      const panels = spec.parts
        .filter(isHorizontalPanel)
        .sort((a, b) => a.position.y - b.position.y);
      let bestGap = 0;
      for (let i = 0; i < panels.length - 1; i++) {
        const gap =
          panels[i + 1].position.y - (panels[i].position.y + panels[i].size.h);
        if (gap > bestGap) bestGap = gap;
      }
      return [
        validates(spec),
        bboxMatches(spec, 1000, 2000, 600),
        check(
          "resolves into a real part count",
          spec.parts.length >= 6,
          `${spec.parts.length} parts`
        ),
        check(
          "has >= 900mm clear hanging height",
          bestGap >= 900,
          `largest clear gap ${Math.round(bestGap)}mm`
        ),
        check(
          "has a shelf near the top",
          panels.some((p) => p.position.y > spec.bbox.h * 0.6),
          panels.map((p) => Math.round(p.position.y)).join(", ") || "no panels"
        ),
      ];
    },
  },
];

export type CaseRun = {
  caseId: string;
  run: number;
  ok: boolean;
  checks: Check[];
  error?: string;
  durationMs: number;
  parts?: number;
};

export function scoreRuns(runs: CaseRun[]): {
  total: number;
  passed: number;
  rate: number | null;
  failedChecks: Map<string, number>;
} {
  const failedChecks = new Map<string, number>();
  for (const r of runs) {
    for (const c of r.checks) {
      if (!c.pass) failedChecks.set(c.name, (failedChecks.get(c.name) ?? 0) + 1);
    }
  }
  const passed = runs.filter((r) => r.ok).length;
  return {
    total: runs.length,
    passed,
    rate: runs.length ? passed / runs.length : null,
    failedChecks,
  };
}
