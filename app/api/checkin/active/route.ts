import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/checkin/active — Public endpoint returning active check-ins with locations
// Used by the map activity layer to show live transit activity bubbles
// Returns: { checkIns: [{ mode, lat, lon, targetId }] }
export async function GET() {
  try {
    const now = new Date();

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

    return NextResponse.json(
      { checkIns },
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
