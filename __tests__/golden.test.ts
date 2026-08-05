import { describe, expect, it } from "vitest";
import {
  GOLDEN_CASES,
  goldenRunKey,
  orderGoldenCases,
  parentSpecFor,
  scoreRuns,
  type CaseRun,
  type Check,
} from "@/lib/golden/cases";
import { bookshelfSpec } from "@/lib/spec/examples";
import type { FurnitureSpec, Part } from "@/lib/spec/schema";

/**
 * The golden suite costs real money to run, so its expectations are tested
 * against the hand-authored reference spec instead — which is precisely the
 * correct answer to the bookshelf prompt. A check that rejects the known-good
 * spec is broken, and finding that out for free beats finding it out mid-run.
 */

const caseById = (id: string) => {
  const c = GOLDEN_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no golden case "${id}"`);
  return c;
};

const failed = (checks: Check[]) => checks.filter((c) => !c.pass).map((c) => c.name);

/** The bookshelf, widened by 200mm with every span re-derived. */
function widened(): FurnitureSpec {
  const scaleX = (p: Part): Part => {
    if (p.id === "side-right") return { ...p, position: { ...p.position, x: 982 } };
    if (p.id === "back") return { ...p, size: { ...p.size, w: 1000 } };
    if (p.size.w === 764) return { ...p, size: { ...p.size, w: 964 } };
    return p;
  };
  return {
    ...bookshelfSpec,
    bbox: { ...bookshelfSpec.bbox, w: 1000 },
    parts: bookshelfSpec.parts.map(scaleX),
  };
}

function withExtraShelf(): FurnitureSpec {
  const shelf: Part = {
    ...bookshelfSpec.parts.find((p) => p.id === "shelf-4")!,
    id: "shelf-5",
    name: "Shelf 5",
    position: { x: 18, y: 1600, z: 0 },
  };
  return { ...bookshelfSpec, parts: [...bookshelfSpec.parts, shelf] };
}

function withoutBack(): FurnitureSpec {
  return {
    ...bookshelfSpec,
    materials: bookshelfSpec.materials.filter((m) => m.id !== "back-6"),
    parts: bookshelfSpec.parts.filter((p) => p.id !== "back"),
  };
}

function withGenericPlywoodAndExtraShelf(): FurnitureSpec {
  const source = withExtraShelf();
  return {
    ...source,
    materials: source.materials.map((m) =>
      m.id === "ply-18" ? { ...m, name: "18mm plywood" } : m
    ),
  };
}

function inBirch(): FurnitureSpec {
  const source = withGenericPlywoodAndExtraShelf();
  return {
    ...source,
    materials: source.materials.map((m) =>
      m.id === "ply-18" ? { ...m, name: "18mm birch plywood" } : m
    ),
  };
}

function tenModuleFixture(): FurnitureSpec {
  const parts = Array.from({ length: 10 }, (_, i): Part[] => {
    const moduleNumber = i + 1;
    const x = (i % 5) * 500;
    const y = Math.floor(i / 5) * 500;
    return [
      {
        id: `module-${moduleNumber}-side-left`,
        name: `Module ${moduleNumber} left side`,
        shape: "box",
        size: { w: 18, h: 500, d: 400 },
        position: { x, y, z: 0 },
        materialId: "ply-18",
      },
      {
        id: `module-${moduleNumber}-side-right`,
        name: `Module ${moduleNumber} right side`,
        shape: "box",
        size: { w: 18, h: 500, d: 400 },
        position: { x: x + 482, y, z: 0 },
        materialId: "ply-18",
      },
      {
        id: `module-${moduleNumber}-top`,
        name: `Module ${moduleNumber} top`,
        shape: "box",
        size: { w: 464, h: 18, d: 400 },
        position: { x: x + 18, y: y + 482, z: 0 },
        materialId: "ply-18",
      },
      {
        id: `module-${moduleNumber}-bottom`,
        name: `Module ${moduleNumber} bottom`,
        shape: "box",
        size: { w: 464, h: 18, d: 400 },
        position: { x: x + 18, y, z: 0 },
        materialId: "ply-18",
      },
      {
        id: `module-${moduleNumber}-back`,
        name: `Module ${moduleNumber} back`,
        shape: "box",
        size: { w: 464, h: 464, d: 18 },
        position: { x: x + 18, y: y + 18, z: 382 },
        materialId: "ply-18",
      },
    ];
  }).flat();
  return {
    version: 1,
    name: "Ten-module storage wall",
    units: "mm",
    bbox: { w: 2500, h: 1000, d: 400 },
    materials: [{ id: "ply-18", name: "18mm plywood", kind: "sheet", thickness: 18 }],
    parts,
  };
}

describe("bookshelf case", () => {
  it("accepts the reference spec, which is its correct answer", () => {
    const checks = caseById("bookshelf").check(bookshelfSpec);
    expect(failed(checks)).toEqual([]);
  });

  it("rejects shelves that ignore the side thickness", () => {
    // The classic failure: shelves cut to the full 800mm rather than the
    // 764mm interior, so the carcass cannot close.
    const wrong: FurnitureSpec = {
      ...bookshelfSpec,
      parts: bookshelfSpec.parts.map((p) =>
        p.size.w === 764 ? { ...p, size: { ...p.size, w: 800 } } : p
      ),
    };
    expect(failed(caseById("bookshelf").check(wrong))).toContain(
      "shelves/top/bottom span the 764mm interior"
    );
  });

  it("rejects a piece built to the wrong overall size", () => {
    const wrong: FurnitureSpec = { ...bookshelfSpec, bbox: { w: 900, h: 1800, d: 300 } };
    expect(failed(caseById("bookshelf").check(wrong))).toContain("bbox is 800×1800×300mm");
  });

  it("rejects a missing back panel", () => {
    const wrong: FurnitureSpec = {
      ...bookshelfSpec,
      parts: bookshelfSpec.parts.filter((p) => p.id !== "back"),
    };
    expect(failed(caseById("bookshelf").check(wrong))).toContain("has a 6mm back panel");
  });
});

describe("refinement cases", () => {
  it("accepts a correctly widened bookshelf", () => {
    const checks = caseById("bookshelf-wider").check(widened(), bookshelfSpec);
    expect(failed(checks)).toEqual([]);
  });

  it("catches a widened bbox whose shelves were not re-derived", () => {
    // The drift the 'return the COMPLETE spec' rule exists to prevent: the
    // bbox changes and the parts inside it silently do not.
    const stale: FurnitureSpec = {
      ...bookshelfSpec,
      bbox: { ...bookshelfSpec.bbox, w: 1000 },
    };
    expect(failed(caseById("bookshelf-wider").check(stale, bookshelfSpec))).toContain(
      "shelves re-derived to 964mm"
    );
  });

  it("catches renamed ids, which would break every stored edit", () => {
    const renamed: FurnitureSpec = {
      ...widened(),
      parts: widened().parts.map((p) => ({ ...p, id: `${p.id}-v2` })),
    };
    expect(failed(caseById("bookshelf-wider").check(renamed, bookshelfSpec))).toContain(
      "ids of untouched parts preserved"
    );
  });

  it("accepts exactly one added shelf", () => {
    const checks = caseById("bookshelf-add-shelf").check(withExtraShelf(), bookshelfSpec);
    expect(failed(checks)).toEqual([]);
  });

  it("rejects a rebuild that changed the part count by more than one", () => {
    const twoMore: FurnitureSpec = {
      ...withExtraShelf(),
      parts: [
        ...withExtraShelf().parts,
        { ...withExtraShelf().parts[0], id: "extra", name: "Extra" },
      ],
    };
    expect(failed(caseById("bookshelf-add-shelf").check(twoMore, bookshelfSpec))).toContain(
      "exactly one part added"
    );
  });

  it("accepts removing only the requested back panel", () => {
    expect(failed(caseById("bookshelf-remove-back").check(withoutBack(), bookshelfSpec))).toEqual(
      []
    );
  });

  it("rejects a removal that also renames an untouched part", () => {
    const wrong = withoutBack();
    wrong.parts = wrong.parts.map((p, i) => (i === 0 ? { ...p, id: `${p.id}-new` } : p));
    expect(failed(caseById("bookshelf-remove-back").check(wrong, bookshelfSpec))).toContain(
      "ids of untouched parts preserved"
    );
  });

  it("rejects geometry drift in an untouched part during removal", () => {
    const wrong = withoutBack();
    wrong.parts[0] = {
      ...wrong.parts[0],
      position: { ...wrong.parts[0].position, x: wrong.parts[0].position.x + 10 },
    };
    expect(failed(caseById("bookshelf-remove-back").check(wrong, bookshelfSpec))).toContain(
      "geometry of untouched parts preserved"
    );
  });

  it("rejects material reassignment on an untouched part during removal", () => {
    const wrong = withoutBack();
    wrong.materials.push({ id: "other", name: "Other plywood", kind: "sheet", thickness: 18 });
    wrong.parts[0] = { ...wrong.parts[0], materialId: "other" };
    expect(failed(caseById("bookshelf-remove-back").check(wrong, bookshelfSpec))).toContain(
      "material assignments of untouched parts preserved"
    );
  });

  it("rejects an overall bbox change during back removal", () => {
    const wrong = withoutBack();
    wrong.bbox = { ...wrong.bbox, w: wrong.bbox.w + 10 };
    expect(failed(caseById("bookshelf-remove-back").check(wrong, bookshelfSpec))).toContain(
      "overall bbox preserved"
    );
  });

  it("accepts a material-only change after adding a shelf", () => {
    expect(
      failed(
        caseById("bookshelf-birch").check(inBirch(), withGenericPlywoodAndExtraShelf())
      )
    ).toEqual([]);
  });

  it("rejects geometry drift during a material-only change", () => {
    const wrong = inBirch();
    wrong.parts = wrong.parts.map((p, i) =>
      i === 0 ? { ...p, size: { ...p.size, h: p.size.h + 10 } } : p
    );
    expect(
      failed(
        caseById("bookshelf-birch").check(wrong, withGenericPlywoodAndExtraShelf())
      )
    ).toContain("part geometry unchanged");
  });

  it("rejects an unused birch material while parts keep the old plywood", () => {
    const wrong = withGenericPlywoodAndExtraShelf();
    wrong.materials = [
      ...wrong.materials,
      { id: "birch-18", name: "18mm birch plywood", kind: "sheet", thickness: 18 },
    ];
    expect(
      failed(
        caseById("bookshelf-birch").check(wrong, withGenericPlywoodAndExtraShelf())
      )
    ).toContain("all 18mm plywood parts use birch plywood");
  });
});

describe("large assembly case", () => {
  it("accepts the prompt-determined 50-panel assembly", () => {
    expect(failed(caseById("ten-cubby-modules").check(tenModuleFixture()))).toEqual([]);
  });

  it("rejects correctly named panels that do not construct the requested cubbies", () => {
    const wrong = tenModuleFixture();
    wrong.parts = wrong.parts.map((part, i) => ({
      ...part,
      size: { w: 100, h: 18, d: 100 },
      position: { x: (i % 10) * 120, y: Math.floor(i / 10) * 30, z: 0 },
    }));
    expect(failed(caseById("ten-cubby-modules").check(wrong))).toContain(
      "module panel geometry and arrangement match"
    );
  });

  it("rejects a generation that silently omits a panel", () => {
    const wrong = tenModuleFixture();
    wrong.parts = wrong.parts.slice(0, -1);
    expect(failed(caseById("ten-cubby-modules").check(wrong))).toContain(
      "has exactly 50 module panels"
    );
  });

  it("rejects a renamed or substituted module panel", () => {
    const wrong = tenModuleFixture();
    wrong.parts[0] = { ...wrong.parts[0], id: "unexpected-panel" };
    expect(failed(caseById("ten-cubby-modules").check(wrong))).toContain(
      "has the exact five panel ids for every module"
    );
  });

  it("rejects a non-plywood panel with the right physical thickness", () => {
    const wrong = tenModuleFixture();
    wrong.materials.push({
      id: "solid-18",
      name: "18mm solid wood",
      kind: "solid",
      thickness: 18,
    });
    wrong.parts[0] = { ...wrong.parts[0], materialId: "solid-18" };
    expect(failed(caseById("ten-cubby-modules").check(wrong))).toContain(
      "every panel references 18mm sheet material"
    );
  });
});

describe("underspecified request case", () => {
  it("accepts a valid design that preserves the one explicit dimension", () => {
    const resolved: FurnitureSpec = {
      ...bookshelfSpec,
      name: "Entryway bench",
      bbox: { ...bookshelfSpec.bbox, w: 1000 },
    };
    expect(failed(caseById("entryway-bench").check(resolved))).toEqual([]);
  });
});

describe("suite shape", () => {
  it("covers base, large-assembly, removal, and chained-refinement prompts", () => {
    expect(GOLDEN_CASES.map((c) => c.id)).toEqual([
      "bookshelf",
      "bookshelf-wider",
      "bookshelf-add-shelf",
      "bedside-table",
      "desk",
      "wardrobe",
      "entryway-bench",
      "ten-cubby-modules",
      "bookshelf-remove-back",
      "bookshelf-birch",
    ]);
  });

  it("points every refinement at a case that exists", () => {
    const ids = new Set(GOLDEN_CASES.map((c) => c.id));
    for (const c of GOLDEN_CASES) {
      if (c.refines) expect(ids.has(c.refines), `${c.id} → ${c.refines}`).toBe(true);
    }
  });

  it("automatically includes refinement ancestors in dependency order", () => {
    expect(orderGoldenCases(GOLDEN_CASES, ["bookshelf-birch"]).map((c) => c.id)).toEqual([
      "bookshelf",
      "bookshelf-add-shelf",
      "bookshelf-birch",
    ]);
  });

  it("pairs each refinement repetition with the same parent repetition", () => {
    const parentRun1 = bookshelfSpec;
    const parentRun2 = widened();
    const specs = new Map([
      [goldenRunKey("bookshelf", 1), parentRun1],
      [goldenRunKey("bookshelf", 2), parentRun2],
    ]);
    const refinement = caseById("bookshelf-wider");

    expect(parentSpecFor(refinement, 1, specs)).toBe(parentRun1);
    expect(parentSpecFor(refinement, 2, specs)).toBe(parentRun2);
  });

  it("gives every case at least one check beyond validation", () => {
    for (const c of GOLDEN_CASES) {
      const checks = c.check(bookshelfSpec, bookshelfSpec);
      expect(checks.length, c.id).toBeGreaterThan(1);
    }
  });
});

describe("scoreRuns", () => {
  const run = (over: Partial<CaseRun>): CaseRun => ({
    caseId: "bookshelf",
    run: 1,
    ok: true,
    checks: [],
    durationMs: 1000,
    ...over,
  });

  it("counts which checks fail most, since that is what to fix", () => {
    const runs = [
      run({ ok: false, checks: [{ name: "a", pass: false, detail: "" }] }),
      run({ ok: false, checks: [{ name: "a", pass: false, detail: "" }] }),
      run({ ok: true, checks: [{ name: "a", pass: true, detail: "" }] }),
    ];
    const score = scoreRuns(runs);
    expect(score.passed).toBe(1);
    expect(score.rate).toBeCloseTo(1 / 3);
    expect(score.failedChecks.get("a")).toBe(2);
  });

  it("reports null rather than 0% for an empty run set", () => {
    expect(scoreRuns([]).rate).toBeNull();
  });
});
