import { NextResponse } from "next/server";

const CACHE_DURATION = 5 * 60; // 5 minutes in seconds

// Explore Porto API endpoint for bike parks
const EXPLORE_BIKE_PARKS_URL = "https://explore.porto.pt/api/bicycle-parks";

export async function GET() {
  try {
    const response = await fetch(EXPLORE_BIKE_PARKS_URL, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "PortoRealtime/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bike parks: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform the data to match our BikePark interface
    const parks = data.map((park: any) => ({
      id: park.id || String(Math.random()).slice(2),
      name: park.name || park.address || `Bike Park ${park.id?.slice(-4) || 'Unknown'}`,
      lat: park.lat || park.latitude || 0,
      lon: park.lon || park.longitude || 0,
      capacity: park.capacity || park.totalSpaces || 0,
      occupied: park.occupied || park.occupiedSpaces || 0,
      available: park.available || park.availableSpaces || (park.capacity - park.occupied) || 0,
      lastUpdated: park.lastUpdated || new Date().toISOString(),
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
