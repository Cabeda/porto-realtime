import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const VALID_MODES = ["BUS", "METRO", "BIKE", "WALK", "SCOOTER"] as const;
const CHECKIN_DURATION_MS = 60 * 60 * 1000; // 1 hour

// POST /api/checkin — Create or replace a check-in (auth required)
// Body: { mode: "BUS", targetId?: "205" }
export async function POST(request: NextRequest) {
  const { data: session } = await auth.getSession();
  const sessionUser = session?.user ?? null;

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const user = await prisma.user.upsert({
    where: { email: sessionUser.email },
    update: {},
    create: { email: sessionUser.email, emailVerified: new Date() },
    select: { id: true },
  });

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

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHECKIN_DURATION_MS);
    const transitMode = mode as "BUS" | "METRO" | "BIKE" | "WALK" | "SCOOTER";

    // Delete any existing active check-in for this user
    await prisma.checkIn.deleteMany({
      where: { userId: user.id },
    });

    // Validate optional lat/lon
    const checkinLat = typeof lat === "number" && lat >= -90 && lat <= 90 ? lat : null;
    const checkinLon = typeof lon === "number" && lon >= -180 && lon <= 180 ? lon : null;

    // Create new check-in
    const checkIn = await prisma.checkIn.create({
      data: {
        userId: user.id,
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
  } catch (error) {
    console.error("Error creating check-in:", error);
    return NextResponse.json(
      { error: "Failed to create check-in" },
      { status: 500 }
    );
  }
}

// DELETE /api/checkin — End check-in early (auth required)
export async function DELETE() {
  const { data: session } = await auth.getSession();
  const sessionUser = session?.user ?? null;

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

// GET /api/checkin — Get current user's active check-in
export async function GET() {
  const { data: session } = await auth.getSession();
  const sessionUser = session?.user ?? null;

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
