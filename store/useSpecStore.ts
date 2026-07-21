"use client";

import { create } from "zustand";
import { temporal } from "zundo";
import type {
  FurnitureSpec,
  Material,
  Part,
  Size3,
  Vec3,
} from "@/lib/spec/schema";
import { bookshelfSpec } from "@/lib/spec/examples";

export type EditorStatus = "idle" | "generating";

/** Honest, ordered stages of a generation, surfaced in the wait UI. */
export type GenStage =
  | "understanding"
  | "dimensions"
  | "parts"
  | "validating"
  | "rendering";

/** A spec that is still streaming in, assembled part-by-part in the viewport. */
export interface PendingSpec {
  name: string;
  bbox: Size3;
  materials: Material[];
  parts: Part[];
}

interface SpecState {
  spec: FurnitureSpec;
  selectedPartId: string | null;
  status: EditorStatus;
  stage: GenStage;
  /** streamed-in-progress spec, or null when not streaming a preview */
  pending: PendingSpec | null;
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
  // --- generation / streaming lifecycle ---
  beginGenerating: () => void;
  setStage: (stage: GenStage) => void;
  /** bbox + materials arrived: seed the empty pending assembly */
  setPendingMeta: (meta: Omit<PendingSpec, "parts">) => void;
  /** one newly-closed part arrived over the stream */
  addPendingPart: (part: Part) => void;
  /** clear the streamed preview (on done, cancel, error, or before a retry) */
  clearPending: () => void;
  /** cancel/abort: back to idle, keep prompt + last committed spec */
  endGenerating: () => void;
}

export const useSpecStore = create<SpecState>()(
  temporal(
    (set) => ({
      spec: bookshelfSpec,
      selectedPartId: null,
      status: "idle",
      stage: "understanding",
      pending: null,
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

      beginGenerating: () =>
        set({
          status: "generating",
          stage: "understanding",
          pending: null,
          error: null,
        }),
      setStage: (stage) => set({ stage }),
      setPendingMeta: (meta) =>
        set({ pending: { ...meta, parts: [] }, stage: "parts" }),
      addPendingPart: (part) =>
        set((state) =>
          state.pending
            ? { pending: { ...state.pending, parts: [...state.pending.parts, part] } }
            : {}
        ),
      clearPending: () => set({ pending: null }),
      endGenerating: () => set({ status: "idle", pending: null }),
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
