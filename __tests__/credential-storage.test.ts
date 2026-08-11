import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialStorage } from "@/lib/access/browser-storage";

describe("browser credential storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps bearer credentials in session storage rather than persistent local storage", () => {
    const sessionStorage = {} as Storage;
    const localStorage = {} as Storage;
    vi.stubGlobal("window", { sessionStorage, localStorage });

    expect(credentialStorage()).toBe(sessionStorage);
    expect(credentialStorage()).not.toBe(localStorage);
  });
});
