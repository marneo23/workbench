export const ACCESS_KEY_STORAGE = "workbench:access-key";
export const OWNER_KEY_STORAGE = "workbench:owner-key";

export function authorizationHeaders(accessKey: string): Record<string, string> {
  return accessKey ? { Authorization: `Bearer ${accessKey}` } : {};
}
