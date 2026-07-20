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
  /** scale-figure position [x, z] in scene mm; null = default beside the model */
  scaleFigurePos: [number, number] | null;
  /** replace the whole spec (LLM result); clears stale selection */
  setSpec: (spec: FurnitureSpec) => void;
  updatePart: (id: string, patch: { size?: Size3; position?: Vec3 }) => void;
  /** direct-manipulation resize: set part geometry and grow the bbox to fit */
  resizePart: (id: string, size: Size3, position: Vec3) => void;
  setBbox: (bbox: Size3) => void;
  selectPart: (id: string | null) => void;
  setStatus: (status: EditorStatus) => void;
  setError: (error: string | null) => void;
  setScaleFigurePos: (pos: [number, number]) => void;
}

export const useSpecStore = create<SpecState>()(
  temporal(
    (set) => ({
      spec: bookshelfSpec,
      selectedPartId: null,
      status: "idle",
      error: null,
      scaleFigurePos: null,

      setSpec: (spec) =>
        set((state) => ({
          spec,
          selectedPartId: spec.parts.some((p) => p.id === state.selectedPartId)
            ? state.selectedPartId
            : null,
          error: null,
          // New piece: send the scale figure back to its default spot beside it.
          scaleFigurePos: null,
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

      resizePart: (id, size, position) =>
        set((state) => {
          const parts = state.spec.parts.map((p) =>
            p.id === id ? { ...p, size, position } : p
          );
          // Grow the bounding box to contain the resized part (never shrink),
          // so a drag past the current bounds enlarges the whole piece instead
          // of producing an out-of-bounds error.
          const bbox = {
            w: Math.max(state.spec.bbox.w, position.x + size.w),
            h: Math.max(state.spec.bbox.h, position.y + size.h),
            d: Math.max(state.spec.bbox.d, position.z + size.d),
          };
          return { spec: { ...state.spec, parts, bbox } };
        }),

      setBbox: (bbox) => set((state) => ({ spec: { ...state.spec, bbox } })),

      selectPart: (id) => set({ selectedPartId: id }),
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error }),
      setScaleFigurePos: (pos) => set({ scaleFigurePos: pos }),
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
