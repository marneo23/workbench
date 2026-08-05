import { resolveAccess, secretsEqual, validBearerKey } from "./keys";

export type OwnerAccessDecision =
  | { status: "authorized" }
  | { status: "unauthorized" }
  | { status: "misconfigured" };

/** Owner access is always fail-closed, including in development. */
export function resolveOwnerAccess(
  configuredKey: string | undefined,
  presentedKey: string | null,
  configuredUserKeys?: string
): OwnerAccessDecision {
  if (!validBearerKey(configuredKey)) return { status: "misconfigured" };
  if (configuredUserKeys != null && configuredUserKeys.trim() !== "") {
    const userAccess = resolveAccess(configuredUserKeys, configuredKey, true);
    if (userAccess.status !== "unauthorized") return { status: "misconfigured" };
  }
  if (!presentedKey || !secretsEqual(configuredKey, presentedKey)) {
    return { status: "unauthorized" };
  }
  return { status: "authorized" };
}
