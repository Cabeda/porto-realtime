import { NextResponse } from "next/server";

const CACHE_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

// Open Data Porto GeoJSON endpoint for bike lanes (ciclovias)
const BIKE_LANES_GEOJSON_URL = "https://opendata.porto.digital/dataset/d23a2bca-ffe5-43d0-954a-7b5e90167289/resource/b1039768-0a1a-46e9-bc22-766619ecdaf7/download/ext-ciclovias-geojson.geojson";

interface GeoJSONFeature {
  type: "Feature";
  properties: {
    ident?: string;
    tipo?: string;
    estado?: string;
    comprimento?: number;
    [key: string]: any;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// Generate meaningful names for bike lanes
function generateLaneName(feature: GeoJSONFeature, index: number): string {
  const props = feature.properties;
  
  // Use ident if available
  if (props.ident) {
    return `Ciclovia ${props.ident}`;
  }
  
  // Use tipo to categorize
  const typeMap: Record<string, string> = {
    "ciclovia": "Ciclovia",
    "ciclorrota": "Ciclorrota",
    "ciclovia_em_via_pedonal": "Ciclovia Pedonal",
    "ciclovia_marginal_rio": "Ciclovia Marginal",
  };
  
  const typeName = typeMap[props.tipo || ""] || "Ciclovia";
  
  // Try to extract area from coordinates (simplified)
  return `${typeName} ${index + 1}`;
}

export async function GET() {
  try {
    const response = await fetch(BIKE_LANES_GEOJSON_URL, {
      headers: {
        "Accept": "application/geo+json",
        "User-Agent": "PortoRealtime/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bike lanes: ${response.status}`);
    }

    const geojson: GeoJSONCollection = await response.json();
    
    // Transform GeoJSON to our BikeLane format
    const lanes = geojson.features
      .filter((feature) => feature.geometry?.type === "LineString")
      .map((feature, index) => {
        const coords = feature.geometry.coordinates;
        
        // Calculate approximate length from coordinates
        let length = 0;
        for (let i = 1; i < coords.length; i++) {
          const [lon1, lat1] = coords[i - 1];
          const [lon2, lat2] = coords[i];
          // Haversine distance approximation
          const R = 6371e3; // Earth radius in meters
          const φ1 = lat1 * Math.PI / 180;
          const φ2 = lat2 * Math.PI / 180;
          const Δφ = (lat2 - lat1) * Math.PI / 180;
          const Δλ = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          length += R * c;
        }

        return {
          id: feature.properties.ident || `lane-${index}`,
          name: generateLaneName(feature, index),
          type: feature.properties.tipo || "unknown",
          coordinates: coords,
          length: Math.round(length),
        };
      });

    return NextResponse.json({ lanes }, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${24 * 60 * 60}`,
      },
    });
  } catch (error) {
    console.error("Error fetching bike lanes:", error);
    return NextResponse.json(
      { lanes: [] },
      { status: 500, headers: { "Cache-Control": "no-cache" } }
    );
  }
}
