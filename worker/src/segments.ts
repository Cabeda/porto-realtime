/**
 * Route segment utilities
 * (Standalone copy of lib/analytics/segments.ts for the worker)
 */

export function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
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

export function splitIntoSegments(
  route: string,
  directionId: number,
  coordinates: [number, number][],
  targetLengthM: number = 200
): SegmentDef[] {
  if (coordinates.length < 2) return [];

  const segments: SegmentDef[] = [];
  let segmentIndex = 0;
  let segCoords: [number, number][] = [coordinates[0]];
  let segLength = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    const dist = haversineM(prev[1], prev[0], curr[1], curr[0]);

    segCoords.push(curr);
    segLength += dist;

    if (segLength >= targetLengthM || i === coordinates.length - 1) {
      const start = segCoords[0];
      const end = segCoords[segCoords.length - 1];
      const midIdx = Math.floor(segCoords.length / 2);
      const mid = segCoords[midIdx];

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
      segCoords = [curr];
      segLength = 0;
    }
  }

  return segments;
}

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
    if (seg.route !== route) continue;
    if (directionId !== null && seg.directionId !== directionId) continue;

    const dist = haversineM(lat, lon, seg.midLat, seg.midLon);
    if (dist < bestDist && dist <= maxDistM) {
      bestDist = dist;
      bestId = seg.id;
    }
  }

  return bestId;
}
