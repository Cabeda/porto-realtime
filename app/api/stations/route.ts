import { NextResponse } from "next/server";
import { OTPStopsResponseSchema } from "@/lib/schemas/otp";

const OTP_URL =
  "https://otp.portodigital.pt/otp/routers/default/index/graphql";

const CACHE_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds

export async function GET() {
  try {
    const response = await fetch(OTP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://explore.porto.pt",
      },
      body: JSON.stringify({
        query: `query { stops { id code desc lat lon name gtfsId } }`,
      }),
    });

    const raw = await response.json();

    if (!response.ok) {
      return NextResponse.json(raw, {
        status: response.status,
        headers: { "Cache-Control": "no-cache" },
      });
    }

    const parsed = OTPStopsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("OTP stops response validation failed:", parsed.error.message);
      // Return raw data as fallback — the client can still try to use it
      return NextResponse.json(raw, {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${7 * 24 * 60 * 60}`,
        },
      });
    }

    return NextResponse.json(parsed.data, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${7 * 24 * 60 * 60}`,
      },
    });
  } catch (error) {
    console.error("Error fetching stations:", error);
    return NextResponse.json(
      { error: "Failed to fetch stations", data: { stops: [] } },
      { status: 500, headers: { "Cache-Control": "no-cache" } }
    );
  }
}
