import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = ["LINE", "STOP", "VEHICLE", "BIKE_PARK", "BIKE_LANE"] as const;
const MAX_TARGET_ID_LENGTH = 100;

// GET /api/feedback/summary?type=STOP&targetIds=2:BRRS2,2:ABCDE,2:XYZQR
// Returns { "2:BRRS2": { avg: 4.2, count: 15 }, "2:ABCDE": { avg: 3.8, count: 7 }, ... }
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const targetIdsParam = searchParams.get("targetIds");

  if (!type || !targetIdsParam) {
    return NextResponse.json(
      { error: "Missing required parameters: type and targetIds" },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const targetIds = targetIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= MAX_TARGET_ID_LENGTH);

  if (targetIds.length === 0) {
    return NextResponse.json(
      { error: "targetIds must contain at least one ID" },
      { status: 400 }
    );
  }

  // Cap at 100 to prevent abuse
  if (targetIds.length > 100) {
    return NextResponse.json(
      { error: "Maximum 100 targetIds per request" },
      { status: 400 }
    );
  }

  try {
    const feedbackType = type as "LINE" | "STOP" | "VEHICLE" | "BIKE_PARK" | "BIKE_LANE";

    // Use groupBy for efficient aggregation
    const summaries = await prisma.feedback.groupBy({
      by: ["targetId"],
      where: {
        type: feedbackType,
        targetId: { in: targetIds },
      },
      _avg: { rating: true },
      _count: { rating: true },
    });

    // Build result map — only include targets that have feedback
    const result: Record<string, { avg: number; count: number }> = {};
    for (const summary of summaries) {
      result[summary.targetId] = {
        avg: Math.round((summary._avg.rating ?? 0) * 10) / 10,
        count: summary._count.rating,
      };
    }

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching feedback summaries:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback summaries" },
      { status: 500 }
    );
  }
}
