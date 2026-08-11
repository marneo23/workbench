export function credentialStorage(): Storage {
  return window.sessionStorage;
}

export function clearCredential(storageKey: string): void {
  window.sessionStorage.removeItem(storageKey);
  window.localStorage.removeItem(storageKey);
}

export function readCredential(storageKey: string): string | null {
  const credential = window.sessionStorage.getItem(storageKey);
  window.localStorage.removeItem(storageKey);
  return credential;
}
