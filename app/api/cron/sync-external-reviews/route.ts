/**
 * Cron: Sync external app store reviews (#46)
 *
 * Fetches the latest reviews for the STCP app from Google Play and the
 * App Store, then upserts them into ExternalReview.
 *
 * Authenticated via CRON_SECRET.
 * Schedule: daily at 04:00 UTC (add to vercel.json crons).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchPlayReviews,
  fetchAppStoreReviews,
  STCP_PLAY_ID,
  STCP_APPSTORE_ID,
} from "@/lib/scraper";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [playReviews, appStoreReviews] = await Promise.all([
    fetchPlayReviews(STCP_PLAY_ID, 200),
    fetchAppStoreReviews(STCP_APPSTORE_ID, 200),
  ]);

  const all = [...playReviews, ...appStoreReviews];

  if (all.length === 0) {
    return NextResponse.json({ upserted: 0, message: "No reviews fetched" });
  }

  // Upsert in batches of 50
  let upserted = 0;
  for (let i = 0; i < all.length; i += 50) {
    const batch = all.slice(i, i + 50);
    await Promise.all(
      batch.map((r) =>
        prisma.externalReview.upsert({
          where: { id: r.id },
          create: {
            id: r.id,
            source: r.source,
            appId: r.appId,
            rating: r.rating,
            title: r.title,
            text: r.text,
            thumbsUp: r.thumbsUp,
            reviewedAt: r.reviewedAt,
          },
          update: {
            rating: r.rating,
            title: r.title,
            text: r.text,
            thumbsUp: r.thumbsUp,
            fetchedAt: new Date(),
          },
        })
      )
    );
    upserted += batch.length;
  }

  return NextResponse.json({ upserted, play: playReviews.length, appstore: appStoreReviews.length });
}
