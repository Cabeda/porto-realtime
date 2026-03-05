/**
 * Cache header helpers for analytics API routes.
 *
 * - cacheUntilNextHour(): for hourly-bucketed data (speed, fleet).
 *   TTL = seconds remaining in the current UTC hour.
 *
 * - cacheFor(seconds): for live data polled on a fixed interval (5 min default).
 *   Keeps Vercel CDN warm between polls without serving stale data too long.
 */

type CacheHeader = { "Cache-Control": string };

export const CACHE_1DAY: CacheHeader = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
};

export function cacheUntilNextHour(): CacheHeader {
  const now = new Date();
  const ttl = Math.max((60 - now.getUTCMinutes()) * 60 - now.getUTCSeconds(), 60);
  return { "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=60` };
}

export function cacheFor(seconds: number): CacheHeader {
  return {
    "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${Math.round(seconds / 5)}`,
  };
}
