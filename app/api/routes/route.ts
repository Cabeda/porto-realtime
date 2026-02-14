import { NextResponse } from "next/server";
import { OTPRoutesSimpleResponseSchema } from "@/lib/schemas/otp";
import type { RouteInfo } from "@/lib/types";

// In-memory cache
let routesCache: RouteInfo[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function GET() {
  const now = Date.now();

  // Return cached data if still valid
  if (routesCache && now - cacheTimestamp < CACHE_DURATION) {
    return NextResponse.json(
      { routes: routesCache },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
          "X-Cache-Status": "HIT",
        },
      }
    );
  }

  try {
    const response = await fetch(
      "https://otp.portodigital.pt/otp/routers/default/index/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://explore.porto.pt",
        },
        body: JSON.stringify({
          query: `query { routes { gtfsId shortName longName mode } }`,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`OTP API returned ${response.status}`);
    }

    const raw = await response.json();
    const parsed = OTPRoutesSimpleResponseSchema.safeParse(raw);

    if (!parsed.success) {
      console.warn("OTP routes response validation failed:", parsed.error.message);
      // Try raw data as fallback
      if (!raw?.data?.routes) {
        throw new Error("Invalid response from OTP API");
      }
    }

    const validatedRoutes = parsed.success ? parsed.data.data.routes : raw.data.routes;

    const routes: RouteInfo[] = validatedRoutes
      .map((r: { shortName: string; longName: string; mode: string; gtfsId: string }) => ({
        shortName: r.shortName,
        longName: r.longName,
        mode: r.mode as RouteInfo["mode"],
        gtfsId: r.gtfsId,
      }))
      .sort((a: RouteInfo, b: RouteInfo) => {
        // Sort: BUS first, then SUBWAY; within each, numeric then alpha
        if (a.mode !== b.mode) {
          if (a.mode === "BUS") return -1;
          if (b.mode === "BUS") return 1;
          return a.mode.localeCompare(b.mode);
        }
        const aNum = parseInt(a.shortName);
        const bNum = parseInt(b.shortName);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        if (!isNaN(aNum)) return -1;
        if (!isNaN(bNum)) return 1;
        return a.shortName.localeCompare(b.shortName);
      });

    routesCache = routes;
    cacheTimestamp = now;

    return NextResponse.json(
      { routes },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
          "X-Cache-Status": "MISS",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching routes:", error);

    if (routesCache) {
      return NextResponse.json(
        { routes: routesCache },
        { headers: { "X-Cache-Status": "STALE" } }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch routes", routes: [] },
      { status: 500 }
    );
  }
}
