import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = ["LINE", "STOP", "VEHICLE"] as const;
const MAX_TARGET_ID_LENGTH = 100;

// GET /api/feedback/rankings?type=LINE&sort=avg&order=desc&limit=50
// Optional: &targetId=205 — returns single target with full distribution
// Returns ranked list of targets with aggregated feedback data
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const sort = searchParams.get("sort") || "count"; // "avg" | "count"
  const order = searchParams.get("order") || "desc"; // "asc" | "desc"
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const targetId = searchParams.get("targetId"); // optional: single target detail

  if (!type) {
    return NextResponse.json(
      { error: "Missing required parameter: type" },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const feedbackType = type as "LINE" | "STOP" | "VEHICLE";

    // Single target detail mode — return full distribution
    if (targetId) {
      if (targetId.length > MAX_TARGET_ID_LENGTH) {
        return NextResponse.json(
          { error: `targetId must be at most ${MAX_TARGET_ID_LENGTH} chars` },
          { status: 400 }
        );
      }
      const [summaryResult, distribution] = await Promise.all([
        prisma.feedback.groupBy({
          by: ["targetId"],
          where: { type: feedbackType, targetId },
          _avg: { rating: true },
          _count: { rating: true },
        }),
        prisma.feedback.groupBy({
          by: ["rating"],
          where: { type: feedbackType, targetId },
          _count: { rating: true },
          orderBy: { rating: "asc" },
        }),
      ]);

      const summary = summaryResult[0];
      const dist = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
      for (const d of distribution) {
        if (d.rating >= 1 && d.rating <= 5) dist[d.rating - 1] = d._count.rating;
      }

      return NextResponse.json(
        {
          targetId,
          avg: summary ? Math.round((summary._avg.rating ?? 0) * 10) / 10 : 0,
          count: summary?._count.rating ?? 0,
          distribution: dist,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

    // Aggregate all feedback grouped by targetId
    const summaries = await prisma.feedback.groupBy({
      by: ["targetId"],
      where: { type: feedbackType },
      _avg: { rating: true },
      _count: { rating: true },
      orderBy: sort === "avg"
        ? { _avg: { rating: order === "asc" ? "asc" : "desc" } }
        : { _count: { rating: order === "asc" ? "asc" : "desc" } },
      take: limit,
    });

    // Get recent comments for each target (last 3 with comments)
    const targetIds = summaries.map((s: { targetId: string }) => s.targetId);
    const recentComments = targetIds.length > 0
      ? await prisma.feedback.findMany({
          where: {
            type: feedbackType,
            targetId: { in: targetIds },
            comment: { not: null },
          },
          orderBy: { createdAt: "desc" },
          take: targetIds.length * 3, // up to 3 per target
          select: {
            targetId: true,
            rating: true,
            comment: true,
            metadata: true,
            createdAt: true,
          },
        })
      : [];

    // Group comments by targetId (max 3 each)
    const commentsByTarget: Record<string, typeof recentComments> = {};
    for (const c of recentComments) {
      if (!commentsByTarget[c.targetId]) commentsByTarget[c.targetId] = [];
      if (commentsByTarget[c.targetId].length < 3) {
        commentsByTarget[c.targetId].push(c);
      }
    }

    const totalTargets = summaries.length;

    const rankings = summaries.map((s: { targetId: string; _avg: { rating: number | null }; _count: { rating: number } }) => ({
      targetId: s.targetId,
      avg: Math.round((s._avg.rating ?? 0) * 10) / 10,
      count: s._count.rating,
      recentComments: commentsByTarget[s.targetId] || [],
    }));

    return NextResponse.json(
      { rankings, totalTargets },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching feedback rankings:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback rankings" },
      { status: 500 }
    );
  }
}
