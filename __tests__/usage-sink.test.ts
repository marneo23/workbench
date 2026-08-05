import { describe, expect, it, vi } from "vitest";
import { buildUsageRecord } from "@/lib/usage/record";
import {
  createUsageSink,
  databaseSink,
  neonUsageSink,
  safeWrite,
  usageDatabaseRow,
  type UsageRowWriter,
} from "@/lib/usage/sink";

const record = buildUsageRecord({
  userId: "alice",
  model: "test-model",
  mode: "refinement",
  label: "bookshelf-add-shelf",
  streaming: true,
  attempts: [
    {
      attempt: 1,
      tokens: {
        inputTokens: 10_000,
        cacheReadTokens: 2_000,
        outputTokens: 1_000,
      },
      reported: true,
      validationErrors: 0,
      estimated: false,
    },
  ],
  succeeded: true,
  durationMs: 1_234,
  promptChars: 42,
  inputParts: 10,
  outputParts: 11,
  now: () => new Date("2026-08-05T12:00:00.000Z"),
});

const rates = {
  "test-model": { input: 1.25, cachedInput: 0.125, output: 10 },
};

describe("usageDatabaseRow", () => {
  it("maps one generation request to dashboard-ready relational fields", () => {
    expect(usageDatabaseRow(record, rates)).toMatchObject({
      ts: "2026-08-05T12:00:00.000Z",
      userId: "alice",
      model: "test-model",
      mode: "refinement",
      label: "bookshelf-add-shelf",
      parts: 11,
      attempts: 1,
      tokensIn: 10_000,
      tokensOut: 1_000,
      tokensCached: 2_000,
      durationMs: 1_234,
      outcome: "success",
      costCents: 2.025,
      complete: true,
      estimated: false,
    });
  });

  it("stores an unknown cost as null rather than inventing a price", () => {
    expect(usageDatabaseRow(record, {}).costCents).toBeNull();
  });
});

describe("databaseSink", () => {
  it("writes exactly one mapped row per request", async () => {
    const writeRow = vi.fn<UsageRowWriter>().mockResolvedValue(undefined);
    const sink = databaseSink(writeRow, rates);

    await sink.write(record);

    expect(writeRow).toHaveBeenCalledOnce();
    expect(writeRow.mock.calls[0][0].userId).toBe("alice");
  });
});

describe("neonUsageSink", () => {
  it("does not load the database driver or connect until the first write", async () => {
    const writer = vi.fn<UsageRowWriter>().mockResolvedValue(undefined);
    const loadWriter = vi.fn(async () => writer);
    const sink = neonUsageSink("postgresql://example.invalid/db", rates, loadWriter);

    expect(loadWriter).not.toHaveBeenCalled();
    await sink.write(record);
    await sink.write(record);

    expect(loadWriter).toHaveBeenCalledOnce();
    expect(writer).toHaveBeenCalledTimes(2);
  });
});

describe("createUsageSink", () => {
  it("selects durable storage only when DATABASE_URL is configured", async () => {
    const database = { write: vi.fn().mockResolvedValue(undefined) };
    const factory = vi.fn(() => database);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const local = createUsageSink({}, factory);
    await local.write(record);
    expect(factory).not.toHaveBeenCalled();

    const durable = createUsageSink(
      {
        DATABASE_URL: "postgresql://example.invalid/db",
        USAGE_RATES: JSON.stringify(rates),
      },
      factory
    );
    await durable.write(record);

    expect(factory).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith(
      "postgresql://example.invalid/db",
      rates
    );
    expect(database.write).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("keeps a database failure from failing generation", async () => {
    const failure = new Error("database unavailable");
    const database = { write: vi.fn().mockRejectedValue(failure) };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sink = createUsageSink(
      { DATABASE_URL: "postgresql://example.invalid/db" },
      () => database
    );

    await expect(safeWrite(sink, record)).resolves.toBeUndefined();
    expect(database.write).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith("usage sink failed", failure);
    log.mockRestore();
    error.mockRestore();
  });
});
