/**
 * Badge definitions and computation.
 * Badges are computed on-the-fly from existing Feedback/FeedbackVote data.
 * No separate model needed.
 */

import type { PrismaClient } from "@/prisma/generated/prisma/client";

export type BadgeId =
  | "FIRST_REVIEW"
  | "TRANSIT_VOICE"
  | "COMMUNITY_CHAMPION"
  | "HELPFUL_REVIEWER"
  | "NETWORK_EXPLORER";

export interface Badge {
  id: BadgeId;
  emoji: string;
  label: string;
  labelPt: string;
  description: string;
  descriptionPt: string;
}

export const BADGES: Record<BadgeId, Badge> = {
  FIRST_REVIEW: {
    id: "FIRST_REVIEW",
    emoji: "🌱",
    label: "First Review",
    labelPt: "Primeira Avaliação",
    description: "Left their first review",
    descriptionPt: "Deixou a primeira avaliação",
  },
  TRANSIT_VOICE: {
    id: "TRANSIT_VOICE",
    emoji: "🗣️",
    label: "Porto Transit Voice",
    labelPt: "Voz do Trânsito",
    description: "Left 10+ reviews",
    descriptionPt: "Deixou 10+ avaliações",
  },
  COMMUNITY_CHAMPION: {
    id: "COMMUNITY_CHAMPION",
    emoji: "🏆",
    label: "Community Champion",
    labelPt: "Campeão da Comunidade",
    description: "Left 100+ reviews",
    descriptionPt: "Deixou 100+ avaliações",
  },
  HELPFUL_REVIEWER: {
    id: "HELPFUL_REVIEWER",
    emoji: "👍",
    label: "Helpful Reviewer",
    labelPt: "Avaliador Útil",
    description: "Reviews received 50+ upvotes",
    descriptionPt: "Avaliações receberam 50+ votos",
  },
  NETWORK_EXPLORER: {
    id: "NETWORK_EXPLORER",
    emoji: "🗺️",
    label: "Network Explorer",
    labelPt: "Explorador da Rede",
    description: "Reviewed 10+ different lines or stops",
    descriptionPt: "Avaliou 10+ linhas ou paragens diferentes",
  },
};

export interface UserBadgeStats {
  userId: string;
  reviewCount: number;
  totalVotesReceived: number;
  uniqueTargets: number;
  badges: BadgeId[];
}

/** Compute badges for a single user given their stats */
export function computeBadgesFromStats(stats: {
  reviewCount: number;
  totalVotesReceived: number;
  uniqueTargets: number;
}): BadgeId[] {
  const badges: BadgeId[] = [];
  if (stats.reviewCount >= 1) badges.push("FIRST_REVIEW");
  if (stats.reviewCount >= 10) badges.push("TRANSIT_VOICE");
  if (stats.reviewCount >= 100) badges.push("COMMUNITY_CHAMPION");
  if (stats.totalVotesReceived >= 50) badges.push("HELPFUL_REVIEWER");
  if (stats.uniqueTargets >= 10) badges.push("NETWORK_EXPLORER");
  return badges;
}

/**
 * Batch-compute badges for a list of userIds.
 * Returns a map of userId -> BadgeId[].
 * Uses 3 queries regardless of how many users.
 */
export async function batchComputeBadges(
  userIds: string[],
  prisma: PrismaClient
): Promise<Map<string, BadgeId[]>> {
  if (userIds.length === 0) return new Map();

  const unique = [...new Set(userIds)];

  // 1. Review counts + unique targets per user
  const reviewStats = await prisma.feedback.groupBy({
    by: ["userId"],
    where: { userId: { in: unique }, hidden: false },
    _count: { id: true },
  });

  // 2. Unique targets per user
  const allFeedbacks = await prisma.feedback.findMany({
    where: { userId: { in: unique }, hidden: false },
    select: { userId: true, targetId: true },
  });

  const uniqueTargetsMap = new Map<string, Set<string>>();
  for (const f of allFeedbacks) {
    if (!uniqueTargetsMap.has(f.userId)) uniqueTargetsMap.set(f.userId, new Set());
    uniqueTargetsMap.get(f.userId)!.add(f.targetId);
  }

  // 3. Total votes received per user (via their feedbacks)
  const userFeedbackIds = await prisma.feedback.findMany({
    where: { userId: { in: unique }, hidden: false },
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

  // Assemble
  const result = new Map<string, BadgeId[]>();
  for (const uid of unique) {
    const rc =
      reviewStats.find((r: { userId: string; _count: { id: number } }) => r.userId === uid)?._count
        .id ?? 0;
    const votes = votesPerUser.get(uid) ?? 0;
    const targets = uniqueTargetsMap.get(uid)?.size ?? 0;
    result.set(
      uid,
      computeBadgesFromStats({
        reviewCount: rc,
        totalVotesReceived: votes,
        uniqueTargets: targets,
      })
    );
  }

  return result;
}
