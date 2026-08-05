import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/owner/usage/route";

const ownerKey = "owner-dashboard-key-2026";
const userKey = "alice-access-key-2026";
const original = {
  owner: process.env.WORKBENCH_OWNER_KEY,
  users: process.env.WORKBENCH_ACCESS_KEYS,
  database: process.env.DATABASE_URL,
};

afterEach(() => {
  setEnv("WORKBENCH_OWNER_KEY", original.owner);
  setEnv("WORKBENCH_ACCESS_KEYS", original.users);
  setEnv("DATABASE_URL", original.database);
});

function setEnv(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

function request(key?: string) {
  return new Request("http://localhost/api/owner/usage", {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

describe("owner usage route", () => {
  it("fails closed when owner access is not configured", async () => {
    delete process.env.WORKBENCH_OWNER_KEY;
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an ordinary invite key before reading the database", async () => {
    process.env.WORKBENCH_OWNER_KEY = ownerKey;
    process.env.WORKBENCH_ACCESS_KEYS = JSON.stringify({ alice: userKey });
    delete process.env.DATABASE_URL;

    const response = await GET(request(userKey));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("rejects a shared owner and invite credential as misconfigured", async () => {
    process.env.WORKBENCH_OWNER_KEY = ownerKey;
    process.env.WORKBENCH_ACCESS_KEYS = JSON.stringify({ alice: ownerKey });

    const response = await GET(request(ownerKey));
    expect(response.status).toBe(503);
  });

  it("authorizes the owner before reporting missing storage", async () => {
    process.env.WORKBENCH_OWNER_KEY = ownerKey;
    process.env.WORKBENCH_ACCESS_KEYS = JSON.stringify({ alice: userKey });
    delete process.env.DATABASE_URL;

    const response = await GET(request(ownerKey));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Usage storage is not configured.",
    });
  });
});
