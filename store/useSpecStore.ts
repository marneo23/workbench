"use client";

import { create } from "zustand";
import { temporal } from "zundo";
import type { FurnitureSpec, Size3, Vec3 } from "@/lib/spec/schema";
import { bookshelfSpec } from "@/lib/spec/examples";

export type EditorStatus = "idle" | "generating";

interface SpecState {
  spec: FurnitureSpec;
  selectedPartId: string | null;
  status: EditorStatus;
  error: string | null;
  /** replace the whole spec (LLM result); clears stale selection */
  setSpec: (spec: FurnitureSpec) => void;
  updatePart: (id: string, patch: { size?: Size3; position?: Vec3 }) => void;
  setBbox: (bbox: Size3) => void;
  selectPart: (id: string | null) => void;
  setStatus: (status: EditorStatus) => void;
  setError: (error: string | null) => void;
}

export const useSpecStore = create<SpecState>()(
  temporal(
    (set) => ({
      spec: bookshelfSpec,
      selectedPartId: null,
      status: "idle",
      error: null,

      setSpec: (spec) =>
        set((state) => ({
          spec,
          selectedPartId: spec.parts.some((p) => p.id === state.selectedPartId)
            ? state.selectedPartId
            : null,
          error: null,
        })),

      updatePart: (id, patch) =>
        set((state) => ({
          spec: {
            ...state.spec,
            parts: state.spec.parts.map((p) =>
              p.id === id
                ? {
                    ...p,
                    ...(patch.size ? { size: patch.size } : {}),
                    ...(patch.position ? { position: patch.position } : {}),
                  }
                : p
            ),
          },
        })),

      setBbox: (bbox) => set((state) => ({ spec: { ...state.spec, bbox } })),

      selectPart: (id) => set({ selectedPartId: id }),
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error }),
    }),
    {
      // Only the spec belongs in undo history — not selection or async status.
      partialize: (state) => ({ spec: state.spec }),
      equality: (a, b) => a.spec === b.spec,
      limit: 100,
    }
  )
);

export function undoSpec() {
  useSpecStore.temporal.getState().undo();
}

export function redoSpec() {
  useSpecStore.temporal.getState().redo();
}
