import { type NextRequest, NextResponse } from "next/server";
import { OTPStationDeparturesResponseSchema } from "@/lib/schemas/otp";
import { fetchWithRetry, KeyedStaleCache } from "@/lib/api-fetch";

const OTP_URL = "https://otp.portodigital.pt/otp/routers/default/index/graphql";

// Per-stop stale cache (60 seconds — departures are time-sensitive)
const staleCache = new KeyedStaleCache<unknown>(60 * 1000, 200);

const QUERY = `
  query StopDepartures(
    $id: String!
    $startTime: Long!
    $timeRange: Int!
    $numberOfDepartures: Int!
  ) {
    stop(id: $id) {
      id
      name
      stoptimesWithoutPatterns(
        startTime: $startTime
        timeRange: $timeRange
        numberOfDepartures: $numberOfDepartures
        omitCanceled: false
      ) {
        realtimeState
        realtimeDeparture
        scheduledDeparture
        realtimeArrival
        scheduledArrival
        arrivalDelay
        departureDelay
        realtime
        serviceDay
        headsign
        trip {
          gtfsId
          pattern { code id }
          route { gtfsId shortName longName mode color id }
          id
        }
      }
    }
  }
`;

export async function GET(request: NextRequest) {
  const gtfsId = request.nextUrl.searchParams.get("gtfsId") || "2:BRRS2";

  try {
    const response = await fetchWithRetry(OTP_URL, {
      maxRetries: 3,
      timeoutMs: 10000,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://explore.porto.pt",
        },
        body: JSON.stringify({
          query: QUERY,
          variables: {
            id: gtfsId,
            startTime: Math.floor(Date.now() / 1000),
            timeRange: 1800,
            numberOfDepartures: 100,
          },
        }),
      },
    });

    const raw = await response.json();

    const parsed = OTPStationDeparturesResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("OTP station departures validation failed:", parsed.error.message);
    }

    const data = parsed.success ? parsed.data : raw;
    staleCache.set(gtfsId, data);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching station departures:", error);

    // Return stale data if available
    const cached = staleCache.get(gtfsId);
    if (cached) {
      return NextResponse.json({ ...(cached.data as object), stale: true });
    }

    return NextResponse.json(
      { error: "Failed to fetch station departures", data: { stop: null } },
      { status: 500 }
    );
  }
}
