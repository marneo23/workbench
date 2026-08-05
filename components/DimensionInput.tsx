"use client";

import { useState } from "react";
import {
  dimensionDraftForValue,
  type DimensionDraft,
} from "@/lib/ui/interaction-state";

interface DimensionInputProps {
  label: string;
  /** committed value, mm */
  value: number;
  onCommit: (value: number) => void;
  /** smallest value the field accepts, mm */
  min?: number;
}

/**
 * Numeric mm field that never corrupts the spec: keystrokes stay local, and
 * only a parseable value >= min is committed (on blur or Enter). Invalid text
 * is held with an inline error until fixed or blurred away.
 */
export function DimensionInput({ label, value, onCommit, min = 0 }: DimensionInputProps) {
  const [draft, setDraft] = useState<DimensionDraft | null>(null);
  const currentDraft = dimensionDraftForValue(draft, value);
  if (draft && !currentDraft) {
    // Discard rather than merely hide stale text. Otherwise a later undo back
    // to sourceValue would resurrect an obsolete draft.
    setDraft(null);
  }
  // If a gizmo or undo changes the committed value while this field is still
  // mounted, an old draft must not cover it. Derive the reset during render
  // instead of synchronously setting state from an effect.
  const text = currentDraft?.text ?? String(value);
  const invalid = currentDraft?.invalid ?? false;

  const commit = () => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < min) {
      setDraft({ sourceValue: value, text, invalid: true });
      return;
    }
    setDraft(null);
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <label className="flex items-center gap-1">
      <span className="w-3 text-[10px] font-medium uppercase text-slate-400">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) =>
          setDraft({ sourceValue: value, text: e.target.value, invalid: false })
        }
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(null);
          }
        }}
        className={`w-16 rounded border px-1.5 py-0.5 font-mono text-xs text-slate-800 outline-none focus:ring-1 ${
          invalid
            ? "border-red-400 bg-red-50 focus:ring-red-300"
            : "border-slate-300 bg-white focus:ring-sky-300"
        }`}
        title={invalid ? `Enter a number ≥ ${min}` : undefined}
      />
    </label>
  );
}
