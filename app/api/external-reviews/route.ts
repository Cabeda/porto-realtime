/**
 * GET /api/external-reviews
 *
 * Returns recent external app store reviews for the STCP app.
 * Query params:
 *   source: "play" | "appstore" | omit for both
 *   limit: 1-50 (default 20)
 *   minRating: 1-5 filter
 *
 * Cached 1h (public).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const rawLimit = parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(isNaN(rawLimit) || rawLimit <= 0 ? 20 : rawLimit, 50);
  const rawMin = parseInt(searchParams.get("minRating") || "1", 10);
  const minRating = isNaN(rawMin) ? 1 : Math.max(1, Math.min(5, rawMin));

  const where: Record<string, unknown> = { rating: { gte: minRating } };
  if (source === "play" || source === "appstore") where.source = source;

  try {
    const [reviews, total] = await Promise.all([
      prisma.externalReview.findMany({
        where,
        orderBy: { reviewedAt: "desc" },
        take: limit,
        select: {
          id: true,
          source: true,
          rating: true,
          title: true,
          text: true,
          thumbsUp: true,
          reviewedAt: true,
        },
      }),
      prisma.externalReview.count({ where }),
    ]);

    return NextResponse.json(
      { reviews, total },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
    );
  } catch (err) {
    console.error("[external-reviews]", err);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}
