import { NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken } from "@/lib/access/keys";
import { resolveOwnerAccess } from "@/lib/access/owner";
import {
  loadGenerationArtifact,
  removeGenerationArtifact,
} from "@/lib/artifacts/dashboard-db";

const NO_STORE = { "Cache-Control": "no-store" };
const ArtifactId = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

function accessResponse(request: Request): NextResponse | null {
  const access = resolveOwnerAccess(
    process.env.WORKBENCH_OWNER_KEY,
    bearerToken(request.headers.get("authorization")),
    process.env.WORKBENCH_ACCESS_KEYS
  );
  if (access.status === "misconfigured") {
    return NextResponse.json(
      { error: "Owner access is not configured." },
      { status: 503, headers: NO_STORE }
    );
  }
  if (access.status === "unauthorized") {
    return NextResponse.json(
      { error: "A valid owner key is required." },
      {
        status: 401,
        headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" },
      }
    );
  }
  return null;
}

async function artifactId(context: Context): Promise<string | null> {
  const parsed = ArtifactId.safeParse((await context.params).id);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request, context: Context) {
  const denied = accessResponse(request);
  if (denied) return denied;
  const id = await artifactId(context);
  if (!id) {
    return NextResponse.json(
      { error: "Invalid artifact id." },
      { status: 400, headers: NO_STORE }
    );
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json(
      { error: "Artifact storage is not configured." },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const artifact = await loadGenerationArtifact(connectionString, id);
    if (!artifact) {
      return NextResponse.json(
        { error: "Artifact not found." },
        { status: 404, headers: NO_STORE }
      );
    }
    return NextResponse.json(artifact, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "owner artifact query failed",
      error instanceof Error ? error.name : "unknown"
    );
    return NextResponse.json(
      { error: "Could not load artifact." },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = accessResponse(request);
  if (denied) return denied;
  const id = await artifactId(context);
  if (!id) {
    return NextResponse.json(
      { error: "Invalid artifact id." },
      { status: 400, headers: NO_STORE }
    );
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json(
      { error: "Artifact storage is not configured." },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const deleted = await removeGenerationArtifact(connectionString, id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Artifact not found." },
        { status: 404, headers: NO_STORE }
      );
    }
    return NextResponse.json({ deleted: true }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "owner artifact delete failed",
      error instanceof Error ? error.name : "unknown"
    );
    return NextResponse.json(
      { error: "Could not delete artifact." },
      { status: 500, headers: NO_STORE }
    );
  }
}
