import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { bookshelfSpec } from "@/lib/spec/examples";
import { FurnitureSpecSchema } from "@/lib/spec/schema";

describe("application security headers", () => {
  it("sets browser hardening headers on every route", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    const rules = await nextConfig.headers!();
    const allRoutes = rules.find((rule) => rule.source === "/:path*");
    const headers = new Map(
      allRoutes?.headers.map(({ key, value }) => [key.toLowerCase(), value])
    );

    expect(headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });
});

describe("request spec bounds", () => {
  it("rejects an unbounded material collection", () => {
    const materials = Array.from({ length: 21 }, (_, index) => ({
      ...bookshelfSpec.materials[0],
      id: `material-${index}`,
    }));

    expect(
      FurnitureSpecSchema.safeParse({ ...bookshelfSpec, materials }).success
    ).toBe(false);
  });

  it("rejects oversized text fields in refinement specs", () => {
    const cases = [
      { ...bookshelfSpec, name: "n".repeat(121) },
      { ...bookshelfSpec, notes: "n".repeat(2001) },
      {
        ...bookshelfSpec,
        materials: [
          { ...bookshelfSpec.materials[0], name: "n".repeat(121) },
        ],
      },
      {
        ...bookshelfSpec,
        parts: [
          { ...bookshelfSpec.parts[0], joinery: "j".repeat(501) },
        ],
      },
    ];

    for (const spec of cases) {
      expect(FurnitureSpecSchema.safeParse(spec).success).toBe(false);
    }
  });
});
