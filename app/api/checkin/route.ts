import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createHash } from "crypto";
import { validateOrigin, safeGetSession } from "@/lib/security";

const VALID_MODES = ["BUS", "METRO", "BIKE", "WALK", "SCOOTER"] as const;
const AUTH_CHECKIN_DURATION_MS = 60 * 60 * 1000; // 1 hour for authenticated
const ANON_CHECKIN_DURATION_MS = 30 * 60 * 1000; // 30 min for anonymous
const ANON_RATE_LIMIT_PER_IP = 5; // max 5 anonymous check-ins per fingerprint per window
const ANON_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_TARGET_ID_LENGTH = 100;

/** Hash IP + User-Agent for anonymous rate limiting. Never stored — used in-memory only. */
function anonFingerprint(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const ua = request.headers.get("user-agent") || "";
  return createHash("sha256").update(`${ip}:${ua}`).digest("hex");
}

// POST /api/checkin — Create a check-in (auth optional)
// Authenticated: replaces existing check-in, 1h TTL, linked to user
// Anonymous: 30min TTL, rate limited by IP hash, no userId stored
// Body: { mode: "BUS", targetId?: "205", lat?: number, lon?: number }
// lat/lon represent the TARGET infrastructure location (bus stop, bike park), NOT user GPS
export async function POST(request: NextRequest) {
  // CSRF protection
  const csrfError = validateOrigin(request);
  if (csrfError) return csrfError;

  const sessionUser = await safeGetSession(auth);

  let body: { mode?: string; targetId?: string; lat?: number; lon?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mode, targetId, lat, lon } = body;

  if (!mode || !VALID_MODES.includes(mode as (typeof VALID_MODES)[number])) {
    return NextResponse.json(
      { error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate optional targetId length
  if (targetId && (typeof targetId !== "string" || targetId.length > MAX_TARGET_ID_LENGTH)) {
    return NextResponse.json(
      { error: `targetId must be a string (max ${MAX_TARGET_ID_LENGTH} chars)` },
      { status: 400 }
    );
  }

  // Validate optional lat/lon (target infrastructure coordinates)
  const checkinLat = typeof lat === "number" && lat >= -90 && lat <= 90 ? lat : null;
  const checkinLon = typeof lon === "number" && lon >= -180 && lon <= 180 ? lon : null;

  const transitMode = mode as "BUS" | "METRO" | "BIKE" | "WALK" | "SCOOTER";
  const now = new Date();

  try {
    if (sessionUser) {
      // --- Authenticated check-in ---
      const user = await prisma.user.upsert({
        where: { email: sessionUser.email },
        update: {},
        create: { email: sessionUser.email, emailVerified: new Date() },
        select: { id: true },
      });

      // Delete any existing active check-in for this user
      await prisma.checkIn.deleteMany({
        where: { userId: user.id },
      });

      const expiresAt = new Date(now.getTime() + AUTH_CHECKIN_DURATION_MS);

      const checkIn = await prisma.checkIn.create({
        data: {
          user: { connect: { id: user.id } },
          mode: transitMode,
          targetId: targetId || null,
          lat: checkinLat,
          lon: checkinLon,
          expiresAt,
        },
        select: {
          id: true,
          mode: true,
          targetId: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      return NextResponse.json({ checkIn }, { status: 200 });
    } else {
      // --- Anonymous check-in ---
      // Rate limit by hashed fingerprint (IP + UA) — stored as truncated hash for counting only
      const fingerprint = anonFingerprint(request);
      const fingerprintShort = fingerprint.slice(0, 16); // truncated — enough for rate limiting, less PII risk
      const windowStart = new Date(now.getTime() - ANON_RATE_LIMIT_WINDOW_MS);

      // Count recent anonymous check-ins from this fingerprint
      const recentCount = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "CheckIn"
        WHERE "userId" IS NULL
          AND "anonHash" = ${fingerprintShort}
          AND "createdAt" >= ${windowStart}
      `.then(rows => Number(rows[0].count));

      if (recentCount >= ANON_RATE_LIMIT_PER_IP) {
        return NextResponse.json(
          { error: "Too many check-ins. Try again later." },
          { status: 429 }
        );
      }

      const expiresAt = new Date(now.getTime() + ANON_CHECKIN_DURATION_MS);
      const id = crypto.randomUUID();

      // Use raw SQL for anonymous check-ins — Prisma 7 requires the user relation
      // even when userId is optional, so we bypass it for null userId
      await prisma.$executeRaw`
        INSERT INTO "CheckIn" ("id", "mode", "targetId", "lat", "lon", "expiresAt", "createdAt", "anonHash")
        VALUES (${id}, ${transitMode}::"TransitMode", ${targetId || null}, ${checkinLat}, ${checkinLon}, ${expiresAt}, ${now}, ${fingerprintShort})
      `;

      const checkIn = { id, mode: transitMode, targetId: targetId || null, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() };

      // Set a cookie with the fingerprint hash so we can loosely track
      // "this browser's check-in" without storing any personal data
      const response = NextResponse.json({ checkIn }, { status: 200 });
      response.cookies.set("anon_checkin", fingerprint, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: ANON_CHECKIN_DURATION_MS / 1000,
        path: "/",
      });
      return response;
    }
  } catch (error) {
    console.error("Error creating check-in:", error);
    return NextResponse.json(
      { error: "Failed to create check-in" },
      { status: 500 }
    );
  }
}

// DELETE /api/checkin — End check-in early (auth required)
export async function DELETE(request: NextRequest) {
  const csrfError = validateOrigin(request);
  if (csrfError) return csrfError;

  const sessionUser = await safeGetSession(auth);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.checkIn.deleteMany({
      where: { userId: user.id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting check-in:", error);
    return NextResponse.json(
      { error: "Failed to delete check-in" },
      { status: 500 }
    );
  }
}

// GET /api/checkin — Get current user's active check-in (auth required)
export async function GET() {
  const sessionUser = await safeGetSession(auth);

  if (!sessionUser) {
    return NextResponse.json({ checkIn: null });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ checkIn: null });
    }

    const checkIn = await prisma.checkIn.findFirst({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        mode: true,
        targetId: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({ checkIn });
  } catch (error) {
    console.error("Error fetching check-in:", error);
    return NextResponse.json({ checkIn: null });
  }
}
