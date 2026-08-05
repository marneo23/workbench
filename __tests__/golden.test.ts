import { describe, expect, it } from "vitest";
import { GOLDEN_CASES, scoreRuns, type CaseRun, type Check } from "@/lib/golden/cases";
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
});

describe("suite shape", () => {
  it("covers the four prompts plus the two refinement round-trips", () => {
    expect(GOLDEN_CASES.map((c) => c.id)).toEqual([
      "bookshelf",
      "bookshelf-wider",
      "bookshelf-add-shelf",
      "bedside-table",
      "desk",
      "wardrobe",
    ]);
  });

  it("points every refinement at a case that exists", () => {
    const ids = new Set(GOLDEN_CASES.map((c) => c.id));
    for (const c of GOLDEN_CASES) {
      if (c.refines) expect(ids.has(c.refines), `${c.id} → ${c.refines}`).toBe(true);
    }
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
