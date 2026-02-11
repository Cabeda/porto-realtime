import type { NextApiRequest, NextApiResponse } from "next";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const gtfsId = (req.query.gtfsId as string) || "2:BRRS2";

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

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching station departures:", error);
    res.status(500).json({
      error: "Failed to fetch station departures",
      data: { stop: null }
    });
  }
}
