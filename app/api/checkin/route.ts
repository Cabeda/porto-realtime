import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createHash } from "crypto";
import { validateOrigin, safeGetSession } from "@/lib/security";

const VALID_MODES = ["BUS", "METRO", "BIKE"] as const;
const AUTH_CHECKIN_DURATION_MS = 60 * 60 * 1000; // 1 hour for authenticated
const ANON_CHECKIN_DURATION_MS = 30 * 60 * 1000; // 30 min for anonymous
const ANON_RATE_LIMIT_PER_IP = 5; // max 5 anonymous check-ins per fingerprint per window
const ANON_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_TARGET_ID_LENGTH = 100;

// Porto metropolitan area bounding box — rejects coordinates clearly outside the region
const PORTO_BOUNDS = {
  minLat: 40.95,
  maxLat: 41.35,
  minLon: -8.80,
  maxLon: -8.45,
};

// Max plausible speed in km/h — anything faster is likely GPS spoofing
const MAX_SPEED_KMH = 200;

/** Haversine distance in km between two points */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Check if coordinates are within the Porto metropolitan area */
function isWithinPortoBounds(lat: number, lon: number): boolean {
  return lat >= PORTO_BOUNDS.minLat && lat <= PORTO_BOUNDS.maxLat
    && lon >= PORTO_BOUNDS.minLon && lon <= PORTO_BOUNDS.maxLon;
}

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
// lat/lon: infrastructure coords for stops/parks; null for bike-here/walk/scooter (privacy)
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

  // Anti-spoofing: reject coordinates outside Porto metropolitan area
  if (checkinLat !== null && checkinLon !== null && !isWithinPortoBounds(checkinLat, checkinLon)) {
    return NextResponse.json(
      { error: "Coordinates outside service area" },
      { status: 400 }
    );
  }

  const transitMode = mode as "BUS" | "METRO" | "BIKE";
  const now = new Date();

  try {
    // Anti-spoofing: velocity check — reject if implied speed from last check-in is unrealistic
    // Works for both auth and anon users
    const fingerprint = sessionUser ? null : anonFingerprint(request);
    const fingerprintShort = fingerprint ? fingerprint.slice(0, 16) : null;

    if (checkinLat !== null && checkinLon !== null) {
      let prevCheckIn: { lat: number; lon: number; createdAt: Date }[] = [];

      if (sessionUser) {
        const user = await prisma.user.findUnique({
          where: { email: sessionUser.email },
          select: { id: true },
        });
        if (user) {
          prevCheckIn = await prisma.checkIn.findMany({
            where: { userId: user.id },
            select: { lat: true, lon: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          }) as { lat: number; lon: number; createdAt: Date }[];
        }
      } else if (fingerprintShort) {
        prevCheckIn = await prisma.$queryRaw<{ lat: number; lon: number; createdAt: Date }[]>`
          SELECT "lat", "lon", "createdAt" FROM "CheckIn"
          WHERE "userId" IS NULL AND "anonHash" = ${fingerprintShort}
          ORDER BY "createdAt" DESC LIMIT 1
        `;
      }

      if (prevCheckIn.length > 0 && prevCheckIn[0].lat != null && prevCheckIn[0].lon != null) {
        const prev = prevCheckIn[0];
        const distKm = haversineKm(prev.lat, prev.lon, checkinLat, checkinLon);
        const timeDiffHours = (now.getTime() - new Date(prev.createdAt).getTime()) / (1000 * 60 * 60);
        if (timeDiffHours > 0 && distKm / timeDiffHours > MAX_SPEED_KMH) {
          return NextResponse.json(
            { error: "Location change too fast. Please try again later." },
            { status: 400 }
          );
        }
      }
    }
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
      // fingerprint/fingerprintShort already computed above for velocity check
      const windowStart = new Date(now.getTime() - ANON_RATE_LIMIT_WINDOW_MS);

      // Check if this anonymous user already has an active (non-expired) check-in
      const existingActive = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "CheckIn"
        WHERE "userId" IS NULL
          AND "anonHash" = ${fingerprintShort}
          AND "expiresAt" > ${now}
      `.then(rows => Number(rows[0].count));

      if (existingActive > 0) {
        return NextResponse.json(
          { error: "ALREADY_CHECKED_IN", message: "You already have an active check-in. Wait for it to expire or sign in to change it." },
          { status: 409 }
        );
      }

      // Rate limit: count recent anonymous check-ins from this fingerprint (including expired)
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
      response.cookies.set("anon_checkin", fingerprint!, {
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
