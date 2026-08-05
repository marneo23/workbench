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

function sameGeometry(a: Part, b: Part): boolean {
  return (
    a.shape === b.shape &&
    near(a.size.w, b.size.w) &&
    near(a.size.h, b.size.h) &&
    near(a.size.d, b.size.d) &&
    near(a.position.x, b.position.x) &&
    near(a.position.y, b.position.y) &&
    near(a.position.z, b.position.z)
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
  {
    id: "entryway-bench",
    prompt:
      "Entryway bench for two adults, exactly 1000mm wide. Choose sensible height, depth, construction, and materials.",
    check(spec) {
      return [
        validates(spec),
        check("preserves the explicit 1000mm width", near(spec.bbox.w, 1000), `${spec.bbox.w}mm`),
      ];
    },
  },
  {
    id: "ten-cubby-modules",
    prompt:
      "Workshop storage wall, exactly 2500mm wide, 1000mm tall, and 400mm deep. Build ten separate 500×500×400mm open-front cubby modules, five across by two high, using 18mm plywood and exactly five panels per module. Coordinates start at the lower front left. Module N has origin x=(column-1)×500 and y=(row-1)×500. Its sides are 18×500×400 at x and x+482; its bottom and top are 464×18×400 at x+18 and y/y+482; its back is 464×464×18 at x+18, y+18, z=382. Return exactly 50 parts. Use ids module-1-side-left, module-1-side-right, module-1-top, module-1-bottom, module-1-back, and the same suffixes for modules 2 through 10.",
    check(spec) {
      const sheetMaterials = spec.materials.filter((m) => m.kind === "sheet");
      const wrongThickness = spec.parts.filter((p) => !near(thinnest(p), 18, 0.5));
      const suffixes = ["side-left", "side-right", "top", "bottom", "back"];
      const expectedIds = new Set(
        Array.from({ length: 10 }, (_, i) =>
          suffixes.map((suffix) => `module-${i + 1}-${suffix}`)
        ).flat()
      );
      const actualIds = new Set(spec.parts.map((p) => p.id));
      const missing = [...expectedIds].filter((id) => !actualIds.has(id));
      const unexpected = [...actualIds].filter((id) => !expectedIds.has(id));
      const materialById = new Map(spec.materials.map((m) => [m.id, m]));
      const wrongMaterial = spec.parts.filter((part) => {
        const material = materialById.get(part.materialId);
        return (
          material?.kind !== "sheet" ||
          !near(material.thickness ?? 0, 18, 0.5) ||
          !material.name.toLowerCase().includes("plywood")
        );
      });
      const expectedGeometry = new Map<
        string,
        { size: Part["size"]; position: Part["position"] }
      >();
      for (let i = 0; i < 10; i++) {
        const moduleNumber = i + 1;
        const x = (i % 5) * 500;
        const y = Math.floor(i / 5) * 500;
        expectedGeometry.set(`module-${moduleNumber}-side-left`, {
          size: { w: 18, h: 500, d: 400 },
          position: { x, y, z: 0 },
        });
        expectedGeometry.set(`module-${moduleNumber}-side-right`, {
          size: { w: 18, h: 500, d: 400 },
          position: { x: x + 482, y, z: 0 },
        });
        expectedGeometry.set(`module-${moduleNumber}-top`, {
          size: { w: 464, h: 18, d: 400 },
          position: { x: x + 18, y: y + 482, z: 0 },
        });
        expectedGeometry.set(`module-${moduleNumber}-bottom`, {
          size: { w: 464, h: 18, d: 400 },
          position: { x: x + 18, y, z: 0 },
        });
        expectedGeometry.set(`module-${moduleNumber}-back`, {
          size: { w: 464, h: 464, d: 18 },
          position: { x: x + 18, y: y + 18, z: 382 },
        });
      }
      const wrongGeometry = spec.parts.filter((part) => {
        const expected = expectedGeometry.get(part.id);
        return (
          !expected ||
          part.shape !== "box" ||
          !near(part.size.w, expected.size.w) ||
          !near(part.size.h, expected.size.h) ||
          !near(part.size.d, expected.size.d) ||
          !near(part.position.x, expected.position.x) ||
          !near(part.position.y, expected.position.y) ||
          !near(part.position.z, expected.position.z)
        );
      });
      return [
        validates(spec),
        bboxMatches(spec, 2500, 1000, 400),
        check(
          "has exactly 50 module panels",
          spec.parts.length === 50,
          `${spec.parts.length} parts`
        ),
        check(
          "has the exact five panel ids for every module",
          missing.length === 0 && unexpected.length === 0,
          `${missing.length ? `missing: ${missing.join(", ")}` : "none missing"}; ${
            unexpected.length ? `unexpected: ${unexpected.join(", ")}` : "none unexpected"
          }`
        ),
        check(
          "every panel references 18mm sheet material",
          wrongMaterial.length === 0,
          wrongMaterial.length
            ? `wrong material: ${wrongMaterial.map((p) => p.id).join(", ")}`
            : "all panels use 18mm plywood"
        ),
        check(
          "module panel geometry and arrangement match",
          wrongGeometry.length === 0,
          wrongGeometry.length
            ? `wrong geometry: ${wrongGeometry.map((p) => p.id).join(", ")}`
            : "all ten cubbies match the requested grid"
        ),
        check(
          "uses 18mm sheet material throughout",
          sheetMaterials.length > 0 &&
            sheetMaterials.every((m) => near(m.thickness ?? 0, 18, 0.5)) &&
            wrongThickness.length === 0,
          `${sheetMaterials.map((m) => `${m.id}:${m.thickness ?? "-"}`).join(" ")}; ${
            wrongThickness.length
          } non-18mm parts`
        ),
      ];
    },
  },
  {
    id: "bookshelf-remove-back",
    refines: "bookshelf",
    prompt: "Remove the back panel only. Preserve every untouched part and its id.",
    check(spec, previous) {
      const previousBack = previous?.parts.find(
        (p) => mentions(p, "back") || near(thinnest(p), 6, 0.5)
      );
      const expectedIds = new Set(
        previous?.parts.filter((p) => p.id !== previousBack?.id).map((p) => p.id) ?? []
      );
      const now = new Set(spec.parts.map((p) => p.id));
      const lost = [...expectedIds].filter((id) => !now.has(id));
      const previousById = new Map(previous?.parts.map((p) => [p.id, p]) ?? []);
      const changedGeometry = spec.parts.filter((part) => {
        const before = previousById.get(part.id);
        return before !== undefined && !sameGeometry(part, before);
      });
      const changedMaterial = spec.parts.filter((part) => {
        const before = previousById.get(part.id);
        return before !== undefined && part.materialId !== before.materialId;
      });
      const remainingBacks = spec.parts.filter(
        (p) => mentions(p, "back") || near(thinnest(p), 6, 0.5)
      );
      return [
        validates(spec),
        check(
          "exactly one part removed",
          previous ? spec.parts.length === previous.parts.length - 1 : false,
          previous ? `${previous.parts.length} → ${spec.parts.length}` : "no previous"
        ),
        check(
          "back panel removed",
          remainingBacks.length === 0,
          remainingBacks.map((p) => p.id).join(", ") || "none"
        ),
        check(
          "ids of untouched parts preserved",
          previousBack !== undefined && lost.length === 0,
          previousBack === undefined
            ? "no previous back panel"
            : lost.length
              ? `lost: ${lost.join(", ")}`
              : `all ${expectedIds.size} untouched ids kept`
        ),
        check(
          "geometry of untouched parts preserved",
          previousBack !== undefined && changedGeometry.length === 0,
          changedGeometry.length
            ? `changed: ${changedGeometry.map((p) => p.id).join(", ")}`
            : "all untouched geometry stable"
        ),
        check(
          "material assignments of untouched parts preserved",
          previousBack !== undefined && changedMaterial.length === 0,
          changedMaterial.length
            ? `changed: ${changedMaterial.map((p) => p.id).join(", ")}`
            : "all untouched materials stable"
        ),
        check(
          "overall bbox preserved",
          previous !== undefined &&
            near(spec.bbox.w, previous.bbox.w) &&
            near(spec.bbox.h, previous.bbox.h) &&
            near(spec.bbox.d, previous.bbox.d),
          previous
            ? `${previous.bbox.w}×${previous.bbox.h}×${previous.bbox.d} → ${spec.bbox.w}×${spec.bbox.h}×${spec.bbox.d}`
            : "no previous"
        ),
      ];
    },
  },
  {
    id: "bookshelf-birch",
    refines: "bookshelf-add-shelf",
    prompt:
      "Change the 18mm plywood material to 18mm birch plywood. Change no dimensions, positions, or part ids.",
    check(spec, previous) {
      const previousById = new Map(previous?.parts.map((p) => [p.id, p]) ?? []);
      const previousMaterialById = new Map(previous?.materials.map((m) => [m.id, m]) ?? []);
      const materialById = new Map(spec.materials.map((m) => [m.id, m]));
      const changed = spec.parts.filter((p) => {
        const before = previousById.get(p.id);
        return !before || !sameGeometry(p, before);
      });
      const notBirch = spec.parts.filter((part) => {
        const before = previousById.get(part.id);
        const oldMaterial = before ? previousMaterialById.get(before.materialId) : undefined;
        if (oldMaterial?.kind !== "sheet" || !near(oldMaterial.thickness ?? 0, 18, 0.5)) {
          return false;
        }
        const material = materialById.get(part.materialId);
        return !(
          material?.kind === "sheet" &&
          near(material.thickness ?? 0, 18, 0.5) &&
          material.name.toLowerCase().includes("birch")
        );
      });
      return [
        validates(spec),
        idsPreserved(spec, previous),
        check(
          "part geometry unchanged",
          previous !== undefined &&
            spec.parts.length === previous.parts.length &&
            changed.length === 0 &&
            near(spec.bbox.w, previous.bbox.w) &&
            near(spec.bbox.h, previous.bbox.h) &&
            near(spec.bbox.d, previous.bbox.d),
          changed.length ? `changed: ${changed.map((p) => p.id).join(", ")}` : "all geometry stable"
        ),
        check(
          "18mm sheet material is birch plywood",
          spec.materials.some(
            (m) =>
              m.kind === "sheet" &&
              near(m.thickness ?? 0, 18, 0.5) &&
              m.name.toLowerCase().includes("birch")
          ),
          spec.materials.map((m) => `${m.name}:${m.thickness ?? "-"}`).join("; ")
        ),
        check(
          "all 18mm plywood parts use birch plywood",
          previous !== undefined && notBirch.length === 0,
          notBirch.length
            ? `not birch: ${notBirch.map((p) => p.id).join(", ")}`
            : "all affected parts use birch plywood"
        ),
      ];
    },
  },
];

/** Include selected cases' ancestors and return a stable dependency order. */
export function orderGoldenCases(
  cases: GoldenCase[],
  selectedIds?: string[]
): GoldenCase[] {
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const ordered: GoldenCase[] = [];
  const complete = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string) => {
    if (complete.has(id)) return;
    const testCase = byId.get(id);
    if (!testCase) throw new Error(`unknown golden case "${id}"`);
    if (visiting.has(id)) throw new Error(`cyclic golden refinement at "${id}"`);

    visiting.add(id);
    if (testCase.refines) visit(testCase.refines);
    visiting.delete(id);
    complete.add(id);
    ordered.push(testCase);
  };

  for (const id of selectedIds ?? cases.map((testCase) => testCase.id)) visit(id);
  return ordered;
}

export function goldenRunKey(caseId: string, run: number): string {
  return `${caseId}:${run}`;
}

/** Resolve a refinement against its matching repetition, never another run. */
export function parentSpecFor(
  testCase: GoldenCase,
  run: number,
  specs: ReadonlyMap<string, FurnitureSpec>
): FurnitureSpec | undefined {
  return testCase.refines
    ? specs.get(goldenRunKey(testCase.refines, run))
    : undefined;
}

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
