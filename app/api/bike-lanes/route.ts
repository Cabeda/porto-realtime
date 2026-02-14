import { NextResponse } from "next/server";

const CACHE_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

// Open Data Porto GeoJSON endpoint for bike lanes (ciclovias)
const BIKE_LANES_GEOJSON_URL = "https://opendata.porto.digital/dataset/d23a2bca-ffe5-43d0-954a-7b5e90167289/resource/b1039768-0a1a-46e9-bc22-766619ecdaf7/download/ext-ciclovias-geojson.geojson";

interface GeoJSONFeature {
  type: "Feature";
  properties: {
    toponimo?: string;       // street name
    denominacao?: string;    // bike lane name (e.g. "Ciclovia Parque Cidade - Fluvial")
    pavimento?: string;      // pavement type
    largura?: number;        // width in meters
    estado?: string;         // status: "Executado" (built) or "Planeado" (planned)
    objectid?: number;
    globalid?: string;
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
    
    // Group segments by denominacao + estado to keep executed and planned separate
    // Only include features with estado "Executado" — planned lanes have no names/metadata
    const laneGroups = new Map<string, { features: GeoJSONFeature[]; estado: string }>();
    
    for (const feature of geojson.features) {
      if (feature.geometry?.type !== "LineString") continue;
      const estado = feature.properties.estado || "Planeado";
      // Skip planned lanes — they have no denominacao/toponimo and are unnamed segments
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

    // Transform grouped features into BikeLane format
    // Each segment keeps its own coordinate array to avoid straight lines between disconnected segments
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

      // Determine type from the name
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
