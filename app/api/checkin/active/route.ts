import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/checkin/active — Public endpoint returning active check-ins aggregated by target
// Used by the map activity layer to show live transit activity on map elements
// Returns: { checkIns: [{ mode, targetId, lat, lon, count }], total, todayTotal }
export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Clean up expired check-ins (GDPR data minimization)
    await prisma.checkIn.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    // Get all active check-ins with locations
    const raw = await prisma.checkIn.findMany({
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

    // Aggregate by mode+targetId — show count per target
    const grouped = new Map<string, { mode: string; targetId: string | null; lat: number; lon: number; count: number }>();
    for (const ci of raw) {
      const key = `${ci.mode}:${ci.targetId ?? "_"}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
      } else {
        grouped.set(key, {
          mode: ci.mode,
          targetId: ci.targetId,
          lat: ci.lat!,
          lon: ci.lon!,
          count: 1,
        });
      }
    }

    // Count total active and today's total
    const total = raw.length;
    const todayTotal = await prisma.checkIn.count({
      where: { createdAt: { gte: todayStart } },
    });

    return NextResponse.json(
      {
        checkIns: Array.from(grouped.values()),
        total,
        todayTotal,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching active check-ins:", error);
    return NextResponse.json({ checkIns: [], total: 0, todayTotal: 0 }, { status: 500 });
  }
}
