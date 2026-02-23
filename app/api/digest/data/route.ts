/**
 * API: Weekly digest data (#42)
 *
 * Returns a weekly summary of community activity:
 * - Stats: new reviews, votes, active reviewers
 * - Top 5 most-upvoted issues
 * - Worst-rated lines/stops (problems)
 * - Best-rated lines/stops (highlights)
 *
 * Cached for 1 hour. No auth required (public).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600; // 1 hour

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_REVIEWS = 2;

export async function GET() {
  const now = new Date();
  const since = new Date(now.getTime() - WEEK_MS);

  // Week label e.g. "17–23 Feb 2026"
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const weekLabel = `${fmt(since)}–${fmt(now)} ${now.getFullYear()}`;

  try {
    // --- Stats ---
    const [newReviews, newVotes, activeReviewers] = await Promise.all([
      prisma.feedback.count({ where: { createdAt: { gte: since }, hidden: false } }),
      prisma.feedbackVote.count({ where: { createdAt: { gte: since } } }),
      prisma.feedback.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: since }, hidden: false },
      }).then((r) => r.length),
    ]);

    // --- Top 5 most-upvoted reviews this week ---
    const topUpvoted = await prisma.feedback.findMany({
      where: { createdAt: { gte: since }, hidden: false, comment: { not: null } },
      select: {
        id: true,
        type: true,
        targetId: true,
        rating: true,
        comment: true,
        tags: true,
        _count: { select: { votes: true } },
      },
      orderBy: { votes: { _count: "desc" } },
      take: 5,
    });

    // --- Worst-rated targets (issues) ---
    const worstRaw = await prisma.feedback.groupBy({
      by: ["type", "targetId"],
      where: { createdAt: { gte: since }, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
      having: { rating: { _count: { gte: MIN_REVIEWS } } },
      orderBy: { _avg: { rating: "asc" } },
      take: 5,
    });

    // --- Best-rated targets (highlights) ---
    const bestRaw = await prisma.feedback.groupBy({
      by: ["type", "targetId"],
      where: { createdAt: { gte: since }, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
      having: { rating: { _count: { gte: MIN_REVIEWS } } },
      orderBy: { _avg: { rating: "desc" } },
      take: 5,
    });

    const worst = worstRaw.map((r) => ({
      type: r.type,
      targetId: r.targetId,
      avg: Math.round((r._avg.rating ?? 0) * 10) / 10,
      count: r._count.rating,
    }));

    const best = bestRaw.map((r) => ({
      type: r.type,
      targetId: r.targetId,
      avg: Math.round((r._avg.rating ?? 0) * 10) / 10,
      count: r._count.rating,
    }));

    const topIssues = topUpvoted.map((r) => ({
      id: r.id,
      type: r.type,
      targetId: r.targetId,
      rating: r.rating,
      comment: r.comment,
      tags: r.tags,
      voteCount: r._count.votes,
    }));

    return NextResponse.json({
      weekLabel,
      since: since.toISOString(),
      until: now.toISOString(),
      stats: { newReviews, newVotes, activeReviewers },
      topIssues,
      worst,
      best,
    });
  } catch (err) {
    console.error("[digest/data]", err);
    return NextResponse.json({ error: "Failed to compute digest" }, { status: 500 });
  }
}
