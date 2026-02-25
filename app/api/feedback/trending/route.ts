/**
 * API: Trending issues + positive highlights (#37, #38)
 *
 * Returns:
 * - topIssues: lowest-rated targets with most reviews (problems)
 * - trending: reviews gaining upvotes rapidly in the time window
 * - highlights: highest-rated targets with enough reviews (what's working)
 *
 * Query params:
 * - period: "week" | "month" | "all" (default: "week")
 * - limit: number (default: 10, max: 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type FeedbackType = "LINE" | "STOP" | "VEHICLE" | "BIKE_PARK" | "BIKE_LANE";

const PERIOD_DAYS: Record<string, number> = {
  week: 7,
  month: 30,
  all: 3650, // ~10 years
};

// Minimum reviews to qualify for highlights
const MIN_REVIEWS_FOR_HIGHLIGHT = 2;

function formatAggregated(
  raw: {
    type: string;
    targetId: string;
    _avg: { rating: number | null };
    _count: { rating: number };
  }[],
  commentMap: Record<string, { rating: number; comment: string; tags: string[]; createdAt: Date }>
) {
  return raw.map((r) => ({
    type: r.type,
    targetId: r.targetId,
    avg: Math.round((r._avg.rating ?? 0) * 10) / 10,
    count: r._count.rating,
    recentComment: commentMap[`${r.type}:${r.targetId}`] || null,
  }));
}

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "week";
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "10", 10), 50);

  const days = PERIOD_DAYS[period] ?? 7;
  const since = new Date(Date.now() - days * 86400000);

  try {
    // --- Top Issues: lowest-rated targets with enough reviews ---
    const topIssuesRaw = await prisma.feedback.groupBy({
      by: ["type", "targetId"],
      where: { createdAt: { gte: since }, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
      having: { rating: { _count: { gte: MIN_REVIEWS_FOR_HIGHLIGHT } } },
      orderBy: { _avg: { rating: "asc" } },
      take: limit,
    });

    // --- Highlights: highest-rated targets with enough reviews ---
    const highlightsRaw = await prisma.feedback.groupBy({
      by: ["type", "targetId"],
      where: { createdAt: { gte: since }, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
      having: { rating: { _count: { gte: MIN_REVIEWS_FOR_HIGHLIGHT } } },
      orderBy: { _avg: { rating: "desc" } },
      take: limit,
    });

    // --- Trending: reviews with most upvotes in the period ---
    const trendingReviews = await prisma.feedback.findMany({
      where: {
        createdAt: { gte: since },
        hidden: false,
        comment: { not: null },
      },
      orderBy: { votes: { _count: "desc" } },
      take: limit,
      select: {
        id: true,
        type: true,
        targetId: true,
        rating: true,
        comment: true,
        tags: true,
        metadata: true,
        createdAt: true,
        _count: { select: { votes: true } },
      },
    });

    // Get recent comments for top issues and highlights
    const allTargetKeys = [
      ...topIssuesRaw.map((t) => `${t.type}:${t.targetId}`),
      ...highlightsRaw.map((t) => `${t.type}:${t.targetId}`),
    ];
    const uniqueTargets = Array.from(new Set(allTargetKeys)).slice(0, 40);

    // Fetch one recent comment per target for context
    const targetPairs = uniqueTargets.map((k) => {
      const [type, ...rest] = k.split(":");
      return { type: type as FeedbackType, targetId: rest.join(":") };
    });

    const recentComments =
      targetPairs.length > 0
        ? await prisma.feedback.findMany({
            where: {
              OR: targetPairs.map((t) => ({
                type: t.type,
                targetId: t.targetId,
              })),
              comment: { not: null },
              hidden: false,
            },
            orderBy: { createdAt: "desc" },
            take: targetPairs.length * 2,
            select: {
              type: true,
              targetId: true,
              rating: true,
              comment: true,
              tags: true,
              createdAt: true,
            },
          })
        : [];

    // Index comments by type:targetId (first one per target)
    const commentMap: Record<
      string,
      { rating: number; comment: string; tags: string[]; createdAt: Date }
    > = {};
    for (const c of recentComments) {
      const key = `${c.type}:${c.targetId}`;
      if (!commentMap[key] && c.comment) {
        commentMap[key] = {
          rating: c.rating,
          comment: c.comment,
          tags: c.tags,
          createdAt: c.createdAt,
        };
      }
    }

    // Format results
    const topIssues = formatAggregated(topIssuesRaw, commentMap);
    const highlightsFormatted = formatAggregated(highlightsRaw, commentMap);

    // Format trending reviews
    const trending = trendingReviews.map((r) => ({
      id: r.id,
      type: r.type,
      targetId: r.targetId,
      rating: r.rating,
      comment: r.comment,
      tags: r.tags,
      metadata: r.metadata,
      createdAt: r.createdAt,
      voteCount: r._count.votes,
    }));

    // --- Overall stats for the period ---
    const [totalReviews, totalVotes, activeReviewers] = await Promise.all([
      prisma.feedback.count({
        where: { createdAt: { gte: since }, hidden: false },
      }),
      prisma.feedbackVote.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.feedback
        .groupBy({
          by: ["userId"],
          where: { createdAt: { gte: since }, hidden: false },
        })
        .then((r) => r.length),
    ]);

    // Tag distribution for the period
    const allTags = await prisma.feedback.findMany({
      where: {
        createdAt: { gte: since },
        hidden: false,
        tags: { isEmpty: false },
      },
      select: { tags: true },
    });

    const tagCounts: Record<string, number> = {};
    for (const f of allTags) {
      for (const tag of f.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return NextResponse.json(
      {
        period,
        since: since.toISOString(),
        stats: { totalReviews, totalVotes, activeReviewers },
        topTags,
        topIssues,
        highlights: highlightsFormatted,
        trending,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Trending API error:", error);
    return NextResponse.json({ error: "Failed to fetch trending data" }, { status: 500 });
  }
}
