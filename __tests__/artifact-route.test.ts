import { afterEach, describe, expect, it } from "vitest";
import {
  DELETE,
  GET,
} from "@/app/api/owner/artifacts/[id]/route";

const ownerKey = "owner-dashboard-key-2026";
const userKey = "alice-access-key-2026";
const artifactId = "550e8400-e29b-41d4-a716-446655440000";
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
  return new Request(`http://localhost/api/owner/artifacts/${artifactId}`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

const context = (id = artifactId) => ({ params: Promise.resolve({ id }) });

describe("owner artifact route", () => {
  it("rejects an ordinary invite key before reading storage", async () => {
    process.env.WORKBENCH_OWNER_KEY = ownerKey;
    process.env.WORKBENCH_ACCESS_KEYS = JSON.stringify({ p_test: userKey });
    delete process.env.DATABASE_URL;

    const response = await GET(request(userKey), context());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("requires configured storage after owner authorization", async () => {
    process.env.WORKBENCH_OWNER_KEY = ownerKey;
    process.env.WORKBENCH_ACCESS_KEYS = JSON.stringify({ p_test: userKey });
    delete process.env.DATABASE_URL;

    const getResponse = await GET(request(ownerKey), context());
    const deleteResponse = await DELETE(request(ownerKey), context());

    expect(getResponse.status).toBe(503);
    expect(deleteResponse.status).toBe(503);
  });

  it("rejects malformed artifact ids", async () => {
    process.env.WORKBENCH_OWNER_KEY = ownerKey;
    process.env.WORKBENCH_ACCESS_KEYS = JSON.stringify({ p_test: userKey });
    process.env.DATABASE_URL = "postgresql://example.invalid/db";

    const response = await GET(request(ownerKey), context("not-an-id"));

    expect(response.status).toBe(400);
  });
});
