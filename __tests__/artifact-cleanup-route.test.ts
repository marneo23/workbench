import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/artifacts/route";

const cronSecret = "cron-cleanup-secret-2026";
const original = {
  cron: process.env.CRON_SECRET,
  database: process.env.DATABASE_URL,
};

afterEach(() => {
  setEnv("CRON_SECRET", original.cron);
  setEnv("DATABASE_URL", original.database);
});

function setEnv(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

function request(secret?: string) {
  return new Request("http://localhost/api/cron/artifacts", {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

describe("artifact cleanup cron route", () => {
  it("fails closed when the cron secret is missing", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.DATABASE_URL;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects requests without the configured cron secret before storage", async () => {
    process.env.CRON_SECRET = cronSecret;
    delete process.env.DATABASE_URL;

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("requires storage only after cron authorization", async () => {
    process.env.CRON_SECRET = cronSecret;
    delete process.env.DATABASE_URL;

    const response = await GET(request(cronSecret));

    expect(response.status).toBe(503);
  });
});
