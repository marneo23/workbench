import { describe, expect, it } from "vitest";
import { generateFurniturePdf, pickScale } from "@/lib/pdf/generate";
import { bookshelfSpec } from "@/lib/spec/examples";
import { PDFDocument } from "pdf-lib";

describe("pickScale", () => {
  it("picks 1:20 for the 1800mm bookshelf", () => {
    expect(pickScale(bookshelfSpec)).toBe(20);
  });

  it("picks a larger drawing for a small piece", () => {
    const small = {
      ...bookshelfSpec,
      bbox: { w: 400, h: 300, d: 250 },
    };
    expect(pickScale(small)).toBeLessThan(20);
  });
});

describe("generateFurniturePdf", () => {
  it("produces a parseable 3-page A4-landscape PDF", async () => {
    const bytes = await generateFurniturePdf(bookshelfSpec);
    expect(bytes.length).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(841.89, 0);
    expect(height).toBeCloseTo(595.28, 0);
    expect(doc.getTitle()).toContain("Bookshelf");
  });
});
