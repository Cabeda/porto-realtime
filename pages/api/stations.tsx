import type { NextApiRequest, NextApiResponse } from "next";

const OTP_URL =
  "https://otp.portodigital.pt/otp/routers/default/index/graphql";

const CACHE_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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
      res.setHeader(
        "Cache-Control",
        `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${7 * 24 * 60 * 60}`
      );
      res.status(200).json(data);
    } else {
      res.setHeader("Cache-Control", "no-cache");
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error("Error fetching stations:", error);
    res.setHeader("Cache-Control", "no-cache");
    res.status(500).json({
      error: "Failed to fetch stations",
      data: { stops: [] }
    });
  }
}
