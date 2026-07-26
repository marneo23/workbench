import { bookshelfSpec } from "@/lib/spec/examples";
import { validateSpec } from "@/lib/spec/validate";

/**
 * Debug mode: replays the reference bookshelf over the real NDJSON protocol
 * with plausible pacing, so the wait experience can be iterated on without
 * spending a single token. Never reaches the LLM.
 *
 * Enabled per-request (`{ mock: true }`) and gated server-side to non-production
 * builds unless ALLOW_MOCK_LLM=1.
 */

export type MockScenario = "success" | "slow" | "retry" | "error";

export interface MockOptions {
  scenario?: MockScenario;
  /** ms before the first structured data arrives (the "thinking" gap) */
  thinkMs?: number;
  /** ms between streamed parts */
  partMs?: number;
}

export function mockAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_LLM === "1";
}

const DEFAULTS = { thinkMs: 1800, partMs: 650, validateMs: 900 };

/** Sleep that resolves early (falsy) when the client disconnects. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** ±25% jitter so the pacing doesn't look mechanically uniform. */
const jitter = (ms: number) => Math.round(ms * (0.75 + Math.random() * 0.5));

export function runMockStream(
  signal: AbortSignal,
  options: MockOptions = {}
): ReadableStream<Uint8Array> {
  const scenario = options.scenario ?? "success";
  const mult = scenario === "slow" ? 3 : 1;
  const thinkMs = (options.thinkMs ?? DEFAULTS.thinkMs) * mult;
  const partMs = (options.partMs ?? DEFAULTS.partMs) * mult;
  const validateMs = DEFAULTS.validateMs * mult;

  const spec = bookshelfSpec;
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const wait = async (ms: number) => {
        const ok = await sleep(jitter(ms), signal);
        if (!ok) closed = true;
        return ok;
      };

      const streamParts = async (upTo = spec.parts.length) => {
        for (let i = 0; i < upTo; i++) {
          if (!(await wait(partMs))) return false;
          send({ type: "part", part: spec.parts[i] });
        }
        return true;
      };

      try {
        if (!(await wait(thinkMs))) return;

        if (scenario === "error") {
          send({
            type: "error",
            status: 422,
            error:
              "Couldn't produce a valid buildable spec for that request. Try being more specific about dimensions.",
            details: ["mock: simulated validation failure"],
          });
          return;
        }

        send({
          type: "meta",
          name: spec.name,
          bbox: spec.bbox,
          materials: spec.materials,
        });

        if (scenario === "retry") {
          // Partial first pass, then a validation-feedback retry from scratch.
          if (!(await streamParts(3))) return;
          if (!(await wait(validateMs))) return;
          send({ type: "reset" });
          if (!(await wait(thinkMs))) return;
          send({
            type: "meta",
            name: spec.name,
            bbox: spec.bbox,
            materials: spec.materials,
          });
        }

        if (!(await streamParts())) return;

        send({ type: "stage", stage: "validating" });
        if (!(await wait(validateMs))) return;

        const { warnings } = validateSpec(spec);
        send({ type: "done", spec, warnings });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed / cancelled by the client
        }
      }
    },
  });
}
