// Anonymous user identity via UUID in localStorage
// This ID is used to associate feedback with a user without requiring auth.
// When auth is added later, the anonymous user can be linked to an authenticated account.

const ANON_ID_KEY = "porto-anon-id";

function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers), fall back to manual
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get the anonymous user ID from localStorage, creating one if it doesn't exist.
 * Returns null if called on the server (SSR).
 */
export function getAnonymousId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
    return null;
  }
}

/**
 * Remove the anonymous ID from localStorage.
 * Called after anonymous reviews have been linked to an authenticated account.
 */
export function clearAnonymousId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ANON_ID_KEY);
  } catch {
    // ignore
  }
}
