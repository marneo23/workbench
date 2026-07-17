"use client";

import { useEffect, useState } from "react";

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
  const [text, setText] = useState(String(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(String(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < min) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <label className="flex items-center gap-1">
      <span className="w-3 text-[10px] font-medium uppercase text-slate-400">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setText(String(value));
            setInvalid(false);
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
