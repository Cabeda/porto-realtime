/**
 * External review scraper (#46)
 *
 * Fetches reviews for the STCP app from:
 * - Google Play Store (google-play-scraper) — ToS-compliant public data
 * - Apple App Store (app-store-scraper) — ToS-compliant public data
 *
 * STCP app IDs:
 *   Play Store: pt.stcp.android
 *   App Store:  id1234567890 (Portugal store)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gplay = require("google-play-scraper");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appStore = require("app-store-scraper");

export const STCP_PLAY_ID = "pt.stcp.android";
export const STCP_APPSTORE_ID = 1_234_567_890; // placeholder — update with real ID

export interface ScrapedReview {
  id: string; // "play:<reviewId>" or "appstore:<id>"
  source: "play" | "appstore";
  appId: string;
  rating: number;
  title: string | null;
  text: string | null;
  thumbsUp: number;
  reviewedAt: Date;
}

export async function fetchPlayReviews(
  appId: string,
  num = 200
): Promise<ScrapedReview[]> {
  try {
    const result = await gplay.reviews({
      appId,
      lang: "pt",
      country: "pt",
      sort: gplay.sort?.NEWEST ?? 2,
      num,
    });
    const data: {
      id: string;
      score: number;
      title: string | null;
      text: string | null;
      thumbsUp: number;
      date: Date;
    }[] = Array.isArray(result) ? result : result.data ?? [];

    return data.map((r) => ({
      id: `play:${r.id}`,
      source: "play" as const,
      appId,
      rating: Math.round(r.score),
      title: r.title ?? null,
      text: r.text ?? null,
      thumbsUp: r.thumbsUp ?? 0,
      reviewedAt: new Date(r.date),
    }));
  } catch (err) {
    console.error("[scraper] Play Store fetch failed:", err);
    return [];
  }
}

export async function fetchAppStoreReviews(
  appId: number,
  num = 200
): Promise<ScrapedReview[]> {
  try {
    const data: {
      id: string;
      score: number;
      title: string | null;
      text: string | null;
      date: Date;
    }[] = await appStore.reviews({
      id: appId,
      country: "pt",
      sort: appStore.sort?.RECENT ?? 0,
      num,
    });

    return data.map((r) => ({
      id: `appstore:${r.id}`,
      source: "appstore" as const,
      appId: String(appId),
      rating: Math.round(r.score),
      title: r.title ?? null,
      text: r.text ?? null,
      thumbsUp: 0,
      reviewedAt: new Date(r.date),
    }));
  } catch (err) {
    console.error("[scraper] App Store fetch failed:", err);
    return [];
  }
}
