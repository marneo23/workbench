"use client";

import { useState } from "react";
import { useSpecStore } from "@/store/useSpecStore";

/**
 * Client-side PDF export — zero server compute. The generator is imported on
 * demand so pdf-lib stays out of the initial bundle.
 */
export function ExportButton() {
  const spec = useSpecStore((s) => s.spec);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const { generateFurniturePdf } = await import("@/lib/pdf/generate");
      const bytes = await generateFurniturePdf(spec);
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${spec.name.toLowerCase().replace(/\s+/g, "-")}-plan.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleExport}
        disabled={busy}
        className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white shadow transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "Drawing…" : "Export PDF plan"}
      </button>
      {error && <p className="max-w-[200px] text-right text-[11px] text-red-600">{error}</p>}
      <p className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-500 backdrop-blur">
        Measured from your model, not drawn by AI.
      </p>
    </div>
  );
}
