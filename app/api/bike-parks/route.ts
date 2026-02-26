import { NextResponse } from "next/server";
import { fetchWithRetry, StaleCache } from "@/lib/api-fetch";
import { readFallback } from "@/lib/fallback";
import { logger } from "@/lib/logger";

const OTP_URL = "https://otp.portodigital.pt/otp/routers/default/index/graphql";
const CACHE_DURATION = 5 * 60; // 5 minutes in seconds

interface BikeParkData {
  parks: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    capacity: number;
    occupied: number;
    available: number;
    lastUpdated: string;
  }>;
}

const staleCache = new StaleCache<BikeParkData>(5 * 60 * 1000); // 5 minutes

export async function GET() {
  // Return fresh cached data immediately
  const cached = staleCache.get();
  if (cached?.fresh) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=60`,
        "X-Cache-Status": "HIT",
      },
    });
  }

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
          query: `{ bikeRentalStations { id name lat lon spacesAvailable bikesAvailable } }`,
        }),
      },
    });

    const raw = await response.json();
    const stations = raw?.data?.bikeRentalStations || [];

    const parks = stations.map(
      (station: {
        id: string;
        name?: string;
        lat: number;
        lon: number;
        spacesAvailable?: number;
        bikesAvailable?: number;
      }) => ({
        id: station.id,
        name: station.name || "Parque desconhecido",
        lat: station.lat,
        lon: station.lon,
        capacity: (station.spacesAvailable || 0) + (station.bikesAvailable || 0),
        occupied: station.bikesAvailable || 0,
        available: station.spacesAvailable || 0,
        lastUpdated: new Date().toISOString(),
      })
    );

    const data: BikeParkData = { parks };
    staleCache.set(data);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=60`,
        "X-Cache-Status": "MISS",
      },
    });
  } catch (error) {
    console.error("Error fetching bike parks:", error);

    // Return stale data if available
    if (cached) {
      return NextResponse.json(cached.data, {
        headers: { "X-Cache-Status": "STALE" },
      });
    }

    // Layer 4: static fallback from public/fallback/bike-parks.json
    const fallback = await readFallback<BikeParkData>("bike-parks.json");
    if (fallback?.parks?.length) {
      logger.log("Returning static fallback for bike parks");
      return NextResponse.json(fallback, {
        headers: { "X-Cache-Status": "FALLBACK" },
      });
    }

    return NextResponse.json(
      { parks: [] },
      { status: 500, headers: { "Cache-Control": "no-cache" } }
    );
  }
}
