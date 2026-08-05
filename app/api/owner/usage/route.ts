import { NextResponse } from "next/server";
import { bearerToken } from "@/lib/access/keys";
import { resolveOwnerAccess } from "@/lib/access/owner";
import { loadUsageDashboard } from "@/lib/usage/dashboard-db";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
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

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json(
      { error: "Usage storage is not configured." },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const dashboard = await loadUsageDashboard(connectionString);
    return NextResponse.json(dashboard, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "owner usage query failed",
      error instanceof Error ? error.name : "unknown"
    );
    return NextResponse.json(
      { error: "Could not load usage data." },
      { status: 500, headers: NO_STORE }
    );
  }
}
