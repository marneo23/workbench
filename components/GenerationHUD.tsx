"use client";

import { useEffect, useState } from "react";
import { useSpecStore, type GenStage } from "@/store/useSpecStore";

/**
 * The wait experience: an honest staged stepper, a decelerating ribbed bar,
 * content-specific microcopy (the "labor illusion"), and a real streamed
 * part count. No fake percentages, no fabricated countdown — every signal
 * reflects real work or the honest 30–90s range.
 */

const STEPS: { stage: GenStage; label: string }[] = [
  { stage: "understanding", label: "Understanding your description" },
  { stage: "dimensions", label: "Deriving dimensions" },
  { stage: "parts", label: "Resolving joinery & parts" },
  { stage: "validating", label: "Validating structure" },
  { stage: "rendering", label: "Rendering preview" },
];

const MICROCOPY: Record<GenStage, string[]> = {
  understanding: ["Reading your brief…", "Interpreting the piece…"],
  dimensions: [
    "Sizing the carcass panels…",
    "Deriving panel dimensions…",
    "Working out interior spans…",
  ],
  parts: [
    "Cutting the panels to size…",
    "Placing shelf dados…",
    "Fitting the joinery…",
    "Squaring up the frame…",
  ],
  validating: [
    "Checking parts fit the bounding box…",
    "Making the cut list add up…",
  ],
  rendering: ["Assembling the preview…"],
};

export function GenerationHUD() {
  const status = useSpecStore((s) => s.status);
  if (status !== "generating") return null;
  return <ActiveGenerationHUD />;
}

/** Mounted fresh for each generation, so timer state starts at zero naturally. */
function ActiveGenerationHUD() {
  const stage = useSpecStore((s) => s.stage);
  const partsCount = useSpecStore((s) => s.pending?.parts.length ?? 0);

  const [elapsed, setElapsed] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const activeIdx = Math.max(
    0,
    STEPS.findIndex((s) => s.stage === stage)
  );
  const label = STEPS[activeIdx]?.label ?? "Working…";
  const lines = MICROCOPY[stage] ?? [];
  const micro = lines.length ? lines[tick % lines.length] : "";

  return (
    <div className="mb-2 rounded-xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <div className="h-1 w-full overflow-hidden rounded-full ribbed-bar" />

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="shrink-0 text-[11px] tabular-nums text-slate-400">
          {partsCount > 0 && (
            <span className="text-slate-500">
              {partsCount} part{partsCount > 1 ? "s" : ""} ·{" "}
            </span>
          )}
          {elapsed}s
        </p>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <span
            key={s.stage}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < activeIdx
                ? "bg-sky-400"
                : i === activeIdx
                  ? "bg-sky-500"
                  : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      <p className="mt-1.5 text-[11px] text-slate-400">
        {micro && <span>{micro} · </span>}typically 30–90s for complex pieces.
      </p>
    </div>
  );
}
