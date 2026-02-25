import { NextRequest, NextResponse } from "next/server";

/**
 * Validate request origin to prevent CSRF attacks.
 * Checks that the Origin or Referer header matches the app's host.
 * Returns null if valid, or a 403 response if invalid.
 */
export function validateOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Allow requests with no origin (same-origin navigations, server-side calls)
  if (!origin && !referer) return null;

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
 */
export async function safeGetSession(authModule: {
  getSession: () => Promise<{ data: { user: { email: string } } | null }>;
}): Promise<{ email: string } | null> {
  try {
    const { data: session } = await authModule.getSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
}
