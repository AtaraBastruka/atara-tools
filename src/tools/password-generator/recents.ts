const STORAGE_KEY = "password-generator-recents";
const MAX_RECENTS = 10;
const listeners = new Set<() => void>();

export interface RecentsStore {
  list(): string[]; // newest first, max 10
  add(value: string): void;
  clear(): void;
}

function readFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

// Module-scope cache, not re-read from localStorage on every access: a
// fresh page load (real reload, or a fresh module graph in tests via
// vi.resetModules()) re-runs this initializer and picks up whatever is
// currently in storage, which is what makes recents "survive a reload".
// Within one already-running session, `write()` is the only path that
// changes it, so useSyncExternalStore's getSnapshot can return this same
// reference across renders instead of a new array every call.
let cache: string[] = readFromStorage();

function write(values: string[]): void {
  cache = values;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  }
  for (const listener of listeners) listener();
}

/**
 * Generator-scoped recents of actual generated strings (see design: "recents
 * scope" — instantiated inside src/tools/password-generator/ only, so
 * image-crop physically cannot write to it without importing this module).
 * Bare values, newest first, capped at MAX_RECENTS. Not a vault: every
 * mutation writes straight through to localStorage, and clearing site data
 * empties it with no recovery path (see spec: recents domain, "Not a Vault
 * — Clearable").
 */
export const recentsStore: RecentsStore = {
  list() {
    return cache;
  },
  add(value: string) {
    write([value, ...cache].slice(0, MAX_RECENTS));
  },
  clear() {
    write([]);
  },
};

/**
 * useSyncExternalStore glue, mirroring ThemeToggle's subscribe/listeners
 * pattern for the same reason: reading a client-only source (localStorage)
 * needs a stable snapshot reference and a real server snapshot to avoid a
 * hydration mismatch, which plain useState+useEffect can't give without an
 * extra render (and trips the set-state-in-effect lint rule).
 */
export function subscribeToRecents(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (typeof window === "undefined") {
    return () => listeners.delete(onStoreChange);
  }
  function handleStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return;
    cache = readFromStorage();
    onStoreChange();
  }
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getRecentsSnapshot(): string[] {
  return cache;
}

export function getServerRecentsSnapshot(): string[] {
  return [];
}
