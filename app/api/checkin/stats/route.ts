import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/checkin/stats — Public endpoint, cached 30s
// Returns: { total, byMode, todayTotal }
export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Count active check-ins (not expired) grouped by mode
    const activeCheckIns = await prisma.checkIn.groupBy({
      by: ["mode"],
      where: {
        expiresAt: { gt: now },
      },
      _count: true,
    });

    // Count all check-ins created today
    const todayTotal = await prisma.checkIn.count({
      where: {
        createdAt: { gte: todayStart },
      },
    });

    const byMode: Record<string, number> = {
      BUS: 0,
      METRO: 0,
      BIKE: 0,
      WALK: 0,
      SCOOTER: 0,
    };

    let total = 0;
    for (const group of activeCheckIns) {
      byMode[group.mode] = group._count;
      total += group._count;
    }

    return NextResponse.json(
      { total, byMode, todayTotal },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate, public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching check-in stats:", error);
    return NextResponse.json(
      { total: 0, byMode: { BUS: 0, METRO: 0, BIKE: 0, WALK: 0, SCOOTER: 0 }, todayTotal: 0 },
      { status: 500 }
    );
  }
}
