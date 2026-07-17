import { describe, expect, it } from "vitest";
import { FurnitureSpecSchema, type FurnitureSpec } from "@/lib/spec/schema";
import { validateSpec } from "@/lib/spec/validate";
import { bookshelfSpec } from "@/lib/spec/examples";

function clone(spec: FurnitureSpec): FurnitureSpec {
  return structuredClone(spec);
}

describe("bookshelf example", () => {
  it("parses against the Zod schema", () => {
    expect(FurnitureSpecSchema.safeParse(bookshelfSpec).success).toBe(true);
  });

  it("passes cross-field validation with no errors and no warnings", () => {
    const result = validateSpec(bookshelfSpec);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("validateSpec errors", () => {
  it("flags a part outside the bbox", () => {
    const spec = clone(bookshelfSpec);
    spec.parts[0].position.x = 790; // side-left now pokes out to 808 > 800
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("part-outside-bbox");
  });

  it("tolerates 1mm of bbox slack", () => {
    const spec = clone(bookshelfSpec);
    spec.parts[0].position.x = 0.8; // side-left reaches 18.8 — inside x tolerance
    const { errors } = validateSpec(spec);
    expect(errors).toEqual([]);
  });

  it("flags an unknown materialId", () => {
    const spec = clone(bookshelfSpec);
    spec.parts[0].materialId = "mdf-25";
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("unknown-material");
  });

  it("flags duplicate part ids", () => {
    const spec = clone(bookshelfSpec);
    spec.parts[1].id = spec.parts[0].id;
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("duplicate-part-id");
  });

  it("flags duplicate material ids", () => {
    const spec = clone(bookshelfSpec);
    spec.materials[1].id = spec.materials[0].id;
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("duplicate-material-id");
  });

  it("flags a sheet part whose thinnest dim does not match the sheet thickness", () => {
    const spec = clone(bookshelfSpec);
    spec.parts[0].size.w = 25; // side made of 18mm ply but 25mm thin
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("sheet-thickness-mismatch");
  });

  it("flags a sheet material with no thickness", () => {
    const spec = clone(bookshelfSpec);
    delete spec.materials[0].thickness;
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("sheet-missing-thickness");
  });

  it("flags an absurdly large bbox", () => {
    const spec = clone(bookshelfSpec);
    spec.bbox.h = 5000;
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("absurd-bbox");
  });

  it("flags a bbox tiny on every axis", () => {
    const spec = clone(bookshelfSpec);
    spec.bbox = { w: 40, h: 40, d: 40 };
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("absurd-bbox");
  });

  it("flags a part thinner than 3mm", () => {
    const spec = clone(bookshelfSpec);
    spec.parts[8].size.d = 2; // back panel 2mm
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("part-too-thin");
  });

  it("flags a zero-sized part", () => {
    const spec = clone(bookshelfSpec);
    spec.parts[0].size.h = 0;
    const { errors } = validateSpec(spec);
    expect(errors.map((e) => e.code)).toContain("non-positive-size");
  });
});

describe("validateSpec warnings", () => {
  it("warns on overlapping parts without erroring", () => {
    const spec = clone(bookshelfSpec);
    spec.parts[4].position.y = 8; // shelf-1 sinks into the bottom panel
    const { errors, warnings } = validateSpec(spec);
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.code)).toContain("parts-overlap");
  });

  it("warns on near-duplicate parts", () => {
    const spec = clone(bookshelfSpec);
    spec.parts.push({ ...clone(spec.parts[4]), id: "shelf-1-copy" });
    const { warnings } = validateSpec(spec);
    expect(warnings.map((w) => w.code)).toContain("near-duplicate-parts");
  });

  it("warns on a floating part", () => {
    const spec = clone(bookshelfSpec);
    spec.parts.push({
      id: "floater",
      name: "Floating block",
      shape: "box",
      // inside the bbox, mid-air between shelf-2 (y 700–718) and shelf-3 (y 1050–1068)
      size: { w: 100, h: 18, d: 100 },
      position: { x: 300, y: 900, z: 40 },
      materialId: "ply-18",
    });
    const { warnings } = validateSpec(spec);
    expect(warnings.map((w) => w.code)).toContain("floating-part");
  });
});
