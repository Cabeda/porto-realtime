import { NextResponse } from "next/server";
import { fetchWithRetry, StaleCache } from "@/lib/api-fetch";

const CACHE_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

// Open Data Porto GeoJSON endpoint for bike lanes (ciclovias)
const BIKE_LANES_GEOJSON_URL = "https://opendata.porto.digital/dataset/d23a2bca-ffe5-43d0-954a-7b5e90167289/resource/b1039768-0a1a-46e9-bc22-766619ecdaf7/download/ext-ciclovias-geojson.geojson";

interface GeoJSONFeature {
  type: "Feature";
  properties: {
    toponimo?: string;
    denominacao?: string;
    pavimento?: string;
    largura?: number;
    estado?: string;
    objectid?: number;
    globalid?: string;
    [key: string]: unknown;
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

interface BikeLaneData {
  lanes: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    segments: [number, number][][];
    length: number;
  }>;
}

const staleCache = new StaleCache<BikeLaneData>(7 * 24 * 60 * 60 * 1000); // 7 days

function haversineDistance(coords: [number, number][]): number {
  let length = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    length += R * c;
  }
  return length;
}

export async function GET() {
  // Return fresh cached data immediately
  const cached = staleCache.get();
  if (cached?.fresh) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${24 * 60 * 60}`,
        "X-Cache-Status": "HIT",
      },
    });
  }

  try {
    const response = await fetchWithRetry(BIKE_LANES_GEOJSON_URL, {
      maxRetries: 3,
      timeoutMs: 15000,
      init: {
        headers: {
          "Accept": "application/geo+json",
          "User-Agent": "PortoRealtime/1.0",
        },
      },
    });

    const geojson: GeoJSONCollection = await response.json();
    
    const laneGroups = new Map<string, { features: GeoJSONFeature[]; estado: string }>();
    
    for (const feature of geojson.features) {
      if (feature.geometry?.type !== "LineString") continue;
      const estado = feature.properties.estado || "Planeado";
      if (estado !== "Executado") continue;
      const name = feature.properties.denominacao || feature.properties.toponimo || `Segmento ${feature.properties.objectid || 'desconhecido'}`;
      const key = `${name}::${estado}`;
      const existing = laneGroups.get(key);
      if (existing) {
        existing.features.push(feature);
      } else {
        laneGroups.set(key, { features: [feature], estado });
      }
    }

    const lanes = Array.from(laneGroups.entries()).map(([key, group], index) => {
      const name = key.split("::")[0];
      const status = group.estado === "Executado" ? "executed" : "planned";

      const segments: [number, number][][] = [];
      let totalLength = 0;

      for (const feature of group.features) {
        const coords = feature.geometry.coordinates as [number, number][];
        if (coords.length >= 2) {
          segments.push(coords);
          totalLength += haversineDistance(coords);
        }
      }

      let type = "ciclovia";
      const lowerName = name.toLowerCase();
      if (lowerName.includes("ciclorrota")) type = "ciclorrota";
      else if (lowerName.includes("pedonal")) type = "ciclovia_em_via_pedonal";
      else if (lowerName.includes("marginal") || lowerName.includes("fluvial")) type = "ciclovia_marginal_rio";

      return {
        id: `lane-${index}`,
        name,
        type,
        status,
        segments,
        length: Math.round(totalLength),
      };
    });

    const data: BikeLaneData = { lanes };
    staleCache.set(data);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${24 * 60 * 60}`,
        "X-Cache-Status": "MISS",
      },
    });
  } catch (error) {
    console.error("Error fetching bike lanes:", error);

    if (cached) {
      return NextResponse.json(cached.data, {
        headers: { "X-Cache-Status": "STALE" },
      });
    }

    return NextResponse.json(
      { lanes: [] },
      { status: 500, headers: { "Cache-Control": "no-cache" } }
    );
  }
}
