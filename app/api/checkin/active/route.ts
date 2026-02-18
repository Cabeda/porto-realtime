import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Debounce expired check-in cleanup — run at most once per 60 seconds
let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60_000;

// GET /api/checkin/active — Public endpoint returning active check-ins aggregated by target
// Used by the map activity layer to show live transit activity on map elements
// Returns: { checkIns: [{ mode, targetId, lat, lon, count }], total, todayTotal }
export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Clean up expired check-ins at most once per minute (GDPR data minimization)
    if (Date.now() - lastCleanup > CLEANUP_INTERVAL_MS) {
      lastCleanup = Date.now();
      prisma.checkIn.deleteMany({
        where: { expiresAt: { lte: now } },
      }).catch((err) => console.error("Cleanup error:", err)); // fire-and-forget
    }

    // Get all active check-ins using raw SQL
    // Returns both infrastructure check-ins (with lat/lon) and user-location
    // check-ins (bike-here, walk, scooter — no lat/lon stored for privacy)
    const raw = await prisma.$queryRaw<
      { mode: string; targetId: string | null; lat: number | null; lon: number | null }[]
    >`
      SELECT "mode", "targetId", "lat", "lon"
      FROM "CheckIn"
      WHERE "expiresAt" > ${now}
    `;

    // Aggregate by mode+targetId — show count per target
    const grouped = new Map<string, { mode: string; targetId: string | null; lat: number | null; lon: number | null; count: number }>();
    for (const ci of raw) {
      const key = `${ci.mode}:${ci.targetId ?? "_"}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
      } else {
        grouped.set(key, {
          mode: ci.mode,
          targetId: ci.targetId,
          lat: ci.lat ?? null,
          lon: ci.lon ?? null,
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
          // no-cache forces browsers (including Firefox) to revalidate every time,
          // while s-maxage=0 + stale-while-revalidate handles CDN caching.
          // Without no-cache, Firefox may serve stale responses from its HTTP cache
          // even when SWR triggers a new fetch.
          "Cache-Control": "no-cache, no-store, must-revalidate, public, s-maxage=0, stale-while-revalidate=15",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching active check-ins:", error);
    return NextResponse.json({ checkIns: [], total: 0, todayTotal: 0 }, { status: 500 });
  }
}
