import { describe, expect, it } from "vitest";
import {
  accessStatus,
  bearerToken,
  resolveAccess,
} from "@/lib/access/keys";
import { authorizationHeaders } from "@/lib/access/client";

const configured = JSON.stringify({
  martin: "martin-access-key-2026",
  alice: "alice-access-key-2026",
});

describe("bearerToken", () => {
  it("extracts only a non-empty Bearer credential", () => {
    expect(bearerToken("Bearer martin-access-key-2026")).toBe(
      "martin-access-key-2026"
    );
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer   ")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("accepts case-insensitive Bearer schemes and repeated spaces", () => {
    expect(bearerToken("bearer martin-access-key-2026")).toBe(
      "martin-access-key-2026"
    );
    expect(bearerToken("BEARER   martin-access-key-2026")).toBe(
      "martin-access-key-2026"
    );
  });
});

describe("authorizationHeaders", () => {
  it("sends a bearer credential only when a key is present", () => {
    expect(authorizationHeaders("martin-access-key-2026")).toEqual({
      Authorization: "Bearer martin-access-key-2026",
    });
    expect(authorizationHeaders("")).toEqual({});
  });
});

describe("resolveAccess", () => {
  it("maps a valid key to its stable user id", () => {
    expect(resolveAccess(configured, "alice-access-key-2026", true)).toEqual({
      status: "authorized",
      userId: "alice",
    });
  });

  it("rejects missing and unknown keys without revealing valid users", () => {
    expect(resolveAccess(configured, null, true)).toEqual({
      status: "unauthorized",
    });
    expect(resolveAccess(configured, "unknown-access-key", true)).toEqual({
      status: "unauthorized",
    });
  });

  it("fails closed when production has no access-key configuration", () => {
    expect(resolveAccess(undefined, null, true)).toEqual({
      status: "misconfigured",
    });
  });

  it("allows an attributed local identity when development is unconfigured", () => {
    expect(resolveAccess(undefined, null, false)).toEqual({
      status: "authorized",
      userId: "local",
    });
  });

  it("fails closed for malformed, duplicate, or weak key configuration", () => {
    expect(resolveAccess("not-json", null, false).status).toBe("misconfigured");
    expect(
      resolveAccess(
        JSON.stringify({ alice: "same-access-key-2026", bob: "same-access-key-2026" }),
        null,
        false
      ).status
    ).toBe("misconfigured");
    expect(resolveAccess(JSON.stringify({ alice: "short" }), null, false).status).toBe(
      "misconfigured"
    );
  });

  it("rejects configured keys that cannot be carried as Bearer credentials", () => {
    for (const key of [
      "12345678 12345678",
      "12345678\t12345678",
      "12345678\n12345678",
      "clé-d’accès-très-longue",
    ]) {
      expect(resolveAccess(JSON.stringify({ alice: key }), null, false).status).toBe(
        "misconfigured"
      );
    }
  });
});

describe("accessStatus", () => {
  it("reports whether the client must present a key without exposing configuration", () => {
    expect(accessStatus(configured, true)).toEqual({
      required: true,
      configured: true,
    });
    expect(accessStatus(undefined, false)).toEqual({
      required: false,
      configured: true,
    });
    expect(accessStatus(undefined, true)).toEqual({
      required: true,
      configured: false,
    });
  });
});
