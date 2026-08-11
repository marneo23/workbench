import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCredential,
  credentialStorage,
  readCredential,
} from "@/lib/access/browser-storage";

describe("browser credential storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps bearer credentials in session storage rather than persistent local storage", () => {
    const sessionStorage = {} as Storage;
    const localStorage = {} as Storage;
    vi.stubGlobal("window", { sessionStorage, localStorage });

    expect(credentialStorage()).toBe(sessionStorage);
    expect(credentialStorage()).not.toBe(localStorage);
  });

  it("clears legacy persistent credentials as well as the current session", () => {
    const sessionStorage = { removeItem: vi.fn() } as unknown as Storage;
    const localStorage = { removeItem: vi.fn() } as unknown as Storage;
    vi.stubGlobal("window", { sessionStorage, localStorage });

    clearCredential("workbench:test-key");

    expect(sessionStorage.removeItem).toHaveBeenCalledWith("workbench:test-key");
    expect(localStorage.removeItem).toHaveBeenCalledWith("workbench:test-key");
  });

  it("reads the current session while purging a legacy persistent copy", () => {
    const sessionStorage = {
      getItem: vi.fn().mockReturnValue("session-key"),
    } as unknown as Storage;
    const localStorage = { removeItem: vi.fn() } as unknown as Storage;
    vi.stubGlobal("window", { sessionStorage, localStorage });

    expect(readCredential("workbench:test-key")).toBe("session-key");
    expect(localStorage.removeItem).toHaveBeenCalledWith("workbench:test-key");
  });
});
