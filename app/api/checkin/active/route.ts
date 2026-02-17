import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Round coordinate to ~111m precision (3 decimal places) for privacy */
function fuzzCoord(val: number | null): number | null {
  if (val === null) return null;
  return Math.round(val * 1000) / 1000;
}

// GET /api/checkin/active — Public endpoint returning active check-ins with locations
// Used by the map activity layer to show live transit activity bubbles
// Coordinates are fuzzed to ~111m precision to protect user privacy (GDPR)
// Returns: { checkIns: [{ mode, lat, lon, targetId }] }
export async function GET() {
  try {
    const now = new Date();

    // Clean up expired check-ins to minimize stored location data (GDPR data minimization)
    await prisma.checkIn.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    const checkIns = await prisma.checkIn.findMany({
      where: {
        expiresAt: { gt: now },
        lat: { not: null },
        lon: { not: null },
      },
      select: {
        mode: true,
        targetId: true,
        lat: true,
        lon: true,
      },
    });

    // Fuzz coordinates before sending to client — never expose exact locations
    const fuzzedCheckIns = checkIns.map((c) => ({
      mode: c.mode,
      targetId: c.targetId,
      lat: fuzzCoord(c.lat),
      lon: fuzzCoord(c.lon),
    }));

    return NextResponse.json(
      { checkIns: fuzzedCheckIns },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching active check-ins:", error);
    return NextResponse.json({ checkIns: [] }, { status: 500 });
  }
}
