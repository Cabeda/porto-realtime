import { NextResponse } from "next/server";

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

    const data = await response.json();

    if (response.ok) {
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${7 * 24 * 60 * 60}`,
        },
      });
    } else {
      return NextResponse.json(data, {
        status: response.status,
        headers: { "Cache-Control": "no-cache" },
      });
    }
  } catch (error) {
    console.error("Error fetching stations:", error);
    return NextResponse.json(
      { error: "Failed to fetch stations", data: { stops: [] } },
      { status: 500, headers: { "Cache-Control": "no-cache" } }
    );
  }
}
