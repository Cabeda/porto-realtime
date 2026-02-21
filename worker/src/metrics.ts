/**
 * Trip reconstruction and metrics computation
 * (Standalone copy of lib/analytics/metrics.ts for the worker)
 */

export interface PositionPoint {
  recordedAt: Date;
  vehicleId: string;
  vehicleNum: string | null;
  route: string;
  tripId: string | null;
  directionId: number | null;
  lat: number;
  lon: number;
  speed: number | null;
}

export interface ReconstructedTrip {
  vehicleId: string;
  vehicleNum: string | null;
  route: string;
  tripId: string | null;
  directionId: number | null;
  startedAt: Date;
  endedAt: Date;
  runtimeSecs: number;
  positions: number;
  avgSpeed: number;
}

export function reconstructTrips(
  points: PositionPoint[],
  maxGapMinutes: number = 10
): ReconstructedTrip[] {
  if (points.length < 2) return [];

  const trips: ReconstructedTrip[] = [];
  let tripPoints: PositionPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const gapMs = curr.recordedAt.getTime() - prev.recordedAt.getTime();
    const gapMinutes = gapMs / 60000;

    const tripChanged =
      curr.tripId !== prev.tripId && curr.tripId && prev.tripId;
    const gapTooLarge = gapMinutes > maxGapMinutes;

    if (tripChanged || gapTooLarge) {
      if (tripPoints.length >= 3) {
        trips.push(finalizeTrip(tripPoints));
      }
      tripPoints = [curr];
    } else {
      tripPoints.push(curr);
    }
  }

  if (tripPoints.length >= 3) {
    trips.push(finalizeTrip(tripPoints));
  }

  return trips;
}

function finalizeTrip(points: PositionPoint[]): ReconstructedTrip {
  const first = points[0];
  const last = points[points.length - 1];
  const runtimeSecs = Math.round(
    (last.recordedAt.getTime() - first.recordedAt.getTime()) / 1000
  );

  const speeds = points
    .map((p) => p.speed)
    .filter((s): s is number => s !== null && s >= 0);
  const avgSpeed =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  return {
    vehicleId: first.vehicleId,
    vehicleNum: first.vehicleNum,
    route: first.route,
    tripId: first.tripId,
    directionId: first.directionId,
    startedAt: first.recordedAt,
    endedAt: last.recordedAt,
    runtimeSecs,
    positions: points.length,
    avgSpeed: Math.round(avgSpeed * 10) / 10,
  };
}

export interface HeadwayMetrics {
  avgHeadwaySecs: number;
  headwayAdherencePct: number;
  excessWaitTimeSecs: number;
  bunchingPct: number;
  gappingPct: number;
}

export function computeHeadwayMetrics(
  observedStartTimes: number[],
  scheduledHeadwaySecs: number | null
): HeadwayMetrics | null {
  if (observedStartTimes.length < 2) return null;

  const headways: number[] = [];
  for (let i = 1; i < observedStartTimes.length; i++) {
    headways.push((observedStartTimes[i] - observedStartTimes[i - 1]) / 1000);
  }

  const avgHeadway = headways.reduce((a, b) => a + b, 0) / headways.length;

  const sumH = headways.reduce((a, b) => a + b, 0);
  const sumH2 = headways.reduce((a, b) => a + b * b, 0);
  const awt = sumH2 / (2 * sumH);

  let ewt = 0;
  let headwayAdherence = 100;
  let bunchingPct = 0;
  let gappingPct = 0;

  if (scheduledHeadwaySecs && scheduledHeadwaySecs > 0) {
    const swt = scheduledHeadwaySecs / 2;
    ewt = Math.max(0, awt - swt);

    const threshold = scheduledHeadwaySecs + 180;
    const adherent = headways.filter((h) => h <= threshold).length;
    headwayAdherence = (adherent / headways.length) * 100;

    const bunched = headways.filter(
      (h) => h < scheduledHeadwaySecs * 0.5
    ).length;
    bunchingPct = (bunched / headways.length) * 100;

    const gapped = headways.filter(
      (h) => h > scheduledHeadwaySecs * 1.5
    ).length;
    gappingPct = (gapped / headways.length) * 100;
  } else {
    const sorted = [...headways].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const swt = median / 2;
    ewt = Math.max(0, awt - swt);

    const threshold = median + 180;
    const adherent = headways.filter((h) => h <= threshold).length;
    headwayAdherence = (adherent / headways.length) * 100;

    const bunched = headways.filter((h) => h < median * 0.5).length;
    bunchingPct = (bunched / headways.length) * 100;

    const gapped = headways.filter((h) => h > median * 1.5).length;
    gappingPct = (gapped / headways.length) * 100;
  }

  return {
    avgHeadwaySecs: Math.round(avgHeadway),
    headwayAdherencePct: Math.round(headwayAdherence * 10) / 10,
    excessWaitTimeSecs: Math.round(ewt),
    bunchingPct: Math.round(bunchingPct * 10) / 10,
    gappingPct: Math.round(gappingPct * 10) / 10,
  };
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}
