"use client";

import { useRef, useState } from "react";
import { useSpecStore } from "@/store/useSpecStore";
import { bookshelfSpec } from "@/lib/spec/examples";
import {
  FurnitureSpecSchema,
  PartSchema,
  type FurnitureSpec,
} from "@/lib/spec/schema";
import { GenerationHUD } from "./GenerationHUD";

/**
 * Natural-language prompt input. First prompt generates a fresh design; once
 * the spec has been generated or edited, prompts refine the current spec.
 *
 * The response streams as NDJSON: the piece assembles part-by-part in the
 * viewport while the wait UI (GenerationHUD) narrates honest progress. A
 * Cancel button aborts in flight; failures keep the prompt and offer Retry.
 */
export function PromptBar() {
  const spec = useSpecStore((s) => s.spec);
  const status = useSpecStore((s) => s.status);
  const error = useSpecStore((s) => s.error);
  const setSpec = useSpecStore((s) => s.setSpec);
  const setError = useSpecStore((s) => s.setError);
  const setStatus = useSpecStore((s) => s.setStatus);
  const setStage = useSpecStore((s) => s.setStage);
  const beginGenerating = useSpecStore((s) => s.beginGenerating);
  const setPendingMeta = useSpecStore((s) => s.setPendingMeta);
  const addPendingPart = useSpecStore((s) => s.addPendingPart);
  const clearPending = useSpecStore((s) => s.clearPending);
  const endGenerating = useSpecStore((s) => s.endGenerating);

  const [prompt, setPrompt] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const lastAttempt = useRef<{ prompt: string; currentSpec?: FurnitureSpec } | null>(
    null
  );

  const generating = status === "generating";
  // Untouched example → new design; anything else → refinement.
  const pristine = spec === bookshelfSpec;

  const commit = (raw: unknown) => {
    const parsed = FurnitureSpecSchema.safeParse(raw);
    if (!parsed.success) {
      setError("Server returned an invalid spec.");
      endGenerating();
      return;
    }
    setStage("rendering");
    setSpec(parsed.data); // clears error, resets selection + scale figure
    clearPending();
    setStatus("idle");
    setPrompt("");
  };

  const handleEvent = (ev: { type?: string } & Record<string, unknown>) => {
    switch (ev.type) {
      case "meta":
        setPendingMeta({
          name: String(ev.name ?? "Design"),
          bbox: ev.bbox as FurnitureSpec["bbox"],
          materials: ev.materials as FurnitureSpec["materials"],
        });
        break;
      case "part": {
        const p = PartSchema.safeParse(ev.part);
        if (p.success) addPendingPart(p.data);
        break;
      }
      case "reset":
        clearPending();
        setStage("dimensions");
        break;
      case "done":
        commit(ev.spec);
        break;
      case "error": {
        const details = Array.isArray(ev.details)
          ? (ev.details as string[]).slice(0, 3).join("; ")
          : "";
        setError(
          details
            ? `${String(ev.error ?? "Generation failed.")} (${details})`
            : String(ev.error ?? "Generation failed.")
        );
        endGenerating();
        break;
      }
    }
  };

  const readStream = async (body: ReadableStream<Uint8Array>) => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const pump = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        handleEvent(JSON.parse(trimmed));
      } catch {
        // ignore malformed line
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        pump(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    pump(buf);
    // If the stream ended without a terminal done/error (e.g. the connection
    // dropped), don't leave the UI stuck in "generating".
    if (useSpecStore.getState().status === "generating") endGenerating();
  };

  const run = async (promptText: string, currentSpec?: FurnitureSpec) => {
    const controller = new AbortController();
    abortRef.current = controller;
    lastAttempt.current = { prompt: promptText, currentSpec };
    beginGenerating();

    // Advance past "understanding" if the model is still thinking before any
    // structured data streams back.
    window.setTimeout(() => {
      const s = useSpecStore.getState();
      if (s.status === "generating" && s.stage === "understanding")
        setStage("dimensions");
    }, 1500);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          ...(currentSpec ? { currentSpec } : {}),
        }),
        signal: controller.signal,
      });

      const ctype = res.headers.get("content-type") ?? "";
      if (res.body && ctype.includes("ndjson")) {
        await readStream(res.body);
      } else {
        // Blocking fallback (or an early error) returns plain JSON.
        const data = await res.json().catch(() => null);
        if (data?.spec) commit(data.spec);
        else {
          setError(data?.error ?? `Generation failed (${res.status}).`);
          endGenerating();
        }
      }
    } catch {
      if (controller.signal.aborted) return; // user cancelled — already idle
      setError("Network error — is the dev server running?");
      endGenerating();
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    run(trimmed, pristine ? undefined : spec);
  };

  const cancel = () => {
    abortRef.current?.abort();
    endGenerating();
  };

  const retry = () => {
    if (generating) return;
    const last = lastAttempt.current;
    if (last) run(last.prompt, last.currentSpec);
  };

  return (
    <div className="absolute bottom-4 left-1/2 w-full max-w-xl -translate-x-1/2 px-4">
      {error && (
        <div className="mb-2 flex items-start justify-between gap-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
          <span>{error}</span>
          {lastAttempt.current && (
            <button
              onClick={retry}
              className="shrink-0 font-semibold text-red-800 underline underline-offset-2 hover:text-red-900"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <GenerationHUD />

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
          className="flex-1 bg-transparent px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {generating ? (
          <button
            onClick={cancel}
            className="rounded-lg bg-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-300"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!prompt.trim()}
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
          >
            {pristine ? "Generate" : "Refine"}
          </button>
        )}
      </div>
    </div>
  );
}
