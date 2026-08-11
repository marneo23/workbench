import { NextResponse } from "next/server";
import {
  bearerToken,
  secretsEqual,
  validBearerKey,
} from "@/lib/access/keys";
import { purgeExpiredGenerationArtifacts } from "@/lib/artifacts/dashboard-db";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!validBearerKey(configuredSecret)) {
    return NextResponse.json(
      { error: "Artifact cleanup is not configured." },
      { status: 503, headers: NO_STORE }
    );
  }

  const presentedSecret = bearerToken(request.headers.get("authorization"));
  if (!presentedSecret || !secretsEqual(configuredSecret, presentedSecret)) {
    return NextResponse.json(
      { error: "A valid cron secret is required." },
      {
        status: 401,
        headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" },
      }
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
    const deleted = await purgeExpiredGenerationArtifacts(connectionString);
    return NextResponse.json({ deleted }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "artifact cleanup failed",
      error instanceof Error ? error.name : "unknown"
    );
    return NextResponse.json(
      { error: "Could not clean up expired artifacts." },
      { status: 500, headers: NO_STORE }
    );
  }
}
