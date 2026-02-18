/**
 * Title-case a string, handling accented characters correctly.
 * e.g., "BOAVISTA - CAMPANHÃ" → "Boavista - Campanhã"
 */
export function toTitleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
