/**
 * Portuguese prepositions and articles that should stay lowercase
 * when they appear mid-string (not as the first word).
 */
const PT_LOWERCASE = new Set([
  "de", "da", "do", "das", "dos",
  "e", "a", "o", "as", "os",
  "em", "no", "na", "nos", "nas",
  "ao", "à", "às", "aos",
  "por", "pelo", "pela", "pelos", "pelas",
  "com", "sem",
]);

/**
 * Title-case a string, keeping Portuguese prepositions/articles lowercase
 * when they appear mid-string, and stripping leading non-letter characters
 * (e.g. STCP uses "*codiceira" internally).
 * e.g., "BOAVISTA - CAMPANHÃ"  → "Boavista - Campanhã"
 * e.g., "SENHORA DE HORA"      → "Senhora de Hora"
 * e.g., "*codiceira"           → "Codiceira"
 */
export function toTitleCase(s: string): string {
  let isFirst = true;
  return s.replace(/\S+/g, (word) => {
    const lower = word.toLowerCase();
    // Strip leading non-letter characters (e.g. "*" used by STCP)
    const firstLetterIdx = lower.search(/[a-zà-ÿ]/i);
    if (firstLetterIdx === -1) return word; // pure punctuation — keep as-is
    const letters = lower.slice(firstLetterIdx);
    const isLower = !isFirst && PT_LOWERCASE.has(letters);
    isFirst = false;
    return isLower ? letters : letters.charAt(0).toUpperCase() + letters.slice(1);
  }).replace(/\s{2,}/g, " ").trim();
}
