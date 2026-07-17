"use client";

import { useState } from "react";
import { Viewport } from "./Viewport";
import { bookshelfSpec } from "@/lib/spec/examples";

export function Editor() {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [showScaleFigure, setShowScaleFigure] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);

  const spec = bookshelfSpec;
  const selected = spec.parts.find((p) => p.id === selectedPartId);

  return (
    <div className="relative flex-1">
      <Viewport
        spec={spec}
        selectedPartId={selectedPartId}
        onSelectPart={setSelectedPartId}
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

      {selected && (
        <div className="absolute bottom-4 left-4 rounded-lg bg-white/90 p-3 shadow backdrop-blur">
          <p className="text-sm font-medium text-slate-800">{selected.name}</p>
          <p className="font-mono text-xs text-slate-500">
            {selected.size.w} × {selected.size.h} × {selected.size.d} mm
          </p>
        </div>
      )}
    </div>
  );
}
