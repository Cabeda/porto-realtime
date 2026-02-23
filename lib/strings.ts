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
 * when they appear mid-string.
 * e.g., "BOAVISTA - CAMPANHÃ"  → "Boavista - Campanhã"
 * e.g., "SENHORA DE HORA"      → "Senhora de Hora"
 * e.g., "ESTAÇÃO DO BOLHÃO"    → "Estação do Bolhão"
 */
export function toTitleCase(s: string): string {
  let isFirst = true;
  return s.replace(/\S+/g, (word) => {
    const lower = word.toLowerCase();
    const result = (!isFirst && PT_LOWERCASE.has(lower))
      ? lower
      : lower.charAt(0).toUpperCase() + lower.slice(1);
    isFirst = false;
    return result;
  });
}
