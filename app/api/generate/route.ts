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

export const maxDuration = 300;

const RequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  currentSpec: FurnitureSpecSchema.optional(),
  /** false → blocking JSON fallback; default follows DISABLE_STREAMING env. */
  stream: z.boolean().optional(),
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
//   { type: "reset" }                           — clear preview before a retry
//   { type: "done",  spec, warnings }           — final validated spec
//   { type: "error", status, error, details? }  — terminal failure

function runStream(
  request: Request,
  baseMessages: ModelMessage[]
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        let messages = baseMessages;
        let finalSpec: FurnitureSpec | null = null;
        let lastErrors: ValidationIssue[] = [];

        for (let attempt = 0; attempt < MAX_ATTEMPTS && !finalSpec; attempt++) {
          if (attempt > 0) send({ type: "reset" });

          const result = streamObject({
            ...objectCall,
            schema: FurnitureSpecSchema,
            system: SYSTEM_PROMPT,
            messages,
            abortSignal: request.signal,
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
                send({ type: "part", part: p.data });
                emitted++;
              }
            }
          }

          let obj: FurnitureSpec;
          try {
            obj = await result.object;
          } catch (e) {
            if (NoObjectGeneratedError.isInstance(e)) {
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
            send({ type: "part", part: obj.parts[emitted] });
            emitted++;
          }

          const { errors, warnings } = validateSpec(obj);
          if (errors.length === 0) {
            finalSpec = obj;
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
          controller.close();
          return;
        }
        try {
          send({ type: "error", ...mapError(e) });
        } catch {
          // controller already closed
        }
        controller.close();
      }
    },
  });
}

// --- blocking fallback (DISABLE_STREAMING=1 or { stream: false }) ----------

async function generateBlocking(
  request: Request,
  baseMessages: ModelMessage[]
): Promise<Response> {
  let messages = baseMessages;
  let lastErrors: ValidationIssue[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let obj: FurnitureSpec;
    try {
      const result = await generateObject({
        ...objectCall,
        schema: FurnitureSpecSchema,
        system: SYSTEM_PROMPT,
        messages,
        abortSignal: request.signal,
      });
      obj = result.object;
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) {
        lastErrors = [
          { code: "no-object", message: "model did not produce a valid spec" },
        ];
        messages = buildRetryTurns(baseMessages, e.text ?? "", lastErrors);
        continue;
      }
      const m = mapError(e);
      return NextResponse.json(
        { error: m.error, ...(m.details ? { details: m.details } : {}) },
        { status: m.status }
      );
    }

    const { errors, warnings } = validateSpec(obj);
    if (errors.length === 0) {
      return NextResponse.json({ spec: obj, warnings });
    }
    lastErrors = errors;
    messages = buildRetryTurns(baseMessages, JSON.stringify(obj), errors);
  }

  return NextResponse.json(
    { error: COULD_NOT_BUILD, details: lastErrors.map((e) => e.message) },
    { status: 422 }
  );
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing OPENAI_API_KEY." },
      { status: 500 }
    );
  }

  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { prompt, currentSpec, stream } = body.data;

  const messages: ModelMessage[] = [
    { role: "user", content: buildUserMessage(prompt, currentSpec) },
  ];

  if (!(stream ?? STREAMING_DEFAULT)) {
    return generateBlocking(request, messages);
  }

  return new Response(runStream(request, messages), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
