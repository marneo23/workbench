import { describe, expect, it, vi } from "vitest";
import {
  bindWindowDrag,
  dimensionDraftForValue,
  nextActiveDragCount,
  type DimensionDraft,
} from "@/lib/ui/interaction-state";

describe("dimension input state", () => {
  it("discards valid and invalid drafts when the committed value changes", () => {
    const drafts: DimensionDraft[] = [
      { sourceValue: 100, text: "120", invalid: false },
      { sourceValue: 100, text: "bad", invalid: true },
    ];

    for (const draft of drafts) {
      expect(dimensionDraftForValue(draft, 100)).toBe(draft);
      expect(dimensionDraftForValue(draft, 200)).toBeNull();
    }
  });
});

describe("drag ownership", () => {
  it("balances overlapping drag starts and finishes without going negative", () => {
    expect(nextActiveDragCount(0, true)).toBe(1);
    expect(nextActiveDragCount(1, true)).toBe(2);
    expect(nextActiveDragCount(2, false)).toBe(1);
    expect(nextActiveDragCount(1, false)).toBe(0);
    expect(nextActiveDragCount(0, false)).toBe(0);
  });

  it("finishes once on pointer cancel and removes every listener", () => {
    const target = new EventTarget();
    const onMove = vi.fn();
    const onFinish = vi.fn();
    const cleanup = bindWindowDrag(target, onMove, onFinish);

    target.dispatchEvent(new Event("pointermove"));
    target.dispatchEvent(new Event("pointercancel"));
    target.dispatchEvent(new Event("pointermove"));
    target.dispatchEvent(new Event("pointerup"));
    target.dispatchEvent(new Event("blur"));
    cleanup();

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("uses the same idempotent finish path for blur and unmount cleanup", () => {
    for (const finish of ["blur", "cleanup"] as const) {
      const target = new EventTarget();
      const onFinish = vi.fn();
      const cleanup = bindWindowDrag(target, vi.fn(), onFinish);

      if (finish === "blur") target.dispatchEvent(new Event("blur"));
      else cleanup();
      cleanup();

      expect(onFinish).toHaveBeenCalledTimes(1);
    }
  });
});
