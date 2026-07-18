"use client";

import { useEffect, useState } from "react";
import { useSpecStore } from "@/store/useSpecStore";
import { bookshelfSpec } from "@/lib/spec/examples";
import { FurnitureSpecSchema } from "@/lib/spec/schema";

/**
 * Natural-language prompt input. First prompt generates a fresh design; once
 * the spec has been generated or edited, prompts refine the current spec
 * (the API's system prompt handles "actually make me a desk instead").
 */
export function PromptBar() {
  const spec = useSpecStore((s) => s.spec);
  const status = useSpecStore((s) => s.status);
  const error = useSpecStore((s) => s.error);
  const setSpec = useSpecStore((s) => s.setSpec);
  const setStatus = useSpecStore((s) => s.setStatus);
  const setError = useSpecStore((s) => s.setError);

  const [prompt, setPrompt] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const generating = status === "generating";

  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [generating]);
  // Untouched example → new design; anything else → refinement.
  const pristine = spec === bookshelfSpec;

  const submit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    setStatus("generating");
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          ...(pristine ? {} : { currentSpec: spec }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.spec) {
        setError(data?.error ?? `Generation failed (${res.status}).`);
        return;
      }
      const parsed = FurnitureSpecSchema.safeParse(data.spec);
      if (!parsed.success) {
        setError("Server returned an invalid spec.");
        return;
      }
      setSpec(parsed.data);
      setPrompt("");
    } catch {
      setError("Network error — is the dev server running?");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 w-full max-w-xl -translate-x-1/2 px-4">
      {error && (
        <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2 rounded-xl bg-white/95 p-2 shadow-lg backdrop-blur">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={
            pristine
              ? 'Describe furniture — e.g. "bookshelf 1800 tall, 800 wide, 4 shelves"'
              : 'Refine it — e.g. "make it 200mm wider" or "add a shelf"'
          }
          disabled={generating}
          className="flex-1 bg-transparent px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        <button
          onClick={submit}
          disabled={generating || !prompt.trim()}
          className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
        >
          {generating ? "Designing…" : pristine ? "Generate" : "Refine"}
        </button>
      </div>
      {generating && (
        <p className="mt-1.5 text-center text-[11px] tabular-nums text-slate-500">
          Deriving dimensions… {elapsed}s · typically 30–90s for complex pieces.
        </p>
      )}
    </div>
  );
}
