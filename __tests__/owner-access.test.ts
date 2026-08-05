import { describe, expect, it } from "vitest";
import { resolveOwnerAccess } from "@/lib/access/owner";

const ownerKey = "owner-dashboard-key-2026";

describe("resolveOwnerAccess", () => {
  it("authorizes only the configured owner credential", () => {
    expect(resolveOwnerAccess(ownerKey, ownerKey)).toEqual({ status: "authorized" });
    expect(resolveOwnerAccess(ownerKey, "alice-access-key-2026")).toEqual({
      status: "unauthorized",
    });
    expect(resolveOwnerAccess(ownerKey, null)).toEqual({ status: "unauthorized" });
  });

  it("fails closed when the owner credential is absent or malformed", () => {
    for (const configured of [
      undefined,
      "",
      "short",
      "owner key with spaces",
      "clé-propriétaire-2026",
    ]) {
      expect(resolveOwnerAccess(configured, ownerKey)).toEqual({
        status: "misconfigured",
      });
    }
  });

  it("rejects configuration that reuses a normal invite key", () => {
    expect(
      resolveOwnerAccess(
        ownerKey,
        ownerKey,
        JSON.stringify({ alice: ownerKey })
      )
    ).toEqual({ status: "misconfigured" });
  });

  it("fails closed when a present invite-key map is malformed", () => {
    for (const configuredUsers of [
      "not-json",
      JSON.stringify({ "invalid user": ownerKey }),
      JSON.stringify({ alice: ownerKey, bob: ownerKey }),
    ]) {
      expect(resolveOwnerAccess(ownerKey, ownerKey, configuredUsers)).toEqual({
        status: "misconfigured",
      });
    }
  });
});
