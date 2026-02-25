/**
 * API: Contributors leaderboard
 * GET /api/contributors
 *
 * Returns top contributors ranked by review count, with their badges.
 * Cached 1 hour — no auth required.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { batchComputeBadges, BADGES } from "@/lib/badges";

const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" };
const TOP_N = 50;

export async function GET() {
  try {
    // Top users by review count
    const topUsers = await prisma.feedback.groupBy({
      by: ["userId"],
      where: { hidden: false },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: TOP_N,
    });

    if (topUsers.length === 0) {
      return NextResponse.json({ contributors: [] }, { headers: CACHE });
    }

    const userIds = topUsers.map((u: { userId: string }) => u.userId);
    const badgeMap = await batchComputeBadges(userIds, prisma);

    // Total votes received per user
    const userFeedbackIds = await prisma.feedback.findMany({
      where: { userId: { in: userIds }, hidden: false },
      select: { id: true, userId: true },
    });
    const feedbackToUser = new Map<string, string>(userFeedbackIds.map((f) => [f.id, f.userId]));
    const feedbackIds = userFeedbackIds.map((f) => f.id);

    const voteStats =
      feedbackIds.length > 0
        ? await prisma.feedbackVote.groupBy({
            by: ["feedbackId"],
            where: { feedbackId: { in: feedbackIds } },
            _count: { id: true },
          })
        : [];

    const votesPerUser = new Map<string, number>();
    for (const v of voteStats) {
      const uid = feedbackToUser.get(v.feedbackId);
      if (!uid) continue;
      votesPerUser.set(uid, (votesPerUser.get(uid) ?? 0) + v._count.id);
    }

    const contributors = topUsers.map(
      (u: { userId: string; _count: { id: number } }, i: number) => {
        const badges = badgeMap.get(u.userId) ?? [];
        return {
          rank: i + 1,
          reviewCount: u._count.id,
          totalVotes: votesPerUser.get(u.userId) ?? 0,
          badges: badges.map((bid) => ({
            id: bid,
            emoji: BADGES[bid].emoji,
            label: BADGES[bid].label,
          })),
        };
      }
    );

    return NextResponse.json({ contributors }, { headers: CACHE });
  } catch (err) {
    console.error("Contributors API error:", err);
    return NextResponse.json({ error: "Failed to fetch contributors" }, { status: 500 });
  }
}
