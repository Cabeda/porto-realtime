/**
 * Lightweight profanity/spam filter for user comments.
 * Checks against a blocklist of Portuguese and English slurs, insults, and spam patterns.
 * Returns true if the text is clean, false if it should be rejected.
 */

// Blocked words — lowercase, checked as whole words via regex boundary
// Covers common Portuguese and English profanity/slurs
const BLOCKED_WORDS = [
  // Portuguese profanity
  "caralho", "foda", "fodase", "foda-se", "merda", "puta", "putas",
  "paneleiro", "paneleiros", "filho da puta", "filha da puta",
  "cona", "piça", "porra", "cabrão", "cabrao", "otário", "otario",
  "vai-te foder", "chupa", "crl", "fdp", "pqp",
  // English profanity
  "fuck", "fucking", "shit", "bitch", "asshole", "bastard",
  "dick", "cunt", "nigger", "faggot", "retard",
  // Spam patterns
  "buy now", "click here", "free money", "casino", "viagra",
  "crypto", "bitcoin", "telegram", "whatsapp group",
];

// Build regex patterns — match as whole words (case-insensitive)
const BLOCKED_PATTERNS = BLOCKED_WORDS.map(
  (word) => new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i")
);

// Additional patterns for obfuscation attempts (l33t speak, spacing tricks)
const OBFUSCATION_PATTERNS = [
  /f\s*[uú]\s*[ck]\s*k?/i,
  /s\s*h\s*[i1]\s*t/i,
  /p\s*u\s*t\s*[a@]/i,
  /m\s*e\s*r\s*d\s*[a@]/i,
];

/**
 * Check if a comment passes the content filter.
 * Returns { clean: true } if OK, or { clean: false, reason: string } if blocked.
 */
export function checkComment(text: string): { clean: true } | { clean: false; reason: string } {
  if (!text || text.trim().length === 0) return { clean: true };

  const normalized = text.toLowerCase();

  // Check blocked words
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      return { clean: false, reason: "O comentário contém linguagem inadequada." };
    }
  }

  // Check obfuscation patterns
  for (const pattern of OBFUSCATION_PATTERNS) {
    if (pattern.test(normalized)) {
      return { clean: false, reason: "O comentário contém linguagem inadequada." };
    }
  }

  // Check for excessive caps (>70% uppercase in comments longer than 10 chars)
  if (text.length > 10) {
    const upperCount = (text.match(/[A-Z]/g) || []).length;
    const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
    if (letterCount > 0 && upperCount / letterCount > 0.7) {
      return { clean: false, reason: "Evite escrever em maiúsculas." };
    }
  }

  // Check for repetitive characters (e.g. "aaaaaaa" or "!!!!!!")
  if (/(.)\1{5,}/i.test(text)) {
    return { clean: false, reason: "O comentário contém caracteres repetitivos." };
  }

  // Check for URL spam
  if (/(https?:\/\/|www\.)/i.test(text)) {
    return { clean: false, reason: "Links não são permitidos nos comentários." };
  }

  return { clean: true };
}
