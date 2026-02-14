import { type NextRequest, NextResponse } from "next/server";
import { OTPStationDeparturesResponseSchema } from "@/lib/schemas/otp";

const OTP_URL =
  "https://otp.portodigital.pt/otp/routers/default/index/graphql";

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
    const response = await fetch(OTP_URL, {
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
    });

    const raw = await response.json();

    if (!response.ok) {
      return NextResponse.json(raw, { status: response.status });
    }

    const parsed = OTPStationDeparturesResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("OTP station departures validation failed:", parsed.error.message);
      // Return raw data as fallback
      return NextResponse.json(raw);
    }

    return NextResponse.json(parsed.data);
  } catch (error) {
    console.error("Error fetching station departures:", error);
    return NextResponse.json(
      { error: "Failed to fetch station departures", data: { stop: null } },
      { status: 500 }
    );
  }
}
