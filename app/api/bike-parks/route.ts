import { NextResponse } from "next/server";

const OTP_URL = "https://otp.portodigital.pt/otp/routers/default/index/graphql";
const CACHE_DURATION = 5 * 60; // 5 minutes in seconds

export async function GET() {
  try {
    const response = await fetch(OTP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://explore.porto.pt",
      },
      body: JSON.stringify({
        query: `{ bikeRentalStations { id name lat lon spacesAvailable bikesAvailable } }`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bike parks: ${response.status}`);
    }

    const raw = await response.json();
    const stations = raw?.data?.bikeRentalStations || [];

    const parks = stations.map((station: any) => ({
      id: station.id,
      name: station.name || "Parque desconhecido",
      lat: station.lat,
      lon: station.lon,
      capacity: (station.spacesAvailable || 0) + (station.bikesAvailable || 0),
      occupied: station.bikesAvailable || 0,
      available: station.spacesAvailable || 0,
      lastUpdated: new Date().toISOString(),
    }));

    return NextResponse.json({ parks }, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${60}`,
      },
    });
  } catch (error) {
    console.error("Error fetching bike parks:", error);
    return NextResponse.json(
      { parks: [] },
      { status: 500, headers: { "Cache-Control": "no-cache" } }
    );
  }
}
