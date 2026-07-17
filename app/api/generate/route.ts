import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { NextResponse } from "next/server";
import { FurnitureSpecSchema, type FurnitureSpec } from "@/lib/spec/schema";
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
});

const MODEL = "claude-opus-4-8";

interface Attempt {
  spec?: FurnitureSpec;
  errors: ValidationIssue[];
  /** raw model text, echoed back on retry */
  raw: string;
  refusal?: boolean;
}

async function attemptGeneration(
  client: Anthropic,
  messages: Anthropic.MessageParam[]
): Promise<Attempt> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(FurnitureSpecSchema) },
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages,
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    return { errors: [], raw: "", refusal: true };
  }

  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  if (message.stop_reason === "max_tokens" || !text) {
    return {
      errors: [{ code: "truncated", message: "model output was empty or truncated" }],
      raw: text,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { errors: [{ code: "bad-json", message: "output was not valid JSON" }], raw: text };
  }

  const schemaResult = FurnitureSpecSchema.safeParse(parsed);
  if (!schemaResult.success) {
    return {
      errors: schemaResult.error.issues.slice(0, 10).map((i) => ({
        code: "schema",
        message: `${i.path.join(".")}: ${i.message}`,
      })),
      raw: text,
    };
  }

  const { errors } = validateSpec(schemaResult.data);
  return { spec: errors.length === 0 ? schemaResult.data : undefined, errors, raw: text };
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY." },
      { status: 500 }
    );
  }

  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { prompt, currentSpec } = body.data;

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(prompt, currentSpec) },
  ];

  try {
    let attempt = await attemptGeneration(client, messages);

    // One retry with the concrete validation errors fed back.
    if (!attempt.spec && !attempt.refusal) {
      messages.push(
        { role: "assistant", content: attempt.raw || "(empty)" },
        { role: "user", content: buildRetryMessage(attempt.errors) }
      );
      attempt = await attemptGeneration(client, messages);
    }

    if (attempt.refusal) {
      return NextResponse.json(
        { error: "The model declined this request. Try rephrasing it as a furniture design." },
        { status: 422 }
      );
    }

    if (!attempt.spec) {
      return NextResponse.json(
        {
          error:
            "Couldn't produce a valid buildable spec for that request. Try being more specific about dimensions.",
          details: attempt.errors.map((e) => e.message),
        },
        { status: 422 }
      );
    }

    const { warnings } = validateSpec(attempt.spec);
    return NextResponse.json({ spec: attempt.spec, warnings });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited — wait a moment and try again." },
        { status: 429 }
      );
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Generation service error (${error.status}).` },
        { status: 502 }
      );
    }
    throw error;
  }
}
