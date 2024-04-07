interface Pattern {
  code: string;
  id: string;
}

interface Route {
  gtfsId: string;
  shortName: string;
  longName: string;
  mode: string;
  color: string;
  id: string;
}

interface Trip {
  pattern: Pattern;
  route: Route;
  id: string;
}

interface StoptimesWithoutPatterns {
  realtimeState: string;
  realtimeDeparture: number;
  scheduledDeparture: number;
  realtimeArrival: number;
  scheduledArrival: number;
  arrivalDelay: number;
  departureDelay: number;
  realtime: boolean;
  serviceDay: number;
  trip: Trip;
}

interface Stop {
  id: string;
  _stoptimesWithoutPatterns285iU7: StoptimesWithoutPatterns[];
}

interface QueryResult {
  stop: Stop;
}

export default async function handler(req: any, res: any): Promise<any> {
  const gtfsId = req.query.gtfsId || "2:BRRS2"; // Use the gtfsId from the query parameters, or "2:BRRS2" as a default

  const url =
    "https://otp.services.porto.digital/otp/routers/default/index/graphql";
  const options = {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      Referer: "https://cabeda.dev",
      "Content-Type": "application/json",
      OTPTimeout: "10000",
      Origin: "https://explore.porto.pt",
      DNT: "1",
      Connection: "keep-alive",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
      "Sec-GPC": "1",
    },
    body: JSON.stringify({
      query: `query StopRoutes(
            $id_0: String!
            $startTime_1: Long!
            $timeRange_2: Int!
            $numberOfDepartures_3: Int!
          ) {
            stop(id: $id_0) {
              id
              name
              ...F2
            }
          }
          fragment F2 on Stop {
            _stoptimesWithoutPatterns285iU7: stoptimesWithoutPatterns(
              startTime: $startTime_1
              timeRange: $timeRange_2
              numberOfDepartures: $numberOfDepartures_3
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
              trip {
                pattern {
                  code
                  id
                }
                route {
                  gtfsId
                  shortName
                  longName
                  mode
                  color
                  id
                }
                id
              }
            }
            id
          }
          `,
      variables: {
        id_0: gtfsId,
        startTime_1: Date.now() /1000,
        timeRange_2: 1800,
        numberOfDepartures_3: 100,
      },
    }),
  };

  const response = await fetch(url, options);
  const data: QueryResult = await response.json();

  if (response.ok) {
    res.status(200).json(data);
  } else {
    res.status(response.status).json(data);
  }
}
