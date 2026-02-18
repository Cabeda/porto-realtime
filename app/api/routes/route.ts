import { NextResponse } from "next/server";
import { OTPRoutesSimpleResponseSchema } from "@/lib/schemas/otp";
import { fetchWithRetry, StaleCache } from "@/lib/api-fetch";
import { toTitleCase } from "@/lib/strings";
import type { RouteInfo } from "@/lib/types";

const staleCache = new StaleCache<RouteInfo[]>(24 * 60 * 60 * 1000); // 24 hours

export async function GET() {
  // Return fresh cached data immediately
  const cached = staleCache.get();
  if (cached?.fresh) {
    return NextResponse.json(
      { routes: cached.data },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
          "X-Cache-Status": "HIT",
        },
      }
    );
  }

  try {
    const response = await fetchWithRetry(
      "https://otp.portodigital.pt/otp/routers/default/index/graphql",
      {
        maxRetries: 3,
        timeoutMs: 15000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://explore.porto.pt",
          },
          body: JSON.stringify({
            query: `query { routes { gtfsId shortName longName mode } }`,
          }),
        },
      }
    );

    const raw = await response.json();
    const parsed = OTPRoutesSimpleResponseSchema.safeParse(raw);

    if (!parsed.success) {
      console.warn("OTP routes response validation failed:", parsed.error.message);
      if (!raw?.data?.routes) {
        throw new Error("Invalid response from OTP API");
      }
    }

    const validatedRoutes = parsed.success ? parsed.data.data.routes : raw.data.routes;

    const routes: RouteInfo[] = validatedRoutes
      .map((r: { shortName: string; longName: string; mode: string; gtfsId: string }) => ({
        shortName: r.shortName,
        longName: toTitleCase(r.longName),
        mode: r.mode as RouteInfo["mode"],
        gtfsId: r.gtfsId,
      }))
      .sort((a: RouteInfo, b: RouteInfo) => {
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

    staleCache.set(routes);

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

    if (cached) {
      return NextResponse.json(
        { routes: cached.data },
        { headers: { "X-Cache-Status": "STALE" } }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch routes", routes: [] },
      { status: 500 }
    );
  }
}
