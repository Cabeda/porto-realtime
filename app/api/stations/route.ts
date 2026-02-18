import { NextResponse } from "next/server";
import { OTPStopsResponseSchema } from "@/lib/schemas/otp";
import { fetchWithRetry, StaleCache } from "@/lib/api-fetch";

const OTP_URL =
  "https://otp.portodigital.pt/otp/routers/default/index/graphql";

const CACHE_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds
const staleCache = new StaleCache<unknown>(30 * 24 * 60 * 60 * 1000); // 30 days

export async function GET() {
  // Return fresh cached data immediately
  const cached = staleCache.get();
  if (cached?.fresh) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${7 * 24 * 60 * 60}`,
        "X-Cache-Status": "HIT",
      },
    });
  }

  try {
    const response = await fetchWithRetry(OTP_URL, {
      maxRetries: 3,
      timeoutMs: 15000,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://explore.porto.pt",
        },
        body: JSON.stringify({
          query: `query { stops { id code desc lat lon name gtfsId vehicleMode } }`,
        }),
      },
    });

    const raw = await response.json();

    const parsed = OTPStopsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("OTP stops response validation failed:", parsed.error.message);
    }

    const data = parsed.success ? parsed.data : raw;
    staleCache.set(data);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${7 * 24 * 60 * 60}`,
        "X-Cache-Status": "MISS",
      },
    });
  } catch (error) {
    console.error("Error fetching stations:", error);

    // Return stale data if available
    if (cached) {
      return NextResponse.json(cached.data, {
        headers: { "X-Cache-Status": "STALE" },
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch stations", data: { stops: [] } },
      { status: 500, headers: { "Cache-Control": "no-cache" } }
    );
  }
}
