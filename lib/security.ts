import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Safe HTTP methods that don't mutate state — no CSRF risk
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Validate request origin to prevent CSRF attacks.
 * For mutating methods (POST, PUT, DELETE, PATCH), requires a matching
 * Origin or Referer header. Safe methods (GET, HEAD, OPTIONS) are always allowed.
 * Returns null if valid, or a 403 response if invalid.
 */
export function validateOrigin(request: NextRequest): NextResponse | null {
  // Safe methods carry no CSRF risk — skip check
  if (SAFE_METHODS.has(request.method)) return null;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Mutating request with no origin or referer — reject to prevent
  // server-side scripts / curl from bypassing CSRF protection
  if (!origin && !referer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = host ? [host] : [];

  // Check Origin header first (most reliable)
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (allowed.includes(originHost)) return null;
    } catch {
      // Invalid origin URL
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (allowed.includes(refererHost)) return null;
    } catch {
      // Invalid referer URL
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

/**
 * Safe wrapper for auth.getSession() that returns null on failure
 * instead of throwing (e.g., when called without browser cookies).
 * Auth errors are logged at warn level so they're visible in server logs.
 */
export async function safeGetSession(authModule: {
  getSession: () => Promise<{ data: { user: { email: string } } | null }>;
}): Promise<{ email: string } | null> {
  try {
    const { data: session } = await authModule.getSession();
    return session?.user ?? null;
  } catch (err) {
    logger.warn("[safeGetSession] Failed to get session:", err);
    return null;
  }
}
