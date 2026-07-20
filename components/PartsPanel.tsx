"use client";

import { useEffect, useRef } from "react";
import { useSpecStore } from "@/store/useSpecStore";
import { DimensionInput } from "./DimensionInput";
import type { Part } from "@/lib/spec/schema";

function PartRow({ part, selected }: { part: Part; selected: boolean }) {
  const updatePart = useSpecStore((s) => s.updatePart);
  const selectPart = useSpecStore((s) => s.selectPart);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the row visible when the part is picked in the 3D viewport.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div
      ref={ref}
      onClick={() => selectPart(part.id)}
      className={`cursor-pointer rounded-md border px-2 py-1.5 transition-colors ${
        selected
          ? "border-amber-400 bg-amber-50"
          : "border-transparent hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      <p className="mb-1 truncate text-xs font-medium text-slate-700">{part.name}</p>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <DimensionInput
          label="W"
          value={part.size.w}
          min={1}
          onCommit={(w) => updatePart(part.id, { size: { ...part.size, w } })}
        />
        <DimensionInput
          label="H"
          value={part.size.h}
          min={1}
          onCommit={(h) => updatePart(part.id, { size: { ...part.size, h } })}
        />
        <DimensionInput
          label="D"
          value={part.size.d}
          min={1}
          onCommit={(d) => updatePart(part.id, { size: { ...part.size, d } })}
        />
      </div>
      {selected && (
        <div className="mt-1.5 flex gap-2 border-t border-amber-200 pt-1.5" onClick={(e) => e.stopPropagation()}>
          <DimensionInput
            label="X"
            value={part.position.x}
            onCommit={(x) => updatePart(part.id, { position: { ...part.position, x } })}
          />
          <DimensionInput
            label="Y"
            value={part.position.y}
            onCommit={(y) => updatePart(part.id, { position: { ...part.position, y } })}
          />
          <DimensionInput
            label="Z"
            value={part.position.z}
            onCommit={(z) => updatePart(part.id, { position: { ...part.position, z } })}
          />
        </div>
      )}
    </div>
  );
}

export function PartsPanel() {
  const spec = useSpecStore((s) => s.spec);
  const selectedPartId = useSpecStore((s) => s.selectedPartId);
  const setBbox = useSpecStore((s) => s.setBbox);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Overall size
        </h2>
        <div className="flex gap-2">
          <DimensionInput
            label="W"
            value={spec.bbox.w}
            min={1}
            onCommit={(w) => setBbox({ ...spec.bbox, w })}
          />
          <DimensionInput
            label="H"
            value={spec.bbox.h}
            min={1}
            onCommit={(h) => setBbox({ ...spec.bbox, h })}
          />
          <DimensionInput
            label="D"
            value={spec.bbox.d}
            min={1}
            onCommit={(d) => setBbox({ ...spec.bbox, d })}
          />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Resizing the box doesn&apos;t move parts. For structural changes, ask in
          words — e.g. &ldquo;make it 200mm wider&rdquo;.
        </p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        <h2 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Parts · {spec.parts.length}
        </h2>
        <p className="px-1 pb-1 text-[11px] leading-snug text-slate-400">
          Select a part to get drag arrows in the 3D view, or edit its numbers here.
        </p>
        {spec.parts.map((part) => (
          <PartRow key={part.id} part={part} selected={part.id === selectedPartId} />
        ))}
      </div>
    </aside>
  );
}
