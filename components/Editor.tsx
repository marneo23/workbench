"use client";

import { useEffect, useMemo, useState } from "react";
import { Viewport } from "./Viewport";
import { PartsPanel } from "./PartsPanel";
import { ExportButton } from "./ExportButton";
import { PromptBar } from "./PromptBar";
import { BuildLog } from "./BuildLog";
import { redoSpec, undoSpec, useSpecStore } from "@/store/useSpecStore";
import { validateSpec } from "@/lib/spec/validate";

export function Editor() {
  const spec = useSpecStore((s) => s.spec);
  const selectedPartId = useSpecStore((s) => s.selectedPartId);
  const selectPart = useSpecStore((s) => s.selectPart);

  const [showScaleFigure, setShowScaleFigure] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);

  // Warnings are always derived from the current spec, never stored.
  const warnings = useMemo(() => validateSpec(spec).warnings, [spec]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if (inField || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoSpec();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redoSpec();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="relative flex-1">
        <Viewport
          spec={spec}
          selectedPartId={selectedPartId}
          onSelectPart={selectPart}
          showScaleFigure={showScaleFigure}
          showDimensions={showDimensions}
        />

        <div className="absolute left-4 top-4 flex flex-col gap-2 rounded-lg bg-white/90 p-3 shadow backdrop-blur">
          <h1 className="text-sm font-semibold text-slate-800">{spec.name}</h1>
          <p className="font-mono text-xs text-slate-500">
            {spec.bbox.w} × {spec.bbox.h} × {spec.bbox.d} mm
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showScaleFigure}
              onChange={(e) => setShowScaleFigure(e.target.checked)}
            />
            Scale figure (1.70 m)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showDimensions}
              onChange={(e) => setShowDimensions(e.target.checked)}
            />
            Dimensions
          </label>
        </div>

        <BuildLog />

        <div className="absolute bottom-4 right-4">
          <ExportButton />
        </div>

        <PromptBar />

        {warnings.length > 0 && (
          <div className="absolute right-4 top-4 max-w-xs rounded-lg bg-amber-50/95 p-3 shadow backdrop-blur">
            <p className="mb-1 text-xs font-semibold text-amber-800">
              {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </p>
            <ul className="space-y-1">
              {warnings.slice(0, 5).map((w, i) => (
                <li key={i} className="text-[11px] leading-snug text-amber-700">
                  {w.message}
                </li>
              ))}
              {warnings.length > 5 && (
                <li className="text-[11px] text-amber-600">…and {warnings.length - 5} more</li>
              )}
            </ul>
          </div>
        )}
      </div>

      <PartsPanel />
    </div>
  );
}
