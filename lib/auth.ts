import { prisma } from "@/lib/prisma";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sendMagicLinkEmail } from "@/lib/resend";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "portomove-session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
const MAGIC_LINK_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAGIC_LINK_RATE_LIMIT = 3; // max requests per email per window
const MAGIC_LINK_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

/**
 * Generate a random 6-digit OTP code.
 */
function generateOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

/**
 * Request a magic link: generates an OTP, stores it, and sends the email.
 * Rate-limited to MAGIC_LINK_RATE_LIMIT per email per 15 minutes.
 */
export async function requestMagicLink(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit: count recent magic links for this email
  const windowStart = new Date(Date.now() - MAGIC_LINK_RATE_WINDOW_MS);
  const recentCount = await prisma.magicLink.count({
    where: {
      email: normalizedEmail,
      createdAt: { gte: windowStart },
    },
  });

  if (recentCount >= MAGIC_LINK_RATE_LIMIT) {
    throw new Error("RATE_LIMITED");
  }

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

  await prisma.magicLink.create({
    data: {
      email: normalizedEmail,
      code,
      expiresAt,
    },
  });

  await sendMagicLinkEmail(normalizedEmail, code);
}

/**
 * Verify a magic link OTP code.
 * If valid, creates/finds the user, optionally links anonymous reviews,
 * creates a session, and returns the session token.
 */
export async function verifyMagicLink(
  email: string,
  code: string,
  anonId?: string | null
): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Find a valid, unused magic link
  const magicLink = await prisma.magicLink.findFirst({
    where: {
      email: normalizedEmail,
      code,
      usedAt: null,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!magicLink) {
    throw new Error("INVALID_CODE");
  }

  // Mark as used
  await prisma.magicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  // Find or create the authenticated user
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    // Check if we can upgrade an anonymous user
    if (anonId) {
      const anonUser = await prisma.user.findUnique({
        where: { anonId },
      });

      if (anonUser && !anonUser.email) {
        // Upgrade anonymous user to authenticated
        user = await prisma.user.update({
          where: { id: anonUser.id },
          data: {
            email: normalizedEmail,
            emailVerified: new Date(),
          },
        });
      }
    }

    // If still no user, create a new one
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          emailVerified: new Date(),
        },
      });
    }
  } else {
    // User exists with this email — update emailVerified if needed
    if (!user.emailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }

    // If anonId provided and there's a separate anonymous user, merge their feedbacks
    if (anonId) {
      const anonUser = await prisma.user.findUnique({
        where: { anonId },
      });

      if (anonUser && anonUser.id !== user.id) {
        // Reassign feedbacks from anonymous user to authenticated user
        // Use a transaction to handle unique constraint conflicts (same user+type+targetId)
        await prisma.$transaction(async (tx) => {
          // Get all feedbacks from the anonymous user
          const anonFeedbacks = await tx.feedback.findMany({
            where: { userId: anonUser.id },
          });

          for (const feedback of anonFeedbacks) {
            // Check if the authenticated user already has feedback for this target
            const existing = await tx.feedback.findUnique({
              where: {
                userId_type_targetId: {
                  userId: user!.id,
                  type: feedback.type,
                  targetId: feedback.targetId,
                },
              },
            });

            if (!existing) {
              // Move the feedback to the authenticated user
              await tx.feedback.update({
                where: { id: feedback.id },
                data: { userId: user!.id },
              });
            }
            // If existing, the authenticated user's feedback takes precedence — skip
          }

          // Delete remaining feedbacks that couldn't be moved (duplicates)
          await tx.feedback.deleteMany({
            where: { userId: anonUser.id },
          });

          // Delete the anonymous user
          await tx.user.delete({
            where: { id: anonUser.id },
          });
        });
      }
    }
  }

  // Create a session
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
    },
  });

  // Create JWT containing session ID
  const token = await new SignJWT({ sessionId: session.id, userId: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getJwtSecret());

  return {
    token,
    user: {
      id: user.id,
      email: normalizedEmail,
      role: user.role,
    },
  };
}

/**
 * Set the session cookie on the response.
 */
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/**
 * Clear the session cookie and delete the session from DB.
 */
export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      const sessionId = payload.sessionId as string;
      if (sessionId) {
        await prisma.session.delete({ where: { id: sessionId } }).catch(() => {
          // Session may already be deleted
        });
      }
    } catch {
      // Invalid token, just clear the cookie
    }
  }

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/**
 * Get the current authenticated user from the session cookie.
 * Returns null if not authenticated.
 */
export async function getSessionUser(
  request?: NextRequest
): Promise<{ id: string; email: string; role: string } | null> {
  let token: string | undefined;

  if (request) {
    token = request.cookies.get(SESSION_COOKIE)?.value;
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE)?.value;
  }

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const sessionId = payload.sessionId as string;
    const userId = payload.userId as string;

    if (!sessionId || !userId) return null;

    // Verify session exists and hasn't expired
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date() || session.userId !== userId) {
      return null;
    }

    if (!session.user.email) return null;

    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the user ID from a request — prefers authenticated session, falls back to anonymous ID.
 * Returns { userId, isAuthenticated }.
 */
export async function resolveUserId(
  request: NextRequest
): Promise<{ userId: string; isAuthenticated: boolean } | null> {
  // Try authenticated session first
  const sessionUser = await getSessionUser(request);
  if (sessionUser) {
    return { userId: sessionUser.id, isAuthenticated: true };
  }

  // Fall back to anonymous ID
  const anonId = request.headers.get("x-anonymous-id");
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (anonId && UUID_REGEX.test(anonId)) {
    const user = await prisma.user.upsert({
      where: { anonId },
      update: {},
      create: { anonId },
    });
    return { userId: user.id, isAuthenticated: false };
  }

  return null;
}
