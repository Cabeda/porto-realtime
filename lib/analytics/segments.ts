/**
 * Route segment utilities (#66)
 *
 * Splits OTP route pattern polylines into ~200m segments and provides
 * GPS-to-segment snapping for speed analysis.
 */

/** Haversine distance in meters between two lat/lon points */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface SegmentDef {
  id: string;
  route: string;
  directionId: number;
  segmentIndex: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  midLat: number;
  midLon: number;
  lengthM: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

/**
 * Split a polyline (array of [lon, lat] coordinates) into segments of ~targetLengthM.
 */
export function splitIntoSegments(
  route: string,
  directionId: number,
  coordinates: [number, number][], // [lon, lat]
  targetLengthM: number = 200
): SegmentDef[] {
  if (coordinates.length < 2) return [];

  const segments: SegmentDef[] = [];
  let segmentIndex = 0;
  let segCoords: [number, number][] = [coordinates[0]!];
  let segLength = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1]!;
    const curr = coordinates[i]!;
    const dist = haversineM(prev[1], prev[0], curr[1], curr[0]);

    segCoords.push(curr);
    segLength += dist;

    if (segLength >= targetLengthM || i === coordinates.length - 1) {
      const start = segCoords[0]!;
      const end = segCoords[segCoords.length - 1]!;
      const midIdx = Math.floor(segCoords.length / 2);
      const mid = segCoords[midIdx]!;

      segments.push({
        id: `${route}:${directionId}:${segmentIndex}`,
        route,
        directionId,
        segmentIndex,
        startLat: start[1],
        startLon: start[0],
        endLat: end[1],
        endLon: end[0],
        midLat: mid[1],
        midLon: mid[0],
        lengthM: segLength,
        geometry: {
          type: "LineString",
          coordinates: segCoords.map((c) => [c[0], c[1]]),
        },
      });

      segmentIndex++;
      // Start new segment from current point
      segCoords = [curr!];
      segLength = 0;
    }
  }

  return segments;
}

/**
 * Find the nearest segment for a GPS position.
 * Returns the segment ID or null if no segment is within maxDistM.
 */
export function snapToSegment(
  lat: number,
  lon: number,
  route: string,
  directionId: number | null,
  segments: SegmentDef[],
  maxDistM: number = 150
): string | null {
  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const seg of segments) {
    // Filter by route first
    if (seg.route !== route) continue;
    // If direction is known, filter by it
    if (directionId !== null && seg.directionId !== directionId) continue;

    const dist = haversineM(lat, lon, seg.midLat, seg.midLon);
    if (dist < bestDist && dist <= maxDistM) {
      bestDist = dist;
      bestId = seg.id;
    }
  }

  return bestId;
}
