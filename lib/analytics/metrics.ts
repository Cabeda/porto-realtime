/**
 * Trip reconstruction and metrics computation (#67)
 *
 * Reconstructs individual bus trips from GPS breadcrumbs and computes
 * transit performance metrics (headway, EWT, bunching, etc.)
 */

/**
 * STCP Porto performance baselines — sourced from STCP annual reports
 * and Expresso investigative report (Sep 2024).
 *
 * Commercial speed hit a historic low of 15.4 km/h in 2024 (lowest since 2005).
 * Schedule adherence was 94.8% in 2024.
 * Source: https://expresso.pt/sociedade/2024-09-19-vias-bus-estagnaram-em-lisboa-e-no-porto-velocidade-de-circulacao-de-autocarros-em-minimos-historicos-cd8d31a5
 */
const STCP_BASELINES = {
  /** Network commercial speed 2024 — historic low (km/h) */
  commercialSpeedKmh: 15.4,
  /** Schedule adherence 2024 (%) */
  scheduleAdherencePct: 94.8,
  /** EU urban bus speed target (km/h) */
  euTargetSpeedKmh: 18,
} as const;

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

/**
 * Reconstruct trips from a sorted array of position points for a single vehicle+route+direction.
 * A new trip starts when:
 * - tripId changes
 * - gap > maxGapMinutes between consecutive positions
 */
export function reconstructTrips(
  points: PositionPoint[],
  maxGapMinutes: number = 10
): ReconstructedTrip[] {
  if (points.length < 2) return [];

  const trips: ReconstructedTrip[] = [];
  let tripPoints: PositionPoint[] = [points[0]!];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const gapMs = curr.recordedAt.getTime() - prev.recordedAt.getTime();
    const gapMinutes = gapMs / 60000;

    const tripChanged = curr.tripId !== prev.tripId && curr.tripId && prev.tripId;
    const gapTooLarge = gapMinutes > maxGapMinutes;

    if (tripChanged || gapTooLarge) {
      // Finalize current trip
      if (tripPoints.length >= 3) {
        trips.push(finalizeTrip(tripPoints));
      }
      tripPoints = [curr];
    } else {
      tripPoints.push(curr);
    }
  }

  // Finalize last trip
  if (tripPoints.length >= 3) {
    trips.push(finalizeTrip(tripPoints));
  }

  return trips;
}

function finalizeTrip(points: PositionPoint[]): ReconstructedTrip {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const runtimeSecs = Math.round((last.recordedAt.getTime() - first.recordedAt.getTime()) / 1000);

  const speeds = points.map((p) => p.speed).filter((s): s is number => s !== null && s >= 0);
  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

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

// ---------------------------------------------------------------------------
// Headway & reliability metrics
// ---------------------------------------------------------------------------

export interface HeadwayMetrics {
  avgHeadwaySecs: number;
  headwayAdherencePct: number; // % within scheduled + 3 min
  excessWaitTimeSecs: number;
  bunchingPct: number; // % with headway < 50% of scheduled
  gappingPct: number; // % with headway > 150% of scheduled
}

/**
 * Compute headway-based metrics from observed trip start times at a reference point.
 *
 * @param observedStartTimes - sorted array of trip start timestamps (ms)
 * @param scheduledHeadwaySecs - the planned headway in seconds (null if unknown)
 */
export function computeHeadwayMetrics(
  observedStartTimes: number[],
  scheduledHeadwaySecs: number | null
): HeadwayMetrics | null {
  if (observedStartTimes.length < 2) return null;

  // Compute actual headways
  const headways: number[] = [];
  for (let i = 1; i < observedStartTimes.length; i++) {
    headways.push((observedStartTimes[i]! - observedStartTimes[i - 1]!) / 1000);
  }

  const avgHeadway = headways.reduce((a, b) => a + b, 0) / headways.length;

  // Excess Wait Time: AWT - SWT
  // AWT = sum(H^2) / (2 * sum(H))
  const sumH = headways.reduce((a, b) => a + b, 0);
  const sumH2 = headways.reduce((a, b) => a + b * b, 0);
  const awt = sumH2 / (2 * sumH);

  let ewt = 0;
  let headwayAdherence = 100;
  let bunchingPct = 0;
  let gappingPct = 0;

  if (scheduledHeadwaySecs && scheduledHeadwaySecs > 0) {
    // SWT = scheduledHeadway / 2 (for perfectly regular service)
    const swt = scheduledHeadwaySecs / 2;
    ewt = Math.max(0, awt - swt);

    // Headway adherence: % within scheduled + 180s (3 min)
    const threshold = scheduledHeadwaySecs + 180;
    const adherent = headways.filter((h) => h <= threshold).length;
    headwayAdherence = (adherent / headways.length) * 100;

    // Bunching: headway < 50% of scheduled
    const bunched = headways.filter((h) => h < scheduledHeadwaySecs * 0.5).length;
    bunchingPct = (bunched / headways.length) * 100;

    // Gapping: headway > 150% of scheduled
    const gapped = headways.filter((h) => h > scheduledHeadwaySecs * 1.5).length;
    gappingPct = (gapped / headways.length) * 100;
  } else {
    // Without scheduled headway, use median as reference
    const sorted = [...headways].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
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

/**
 * Compute percentiles from an array of numbers.
 */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (idx - lower);
}

/**
 * Assign a letter grade based on EWT, headway adherence, and commercial speed.
 * Speed is compared against the STCP 2024 network baseline (15.4 km/h).
 * A route running well below baseline gets capped at C even with good headways.
 */
export function computeGrade(
  ewt: number | null,
  adherence: number | null,
  speed?: number | null
): string {
  if (ewt === null || adherence === null) return "N/A";

  // Base grade from EWT + adherence
  let grade: string;
  if (ewt < 60 && adherence > 90) grade = "A";
  else if (ewt < 120 && adherence > 80) grade = "B";
  else if (ewt < 180 && adherence > 70) grade = "C";
  else if (ewt < 300 && adherence > 50) grade = "D";
  else grade = "F";

  // Speed penalty: cap grade if significantly below STCP 2024 baseline
  if (speed !== null && speed !== undefined) {
    const ORDER = ["A", "B", "C", "D", "F"];
    const baseline = STCP_BASELINES.commercialSpeedKmh; // 15.4 km/h
    if (speed < baseline * 0.65) {
      // < ~10 km/h: severe congestion, cap at D
      const idx = Math.max(ORDER.indexOf(grade), ORDER.indexOf("D"));
      grade = ORDER[idx] ?? grade;
    } else if (speed < baseline * 0.85) {
      // < ~13 km/h: below baseline, cap at C
      const idx = Math.max(ORDER.indexOf(grade), ORDER.indexOf("C"));
      grade = ORDER[idx] ?? grade;
    }
  }

  return grade;
}
