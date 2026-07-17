import OpenAI from "openai";
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

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.1";

interface Attempt {
  spec?: FurnitureSpec;
  errors: ValidationIssue[];
  /** raw model text, echoed back on retry */
  raw: string;
  refusal?: boolean;
}

async function attemptGeneration(
  client: OpenAI,
  messages: OpenAI.ChatCompletionMessageParam[]
): Promise<Attempt> {
  // JSON mode + our own Zod/cross-field validation with a feedback retry.
  // (Strict structured outputs would require making every optional field
  // nullable in the schema; the retry loop covers the difference.)
  const completion = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 32000,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
  });

  const choice = completion.choices[0];
  if (!choice || choice.finish_reason === "content_filter") {
    return { errors: [], raw: "", refusal: true };
  }

  const text = choice.message.content ?? "";
  if (choice.finish_reason === "length" || !text) {
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
  const { prompt, currentSpec } = body.data;

  const client = new OpenAI();
  const messages: OpenAI.ChatCompletionMessageParam[] = [
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
    if (error instanceof OpenAI.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited — wait a moment and try again." },
        { status: 429 }
      );
    }
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: `Generation service error (${error.status}).` },
        { status: 502 }
      );
    }
    throw error;
  }
}
