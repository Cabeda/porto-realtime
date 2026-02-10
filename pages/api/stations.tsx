import next from "next";

interface Stop {
  code: string;
  desc: string;
  lat: number;
  lon: number;
  name: string;
  gtfsId: string;
}

interface QueryResult {
  stops: Stop[];
}

export default async function handler(req: any, res: any): Promise<any> {
  const url =
    "https://otp.services.porto.digital/otp/routers/default/index/graphql";
  
  // Cache for 30 days (2,592,000 seconds)
  const CACHE_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds
  
  const options = {
    method: "POST",
    next: {
      revalidate: CACHE_DURATION, // 30 days
    },
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
      query: `query Request {
          stops	{
            id
            code
            desc
            lat
            lon	
            name
            gtfsId
          }
        }`,
    }),
  };

  const response = await fetch(url, options);
  const data: QueryResult = await response.json();

  if (response.ok) {
    // Set cache headers for browser and CDN caching
    // Cache for 30 days, allow stale content for 7 days while revalidating
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${7 * 24 * 60 * 60}`
    );
    res.status(200).json(data);
  } else {
    // Don't cache errors
    res.setHeader('Cache-Control', 'no-cache');
    res.status(response.status).json(data);
  }
}
