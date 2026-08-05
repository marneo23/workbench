export type AccessDecision =
  | { status: "authorized"; userId: string }
  | { status: "unauthorized" }
  | { status: "misconfigured" };

type AccessEntry = {
  userId: string;
  key: string;
};

type ParsedAccessKeys =
  | { status: "disabled" }
  | { status: "configured"; entries: AccessEntry[] }
  | { status: "invalid" };

const BEARER_KEY = /^[A-Za-z0-9\-._~+/]+=*$/;

export function validBearerKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 256 &&
    BEARER_KEY.test(value)
  );
}

function parseAccessKeys(raw: string | undefined): ParsedAccessKeys {
  if (raw == null || raw.trim() === "") return { status: "disabled" };

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { status: "invalid" };
    }

    const entries = Object.entries(value);
    if (entries.length === 0 || entries.length > 100) return { status: "invalid" };

    const seen = new Set<string>();
    const parsed: AccessEntry[] = [];
    for (const [userId, key] of entries) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(userId)) {
        return { status: "invalid" };
      }
      if (!validBearerKey(key) || seen.has(key)) {
        return { status: "invalid" };
      }
      seen.add(key);
      parsed.push({ userId, key });
    }

    return { status: "configured", entries: parsed };
  } catch {
    return { status: "invalid" };
  }
}

/** Compares secrets without returning early on a matching prefix. */
export function secretsEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/i.exec(header);
  return match?.[1] ?? null;
}

export function resolveAccess(
  raw: string | undefined,
  presentedKey: string | null,
  production: boolean
): AccessDecision {
  const parsed = parseAccessKeys(raw);
  if (parsed.status === "invalid") return { status: "misconfigured" };
  if (parsed.status === "disabled") {
    return production
      ? { status: "misconfigured" }
      : { status: "authorized", userId: "local" };
  }
  if (!presentedKey) return { status: "unauthorized" };

  const match = parsed.entries.find((entry) => secretsEqual(entry.key, presentedKey));
  return match
    ? { status: "authorized", userId: match.userId }
    : { status: "unauthorized" };
}

export function accessStatus(
  raw: string | undefined,
  production: boolean
): { required: boolean; configured: boolean } {
  const parsed = parseAccessKeys(raw);
  if (parsed.status === "configured") return { required: true, configured: true };
  if (parsed.status === "disabled" && !production) {
    return { required: false, configured: true };
  }
  return { required: true, configured: false };
}
