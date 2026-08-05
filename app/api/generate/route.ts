import {
  streamObject,
  generateObject,
  APICallError,
  NoObjectGeneratedError,
  type ModelMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextResponse } from "next/server";
import {
  FurnitureSpecSchema,
  MaterialSchema,
  PartSchema,
  Size3Schema,
  type FurnitureSpec,
} from "@/lib/spec/schema";
import { validateSpec, type ValidationIssue } from "@/lib/spec/validate";
import {
  SYSTEM_PROMPT,
  buildRetryMessage,
  buildUserMessage,
} from "@/lib/llm/prompts";
import { mockAllowed, runMockStream } from "@/lib/llm/mock";
import {
  buildUsageRecord,
  fromProviderUsage,
  type Attempt,
  type ProviderUsage,
} from "@/lib/usage/record";
import { createUsageSink, safeWrite } from "@/lib/usage/sink";
import {
  accessStatus,
  bearerToken,
  resolveAccess,
} from "@/lib/access/keys";

export const maxDuration = 300;

const RequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  currentSpec: FurnitureSpecSchema.optional(),
  /** false → blocking JSON fallback; default follows DISABLE_STREAMING env. */
  stream: z.boolean().optional(),
  /** debug: replay the reference spec locally, no LLM call and no cost */
  mock: z.boolean().optional(),
  mockScenario: z.enum(["success", "slow", "retry", "error"]).optional(),
  /** free-form tag recorded on the usage row; the golden suite sends a case id */
  label: z.string().max(64).optional(),
});

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.1";
const STREAMING_DEFAULT = process.env.DISABLE_STREAMING !== "1";
const MAX_OUTPUT_TOKENS = 32000;
const MAX_ATTEMPTS = 2; // first pass + one validation-feedback retry

// Shared options for both the streaming and blocking object calls.
// strictJsonSchema:false — OpenAI's strict structured-output mode requires every
// property (incl. optionals like thickness/grain/joinery/notes) to be listed in
// `required`; our schema has genuine optionals, so we generate a non-strict JSON
// schema and lean on the Zod + cross-field validation + retry we already run.
const objectCall = {
  model: openai(MODEL),
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  providerOptions: { openai: { strictJsonSchema: false } },
} as const;

/** Maps AI SDK / provider errors to the same HTTP semantics as before. */
function mapError(e: unknown): {
  status: number;
  error: string;
  details?: string[];
} {
  if (APICallError.isInstance(e)) {
    if (e.statusCode === 429) {
      return { status: 429, error: "Rate limited — wait a moment and try again." };
    }
    return {
      status: 502,
      error: `Generation service error (${e.statusCode ?? "?"}).`,
    };
  }
  if (NoObjectGeneratedError.isInstance(e)) {
    return {
      status: 422,
      error:
        "The model declined this request. Try rephrasing it as a furniture design.",
    };
  }
  return { status: 500, error: "Unexpected server error." };
}

const COULD_NOT_BUILD =
  "Couldn't produce a valid buildable spec for that request. Try being more specific about dimensions.";

const sink = createUsageSink();

/** Per-request facts the usage record needs that the messages array has lost. */
type RequestMeta = {
  userId: string;
  mode: "new" | "refinement";
  label?: string;
  promptChars: number;
  inputSpecChars?: number;
  inputParts?: number;
};

function buildRetryTurns(
  base: ModelMessage[],
  rawAssistant: string,
  errors: ValidationIssue[]
): ModelMessage[] {
  return [
    ...base,
    { role: "assistant", content: rawAssistant || "(no output)" },
    { role: "user", content: buildRetryMessage(errors) },
  ];
}

// --- streaming (primary) ---------------------------------------------------
//
// NDJSON event protocol (one JSON object per line):
//   { type: "meta",  name, bbox, materials }   — dims + materials known
//   { type: "part",  part }                     — one newly-closed part
//   { type: "stage", stage }                    — server-side stage change
//   { type: "reset" }                           — clear preview before a retry
//   { type: "done",  spec, warnings }           — final validated spec
//   { type: "error", status, error, details? }  — terminal failure

function runStream(
  request: Request,
  baseMessages: ModelMessage[],
  meta: RequestMeta
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      const attempts: Attempt[] = [];
      let succeeded = false;
      let cancelled = false;
      let errorCode: string | undefined;
      let emittedChars = 0;
      let outputParts = 0;

      // Parts go out through here so a cancelled request still leaves a record
      // of how much output was paid for before the abort.
      const sendPart = (part: unknown) => {
        const line = JSON.stringify({ type: "part", part });
        emittedChars += line.length;
        outputParts++;
        controller.enqueue(encoder.encode(line + "\n"));
      };

      try {
        let messages = baseMessages;
        let finalSpec: FurnitureSpec | null = null;
        let lastErrors: ValidationIssue[] = [];

        for (let attempt = 0; attempt < MAX_ATTEMPTS && !finalSpec; attempt++) {
          if (attempt > 0) send({ type: "reset" });

          // Captured per attempt, not once per request: a retry is a second
          // billed call whose input carries the failed spec on top of the
          // original messages, so it costs more than the first, not less.
          let attemptUsage: ProviderUsage | undefined;
          const noteAttempt = (validationErrors: number) => {
            attempts.push({
              attempt: attempts.length + 1,
              tokens: fromProviderUsage(attemptUsage),
              reported: attemptUsage != null,
              validationErrors,
              estimated: false,
            });
          };

          const result = streamObject({
            ...objectCall,
            schema: FurnitureSpecSchema,
            system: SYSTEM_PROMPT,
            messages,
            abortSignal: request.signal,
            // Fires even when the final object fails schema validation — which
            // is precisely the attempt that would otherwise go unmeasured.
            onFinish: (e) => {
              attemptUsage = e.usage;
            },
          });

          let metaSent = false;
          let emitted = 0;

          const trySendMeta = (
            name: unknown,
            bbox: unknown,
            materials: unknown,
            partsStarted: boolean
          ) => {
            if (metaSent || !partsStarted) return;
            const b = Size3Schema.safeParse(bbox);
            const m = z.array(MaterialSchema).safeParse(materials);
            if (typeof name === "string" && b.success && m.success && m.data.length) {
              send({ type: "meta", name, bbox: b.data, materials: m.data });
              metaSent = true;
            }
          };

          for await (const partial of result.partialObjectStream) {
            trySendMeta(
              partial.name,
              partial.bbox,
              partial.materials,
              partial.parts !== undefined
            );
            const parts = partial.parts;
            if (Array.isArray(parts)) {
              // Emit every part except the last one, which may still be
              // mid-stream (a following object proves the prior part closed).
              while (emitted < parts.length - 1) {
                const p = PartSchema.safeParse(parts[emitted]);
                if (!p.success) break;
                sendPart(p.data);
                emitted++;
              }
            }
          }

          let obj: FurnitureSpec;
          try {
            obj = await result.object;
          } catch (e) {
            if (NoObjectGeneratedError.isInstance(e)) {
              // The error carries the usage of the call that produced nothing
              // usable — still billed, so it still counts.
              attemptUsage ??= e.usage;
              noteAttempt(1);
              lastErrors = [
                { code: "no-object", message: "model did not produce a valid spec" },
              ];
              messages = buildRetryTurns(baseMessages, e.text ?? "", lastErrors);
              continue; // retry
            }
            throw e; // API / rate-limit → outer catch
          }

          // Flush meta + any parts not yet emitted, from the validated object.
          trySendMeta(obj.name, obj.bbox, obj.materials, true);
          while (emitted < obj.parts.length) {
            sendPart(obj.parts[emitted]);
            emitted++;
          }

          send({ type: "stage", stage: "validating" });
          const { errors, warnings } = validateSpec(obj);
          noteAttempt(errors.length);
          if (errors.length === 0) {
            finalSpec = obj;
            succeeded = true;
            send({ type: "done", spec: obj, warnings });
          } else {
            lastErrors = errors;
            messages = buildRetryTurns(baseMessages, JSON.stringify(obj), errors);
          }
        }

        if (!finalSpec) {
          send({
            type: "error",
            status: 422,
            error: COULD_NOT_BUILD,
            details: lastErrors.map((e) => e.message),
          });
        }
        controller.close();
      } catch (e) {
        if (request.signal.aborted) {
          cancelled = true;
          controller.close();
          return;
        }
        const mapped = mapError(e);
        errorCode = String(mapped.status);
        try {
          send({ type: "error", ...mapped });
        } catch {
          // controller already closed
        }
        controller.close();
      } finally {
        // In `finally`, not on the success path: a request that failed
        // validation twice or was cancelled mid-stream has still been paid for,
        // and those are the two cases worth watching.
        if (cancelled && attempts.length === 0) {
          // Aborted before onFinish could report. A call was still billed; the
          // char counts are the only material a cost model has to work from.
          attempts.push({
            attempt: 1,
            tokens: {},
            reported: false,
            validationErrors: 0,
            estimated: true,
          });
        }
        await safeWrite(
          sink,
          buildUsageRecord({
            userId: meta.userId,
            model: MODEL,
            mode: meta.mode,
            label: meta.label,
            streaming: true,
            attempts,
            succeeded,
            cancelled,
            apiError: errorCode !== undefined,
            errorCode,
            durationMs: Date.now() - startedAt,
            promptChars: meta.promptChars,
            inputSpecChars: meta.inputSpecChars,
            inputParts: meta.inputParts,
            emittedChars,
            outputParts,
          })
        );
      }
    },
  });
}

// --- blocking fallback (DISABLE_STREAMING=1 or { stream: false }) ----------

async function generateBlocking(
  request: Request,
  baseMessages: ModelMessage[],
  meta: RequestMeta
): Promise<Response> {
  const startedAt = Date.now();
  const attempts: Attempt[] = [];
  let succeeded = false;
  let errorCode: string | undefined;
  let outputParts = 0;

  try {
    let messages = baseMessages;
    let lastErrors: ValidationIssue[] = [];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let obj: FurnitureSpec;
      let attemptUsage: ProviderUsage | undefined;
      const noteAttempt = (validationErrors: number) => {
        attempts.push({
          attempt: attempts.length + 1,
          tokens: fromProviderUsage(attemptUsage),
          reported: attemptUsage != null,
          validationErrors,
          estimated: false,
        });
      };

      try {
        const result = await generateObject({
          ...objectCall,
          schema: FurnitureSpecSchema,
          system: SYSTEM_PROMPT,
          messages,
          abortSignal: request.signal,
        });
        attemptUsage = result.usage;
        obj = result.object;
      } catch (e) {
        if (NoObjectGeneratedError.isInstance(e)) {
          attemptUsage = e.usage;
          noteAttempt(1);
          lastErrors = [
            { code: "no-object", message: "model did not produce a valid spec" },
          ];
          messages = buildRetryTurns(baseMessages, e.text ?? "", lastErrors);
          continue;
        }
        const m = mapError(e);
        errorCode = String(m.status);
        return NextResponse.json(
          { error: m.error, ...(m.details ? { details: m.details } : {}) },
          { status: m.status }
        );
      }

      const { errors, warnings } = validateSpec(obj);
      noteAttempt(errors.length);
      if (errors.length === 0) {
        succeeded = true;
        outputParts = obj.parts.length;
        return NextResponse.json({ spec: obj, warnings });
      }
      lastErrors = errors;
      messages = buildRetryTurns(baseMessages, JSON.stringify(obj), errors);
    }

    return NextResponse.json(
      { error: COULD_NOT_BUILD, details: lastErrors.map((e) => e.message) },
      { status: 422 }
    );
  } finally {
    // Every `return` above passes through here, including the error paths.
    await safeWrite(
      sink,
      buildUsageRecord({
        userId: meta.userId,
        model: MODEL,
        mode: meta.mode,
        label: meta.label,
        streaming: false,
        attempts,
        succeeded,
        cancelled: request.signal.aborted,
        apiError: errorCode !== undefined,
        errorCode,
        durationMs: Date.now() - startedAt,
        promptChars: meta.promptChars,
        inputSpecChars: meta.inputSpecChars,
        inputParts: meta.inputParts,
        outputParts,
      })
    );
  }
}

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

const production = process.env.NODE_ENV === "production";

export function GET(request: Request) {
  const status = accessStatus(process.env.WORKBENCH_ACCESS_KEYS, production);
  const access = resolveAccess(
    process.env.WORKBENCH_ACCESS_KEYS,
    bearerToken(request.headers.get("authorization")),
    production
  );
  return NextResponse.json(
    {
      ...status,
      authorized: access.status === "authorized",
      ...(access.status === "authorized" ? { userId: access.userId } : {}),
    },
    {
      status: access.status === "misconfigured" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: Request) {
  const access = resolveAccess(
    process.env.WORKBENCH_ACCESS_KEYS,
    bearerToken(request.headers.get("authorization")),
    production
  );
  if (access.status === "misconfigured") {
    return NextResponse.json(
      { error: "Server access control is not configured." },
      { status: 503 }
    );
  }
  if (access.status === "unauthorized") {
    return NextResponse.json(
      { error: "A valid access key is required." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { prompt, currentSpec, stream, mock, mockScenario, label } = body.data;

  // Debug mode short-circuits everything above the protocol: no API key needed,
  // no tokens spent. Ignored in production unless explicitly allowed.
  if (mock && mockAllowed()) {
    return new Response(
      runMockStream(request.signal, { scenario: mockScenario }),
      { headers: NDJSON_HEADERS }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing OPENAI_API_KEY." },
      { status: 500 }
    );
  }

  const messages: ModelMessage[] = [
    { role: "user", content: buildUserMessage(prompt, currentSpec) },
  ];

  // A refinement carries the entire current spec up and regenerates the entire
  // spec back, so its cost tracks part count, not the size of the edit. Kept as
  // its own dimension because that is the distinction Phase C acts on.
  const meta: RequestMeta = {
    userId: access.userId,
    mode: currentSpec ? "refinement" : "new",
    label,
    promptChars: prompt.length,
    inputSpecChars: currentSpec ? JSON.stringify(currentSpec).length : undefined,
    inputParts: currentSpec?.parts.length,
  };

  if (!(stream ?? STREAMING_DEFAULT)) {
    return generateBlocking(request, messages, meta);
  }

  return new Response(runStream(request, messages, meta), {
    headers: NDJSON_HEADERS,
  });
}
