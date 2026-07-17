import { describe, expect, it } from "vitest";
import { buildCutList } from "@/lib/cutlist";
import { bookshelfSpec } from "@/lib/spec/examples";

describe("buildCutList", () => {
  const rows = buildCutList(bookshelfSpec);

  it("groups identical parts into one row", () => {
    // top + bottom + 4 shelves share material, dims, and grain → qty 6
    const shelfRow = rows.find((r) => r.qty === 6);
    expect(shelfRow).toBeDefined();
    expect(shelfRow!.length).toBe(764);
    expect(shelfRow!.width).toBe(294);
    expect(shelfRow!.thickness).toBe(18);
    expect(shelfRow!.names).toContain("Shelf 1");
    expect(shelfRow!.names).toContain("Top");
  });

  it("keeps the two sides as their own qty-2 row", () => {
    const sideRow = rows.find((r) => r.qty === 2);
    expect(sideRow).toBeDefined();
    expect(sideRow!.length).toBe(1800);
    expect(sideRow!.width).toBe(294);
    expect(sideRow!.thickness).toBe(18);
  });

  it("lists the back panel with its own material", () => {
    const backRow = rows.find((r) => r.materialId === "ply-6");
    expect(backRow).toBeDefined();
    expect(backRow!.qty).toBe(1);
    expect(backRow!.length).toBe(1800);
    expect(backRow!.width).toBe(800);
    expect(backRow!.thickness).toBe(6);
  });

  it("accounts for every part exactly once", () => {
    const total = rows.reduce((sum, r) => sum + r.qty, 0);
    expect(total).toBe(bookshelfSpec.parts.length);
  });

  it("orders rows by material then area descending", () => {
    const ply18Rows = rows.filter((r) => r.materialId === "ply-18");
    const areas = ply18Rows.map((r) => r.length * r.width);
    expect(areas).toEqual([...areas].sort((a, b) => b - a));
  });
});
