/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param text - The text to escape
 * @returns The escaped text safe for HTML interpolation
 */
export function escapeHtml(text: string | number | undefined | null): string {
  if (text === undefined || text === null) return "";
  
  const str = String(text);
  const htmlEscapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
  };

  return str.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}
