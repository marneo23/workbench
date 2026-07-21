"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSpecStore } from "@/store/useSpecStore";

/**
 * A live "build log" during generation, narrating the piece as it assembles.
 * Every line is derived deterministically from the streamed spec (real cut
 * dimensions and materials) — never fabricated "reasoning". Doubles as
 * onboarding: the rotating tips teach features new users haven't found.
 */

const TIPS = [
  "Tip: click any part to edit its exact dimensions.",
  "Tip: drag the 1.70 m figure to sanity-check the scale.",
  'Tip: refine in words — "make it 200 mm wider".',
  "Tip: export a carpenter-ready PDF when you're happy.",
];

export function BuildLog() {
  const status = useSpecStore((s) => s.status);
  const pending = useSpecStore((s) => s.pending);
  const generating = status === "generating";

  const entries = useMemo(() => {
    if (!pending) return [];
    const matName = (id: string) =>
      pending.materials.find((m) => m.id === id)?.name ?? id;
    const lines = [`Overall ${pending.bbox.w}×${pending.bbox.h}×${pending.bbox.d} mm`];
    for (const p of pending.parts) {
      lines.push(
        `Cut ${p.name} — ${p.size.w}×${p.size.h}×${p.size.d} mm · ${matName(p.materialId)}`
      );
    }
    return lines;
  }, [pending]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries.length]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(id);
  }, [generating]);

  if (!generating || entries.length === 0) return null;

  return (
    <div className="absolute left-4 top-40 w-64 rounded-lg bg-white/90 p-3 shadow backdrop-blur">
      <p className="mb-1.5 text-xs font-semibold text-slate-700">Build log</p>
      <div ref={scrollRef} className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
        {entries.map((line, i) => (
          <p
            key={i}
            className="font-mono text-[10px] leading-snug text-slate-500"
          >
            <span className="text-sky-500">›</span> {line}
          </p>
        ))}
      </div>
      <p className="mt-2 border-t border-slate-200 pt-1.5 text-[10px] leading-snug text-slate-400">
        {TIPS[tick % TIPS.length]}
      </p>
    </div>
  );
}
