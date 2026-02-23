"use client";

import { useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import type { Map as LMap, LatLngBounds } from "leaflet";
import type { ActiveCheckInsResponse, BikeLane } from "@/lib/types";

const MODE_EMOJI: Record<string, string> = {
  BUS: "🚌",
  METRO: "🚇",
  BIKE: "🚲",
};

const MODE_COLORS: Record<string, string> = {
  BUS: "#3b82f6",
  METRO: "#8b5cf6",
  BIKE: "#10b981",
};

/** Minimal bike SVG icon (two wheels + frame), used in map markers */
const BIKE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 18a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 2a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 6h2l3 5h-3.5L12 6Zm-1.5 5L8 6H6v2h1l1.5 3H5v2h7l-1.5-2Z"/></svg>`;

/** SVG icons by mode for map markers */
const MODE_SVG: Record<string, string> = {
  BIKE: BIKE_SVG,
};

const fetcher = async (url: string): Promise<ActiveCheckInsResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

interface ActivityBubblesProps {
  map: LMap | null;
  show: boolean;
  bikeLanes?: BikeLane[];
  animate?: boolean;
  activeCheckIns?: ActiveCheckInsResponse;
  userLocation?: [number, number] | null;
}

/**
 * Flatten a BikeLane's segments into separate continuous polyline paths.
 * Each segment becomes its own path so bikes don't fly between disconnected segments.
 * Segments store [lon, lat] — we flip to [lat, lon] for Leaflet.
 */
function laneToSegmentPaths(lane: BikeLane): [number, number][][] {
  const paths: [number, number][][] = [];
  for (const seg of lane.segments) {
    if (seg.length < 2) continue;
    const path: [number, number][] = seg.map((coord) => [coord[1], coord[0]]);
    paths.push(path);
  }
  return paths;
}

/**
 * Compute cumulative real-world distances along a path in meters
 * using the Haversine formula for accuracy.
 */
function cumulativeDistancesMeters(path: [number, number][]): number[] {
  const dists = [0];
  for (let i = 1; i < path.length; i++) {
    const [lat1, lon1] = path[i - 1];
    const [lat2, lon2] = path[i];
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    dists.push(dists[i - 1] + R * c);
  }
  return dists;
}

/**
 * Find the progress ratio (0..1) along a path that is closest to a given point.
 * Uses squared Euclidean distance on lat/lon for speed (accurate enough at city scale).
 */
function closestProgressOnPath(
  path: [number, number][],
  dists: number[],
  target: [number, number]
): number {
  if (path.length < 2) return 0.5;
  const totalLen = dists[dists.length - 1];
  if (totalLen === 0) return 0.5;

  let bestDist = Infinity;
  let bestProgress = 0.5;

  for (let i = 0; i < path.length; i++) {
    const dlat = path[i][0] - target[0];
    const dlon = path[i][1] - target[1];
    const d = dlat * dlat + dlon * dlon;
    if (d < bestDist) {
      bestDist = d;
      bestProgress = dists[i] / totalLen;
    }
  }

  return Math.max(0.01, Math.min(0.99, bestProgress));
}

/** Interpolate a position along a path given a progress ratio 0..1. */
function interpolateAlongPath(
  path: [number, number][],
  dists: number[],
  progress: number
): [number, number] {
  if (path.length === 0) return [0, 0];
  if (path.length === 1) return path[0];

  const totalLen = dists[dists.length - 1];
  const target = Math.max(0, Math.min(1, progress)) * totalLen;

  for (let i = 1; i < dists.length; i++) {
    if (dists[i] >= target) {
      const segLen = dists[i] - dists[i - 1];
      const t = segLen > 0 ? (target - dists[i - 1]) / segLen : 0;
      return [
        path[i - 1][0] + t * (path[i][0] - path[i - 1][0]),
        path[i - 1][1] + t * (path[i][1] - path[i - 1][1]),
      ];
    }
  }
  return path[path.length - 1];
}

/** Check if a lat/lon point is within bounds (with optional buffer in degrees) */
function isInBounds(lat: number, lon: number, bounds: LatLngBounds, buffer = 0.01): boolean {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return (
    lat >= sw.lat - buffer && lat <= ne.lat + buffer &&
    lon >= sw.lng - buffer && lon <= ne.lng + buffer
  );
}

/** Check if any point in a path is within bounds */
function pathIntersectsBounds(path: [number, number][], bounds: LatLngBounds, buffer = 0.01): boolean {
  if (path.length === 0) return false;
  if (isInBounds(path[0][0], path[0][1], bounds, buffer)) return true;
  if (isInBounds(path[path.length - 1][0], path[path.length - 1][1], bounds, buffer)) return true;
  for (let i = Math.floor(path.length / 2); i < path.length; i += Math.max(1, Math.floor(path.length / 5))) {
    if (isInBounds(path[i][0], path[i][1], bounds, buffer)) return true;
  }
  return false;
}

/**
 * Renders map-embedded activity indicators at active check-in locations.
 * - Walk/Scooter: mode emoji badge with rider count
 * - Bike lanes: animated bike icon that follows the actual lane geometry at ~15 km/h
 *
 * Markers are Leaflet map layers — they move natively with pan/zoom.
 * Viewport filtering happens only on data changes (not on every map move)
 * to avoid destroying/recreating markers during pan/zoom which causes visual snapping.
 *
 * A separate lightweight pass on moveend adds/removes badge markers that
 * enter or leave the viewport without touching bike animations.
 */
export function ActivityBubbles({ map, show, bikeLanes, animate = true, activeCheckIns, userLocation }: ActivityBubblesProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const badgeMarkersRef = useRef<any[]>([]);
  const animFrameRef = useRef<number | null>(null);
  // Stable ref for badge data so moveend handler can access latest without re-running main effect
  const badgeDataRef = useRef<ActiveCheckInsResponse["checkIns"]>([]);
  const laneByKeyRef = useRef<Map<string, BikeLane>>(new Map());

  // Use passed-in data if available, otherwise fetch independently
  const { data: fetchedData } = useSWR<ActiveCheckInsResponse>(
    show && !activeCheckIns ? "/api/checkin/active" : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  const data = activeCheckIns || fetchedData;

  // Render badge markers for the current viewport
  const renderBadges = useCallback(() => {
    if (!map || !show) return;
    const bounds = map.getBounds();
    const badges = badgeDataRef.current;

    import("leaflet").then((L) => {
      // Remove old badge markers
      badgeMarkersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      badgeMarkersRef.current = [];

      for (const ci of badges) {
        if (ci.lat == null || ci.lon == null) continue;
        if (!isInBounds(ci.lat, ci.lon, bounds)) continue;

        const svg = MODE_SVG[ci.mode];
        const color = MODE_COLORS[ci.mode] || "#6b7280";
        const countText = ci.count > 1 ? `<span class="activity-mode-badge-count">${ci.count}</span>` : "";

        const html = svg
          ? `<div class="activity-mode-dot" style="--mode-color:${color};">${svg}${countText}</div>`
          : `<div class="activity-badge" style="background:${color};">
              <span class="activity-badge-emoji">${MODE_EMOJI[ci.mode] || "📍"}</span>${countText}
            </div>`;

        const size = svg ? 40 : 0;
        const anchor = svg ? 20 : 0;

        const icon = L.divIcon({
          html,
          className: "activity-badge-marker",
          iconSize: [size, size],
          iconAnchor: [anchor, svg ? anchor : 16],
        });

        const marker = L.marker([ci.lat, ci.lon], {
          icon,
          interactive: false,
          zIndexOffset: 800,
        }).addTo(map);

        badgeMarkersRef.current.push(marker);
      }
    });
  }, [map, show]);

  // Listen for map moves to update badge visibility
  useEffect(() => {
    if (!map || !show) return;
    map.on("moveend", renderBadges);
    return () => { map.off("moveend", renderBadges); };
  }, [map, show, renderBadges]);

  // Main effect: create bike animations (stable across map moves) + compute badge data
  useEffect(() => {
    if (!map || !show) {
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];
      badgeMarkersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      badgeMarkersRef.current = [];
      badgeDataRef.current = [];
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    import("leaflet").then((L) => {
      // Remove old bike animation markers (NOT badge markers — those are managed separately)
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      if (!data?.checkIns?.length) {
        badgeDataRef.current = [];
        // Clear badges too
        badgeMarkersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
        badgeMarkersRef.current = [];
        return;
      }

      // Inject styles once — NO CSS transition on bike markers to avoid jitter during map pan/zoom
      if (!document.getElementById("activity-map-styles")) {
        const style = document.createElement("style");
        style.id = "activity-map-styles";
        style.textContent = `
          .activity-badge {
            display: flex;
            align-items: center;
            gap: 2px;
            padding: 2px 6px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
            font-family: system-ui, sans-serif;
            white-space: nowrap;
            box-shadow: 0 1px 4px rgba(0,0,0,0.25);
            pointer-events: none;
            animation: activity-badge-in 0.4s ease-out;
          }
          .activity-badge-emoji { font-size: 14px; line-height: 1; }
          .activity-badge-count { color: white; line-height: 1; }
          @keyframes activity-badge-in {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.15); }
            100% { transform: scale(1); opacity: 1; }
          }
          .activity-bike-dot {
            --bike-dot-size: clamp(26px, 4vmin, 40px);
            width: var(--bike-dot-size);
            height: var(--bike-dot-size);
            border-radius: 50%;
            background: #10b981;
            border: 2px solid rgba(255,255,255,0.9);
            box-shadow: 0 0 6px rgba(16,185,129,0.5), 0 1px 3px rgba(0,0,0,0.2);
            pointer-events: none;
            animation: bike-dot-in 0.5s ease-out;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          }
          .activity-bike-dot svg {
            width: 60%;
            height: 60%;
            fill: white;
            flex-shrink: 0;
          }
          .activity-bike-dot::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: calc(var(--bike-dot-size) * 1.35);
            height: calc(var(--bike-dot-size) * 1.35);
            border-radius: 50%;
            background: rgba(16,185,129,0.15);
            transform: translate(-50%, -50%);
            animation: bike-glow 2s ease-in-out infinite;
          }
          @keyframes bike-dot-in {
            0% { transform: scale(0); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes bike-glow {
            0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.4); }
          }
          .activity-bike-badge {
            --bike-badge-icon: clamp(14px, 2.2vmin, 22px);
            display: flex;
            align-items: center;
            gap: clamp(2px, 0.4vmin, 5px);
            padding: clamp(2px, 0.4vmin, 5px) clamp(6px, 1vmin, 12px) clamp(2px, 0.4vmin, 5px) clamp(4px, 0.6vmin, 8px);
            border-radius: 10px;
            background: rgba(16,185,129,0.85);
            backdrop-filter: blur(2px);
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
            pointer-events: none;
            animation: activity-badge-in 0.4s ease-out;
          }
          .activity-bike-badge-dot {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .activity-bike-badge-dot svg {
            width: var(--bike-badge-icon);
            height: var(--bike-badge-icon);
            fill: white;
          }
          .activity-bike-badge-count {
            font-size: clamp(11px, 1.6vmin, 16px);
            font-weight: 700;
            color: white;
            font-family: system-ui, sans-serif;
            line-height: 1;
          }
          .activity-badge-marker, .activity-bike-marker {
            background: none !important;
            border: none !important;
          }
          .activity-mode-dot {
            --mode-dot-size: clamp(26px, 4vmin, 40px);
            --mode-color: #6b7280;
            width: var(--mode-dot-size);
            height: var(--mode-dot-size);
            border-radius: 50%;
            background: var(--mode-color);
            border: 2px solid rgba(255,255,255,0.9);
            box-shadow: 0 0 6px color-mix(in srgb, var(--mode-color) 50%, transparent), 0 1px 3px rgba(0,0,0,0.2);
            pointer-events: none;
            animation: bike-dot-in 0.5s ease-out;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          }
          .activity-mode-dot svg {
            width: 60%;
            height: 60%;
            fill: white;
            flex-shrink: 0;
          }
          .activity-mode-badge-count {
            position: absolute;
            top: -4px;
            right: -6px;
            background: var(--mode-color);
            color: white;
            font-size: clamp(9px, 1.2vmin, 12px);
            font-weight: 700;
            font-family: system-ui, sans-serif;
            line-height: 1;
            min-width: 14px;
            height: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 7px;
            padding: 0 3px;
            border: 1.5px solid white;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          }
          .activity-bike-here {
            --bike-here-size: clamp(28px, 4.5vmin, 44px);
            width: var(--bike-here-size);
            height: var(--bike-here-size);
            border-radius: 50%;
            background: rgba(16,185,129,0.15);
            border: 2px dashed #10b981;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            pointer-events: none;
            animation: bike-dot-in 0.5s ease-out;
          }
          .activity-bike-here svg {
            width: 55%;
            height: 55%;
            fill: #10b981;
            flex-shrink: 0;
          }
        `;
        document.head.appendChild(style);
      }

      // Build lane lookup
      const laneByKey = new Map<string, BikeLane>();
      if (bikeLanes) {
        for (const lane of bikeLanes) {
          laneByKey.set(lane.name, lane);
          laneByKey.set(lane.id, lane);
        }
      }
      laneByKeyRef.current = laneByKey;

      // Separate bike check-ins into: lane animations, bike-here (static), bike parks (skip), and others (badges)
      const bikePathAnims: { lane: BikeLane; count: number }[] = [];
      const bikeHereMarkers: { lat: number; lon: number; count: number }[] = [];
      const badgeCandidates: typeof data.checkIns = [];

      for (const ci of data.checkIns) {
        // Skip BUS and METRO — handled by LeafletMap (rider badges on bus markers + stop markers)
        if (ci.mode === "BUS" || ci.mode === "METRO") continue;

        // Resolve location: use stored coords for infrastructure, or userLocation for privacy-safe check-ins
        let ciLat = ci.lat;
        let ciLon = ci.lon;
        const isUserLocCheckin = ci.targetId === "bike-here";
        if ((ciLat == null || ciLon == null) && isUserLocCheckin && userLocation) {
          ciLat = userLocation[0];
          ciLon = userLocation[1];
        }

        if (ci.mode === "BIKE" && ci.targetId) {
          // "Cycling here" — static bike marker at user's location (client-side only)
          if (ci.targetId === "bike-here") {
            if (ciLat != null && ciLon != null) {
              bikeHereMarkers.push({ lat: ciLat, lon: ciLon, count: ci.count });
            }
            continue;
          }
          const lane = laneByKey.get(ci.targetId);
          if (lane && lane.segments.length > 0) {
            bikePathAnims.push({ lane, count: ci.count });
            continue;
          }
          const isBikePark = !laneByKey.has(ci.targetId) && bikeLanes && bikeLanes.length > 0;
          if (isBikePark) continue;
        }

        // For walk/scooter without stored coords, inject userLocation
        if (ciLat != null && ciLon != null) {
          badgeCandidates.push({ ...ci, lat: ciLat, lon: ciLon });
        } else if (ci.lat != null && ci.lon != null) {
          badgeCandidates.push(ci);
        }
      }

      // Store badge data for the moveend handler
      badgeDataRef.current = badgeCandidates;

      // Render badges for current viewport immediately
      renderBadges();

      // Render static bike markers for "cycling here" check-ins (no bike lane)
      const bounds = map.getBounds();
      for (const bh of bikeHereMarkers) {
        if (!isInBounds(bh.lat, bh.lon, bounds)) continue;
        const countBadge = bh.count > 1
          ? `<div class="activity-bike-badge" style="position:absolute;top:-8px;right:-12px;">
              <span class="activity-bike-badge-dot">${BIKE_SVG}</span>
              <span class="activity-bike-badge-count">${bh.count}</span>
            </div>`
          : "";
        const icon = L.divIcon({
          html: `<div class="activity-bike-here">${BIKE_SVG}${countBadge}</div>`,
          className: "activity-bike-marker",
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        const marker = L.marker([bh.lat, bh.lon], {
          icon,
          interactive: false,
          zIndexOffset: 900,
        }).addTo(map);
        markersRef.current.push(marker);
      }

      // Animate bike icons along actual lane geometry
      const bikeMarkers: {
        marker: ReturnType<typeof L.marker>;
        path: [number, number][];
        dists: number[];
        totalMeters: number;
        progress: number;
        speed: number;
      }[] = [];

      for (const { lane, count } of bikePathAnims) {
        const segPaths = laneToSegmentPaths(lane);
        if (segPaths.length === 0) continue;

        const segments = segPaths.map((path) => {
          const dists = cumulativeDistancesMeters(path);
          return { path, dists, totalMeters: dists[dists.length - 1] };
        }).filter((s) => s.totalMeters >= 10);

        if (segments.length === 0) continue;

        // Filter to segments visible in current viewport for initial placement
        // But create all — Leaflet handles off-screen markers efficiently
        const visibleSegments = segments.filter((s) => pathIntersectsBounds(s.path, bounds));
        const segsToUse = visibleSegments.length > 0 ? visibleSegments : segments.slice(0, 1);

        if (animate) {
          const visibleCount = Math.min(count, 3);

          for (let j = 0; j < visibleCount; j++) {
            const seg = segsToUse[j % segsToUse.length];

            if (seg.totalMeters < 100) {
              const icon = L.divIcon({
                html: `<div class="activity-bike-dot">${BIKE_SVG}</div>`,
                className: "activity-bike-marker",
                iconSize: [40, 40],
                iconAnchor: [20, 20],
              });
              const midPos = interpolateAlongPath(seg.path, seg.dists, 0.5);
              const marker = L.marker(midPos, { icon, interactive: false, zIndexOffset: 900 }).addTo(map);
              markersRef.current.push(marker);
              continue;
            }

            // Animation speed: traverse the full segment in ~40-60s regardless of length
            const traversalSeconds = 40 + Math.random() * 20;
            const progressPerSec = 1 / traversalSeconds;

            const icon = L.divIcon({
              html: `<div class="activity-bike-dot">${BIKE_SVG}</div>`,
              className: "activity-bike-marker",
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            });

            const bikesOnThisSeg = Math.ceil(visibleCount / segsToUse.length);
            const indexOnSeg = Math.floor(j / segsToUse.length);
            // Start at the point on the lane closest to the user; spread additional bikes from there
            const baseProgress = userLocation
              ? closestProgressOnPath(seg.path, seg.dists, userLocation)
              : 0.5;
            const spread = bikesOnThisSeg > 1 ? 0.15 : 0;
            const startProgress = Math.max(0.01, Math.min(0.99, baseProgress + (indexOnSeg - (bikesOnThisSeg - 1) / 2) * spread));
            const startPos = interpolateAlongPath(seg.path, seg.dists, startProgress);

            const marker = L.marker(startPos, {
              icon,
              interactive: false,
              zIndexOffset: 900,
            }).addTo(map);

            markersRef.current.push(marker);
            bikeMarkers.push({
              marker,
              path: seg.path,
              dists: seg.dists,
              totalMeters: seg.totalMeters,
              progress: startProgress,
              speed: progressPerSec * (0.92 + Math.random() * 0.16),
            });
          }

          // Count badge only if there are more check-ins than visible animated bikes
          if (count > visibleCount && segsToUse.length > 0) {
            const longest = segsToUse.reduce((a, b) => a.totalMeters > b.totalMeters ? a : b);
            const midPos = interpolateAlongPath(longest.path, longest.dists, 0.5);
            const badgeHtml = `<div class="activity-bike-badge">
              <span class="activity-bike-badge-dot">${BIKE_SVG}</span>
              <span class="activity-bike-badge-count">${count}</span>
            </div>`;

            const badgeIcon = L.divIcon({
              html: badgeHtml,
              className: "activity-badge-marker",
              iconSize: [0, 0],
              iconAnchor: [0, 20],
            });

            const badgeMarker = L.marker(midPos, {
              icon: badgeIcon,
              interactive: false,
              zIndexOffset: 850,
            }).addTo(map);

            markersRef.current.push(badgeMarker);
          }
        } else {
          // Not animating — just show a count badge
          if (segsToUse.length > 0) {
            const longest = segsToUse.reduce((a, b) => a.totalMeters > b.totalMeters ? a : b);
            const midPos = interpolateAlongPath(longest.path, longest.dists, 0.5);
            const badgeHtml = `<div class="activity-bike-badge">
              <span class="activity-bike-badge-dot">${BIKE_SVG}</span>
              <span class="activity-bike-badge-count">${count}</span>
            </div>`;

            const badgeIcon = L.divIcon({
              html: badgeHtml,
              className: "activity-badge-marker",
              iconSize: [0, 0],
              iconAnchor: [0, 20],
            });

            const badgeMarker = L.marker(midPos, {
              icon: badgeIcon,
              interactive: false,
              zIndexOffset: 850,
            }).addTo(map);

            markersRef.current.push(badgeMarker);
          }
        }
      }

      // Animation loop — bikes traverse their segment in a continuous loop
      // Update positions every ~500ms; no CSS transition to avoid jitter during map pan
      if (bikeMarkers.length > 0) {
        let lastTime = performance.now();
        const UPDATE_INTERVAL = 0.5;

        const animLoop = (time: number) => {
          const elapsed = (time - lastTime) / 1000;

          if (elapsed >= UPDATE_INTERVAL) {
            for (const bm of bikeMarkers) {
              bm.progress += bm.speed * elapsed;
              // Wrap around instead of ping-pong — continuous loop
              if (bm.progress >= 1) {
                bm.progress -= 1;
              } else if (bm.progress <= 0) {
                bm.progress += 1;
              }
              bm.progress = Math.max(0, Math.min(0.999, bm.progress));

              const pos = interpolateAlongPath(bm.path, bm.dists, bm.progress);
              bm.marker.setLatLng(pos);
            }
            lastTime = time;
          }

          animFrameRef.current = requestAnimationFrame(animLoop);
        };

        animFrameRef.current = requestAnimationFrame(animLoop);
      }
    });

    return () => {
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];
      badgeMarkersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      badgeMarkersRef.current = [];
      badgeDataRef.current = [];
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // NOTE: viewBounds intentionally NOT in deps — markers persist across map moves.
    // Badge visibility is handled by the separate moveend listener.
  }, [data, show, map, bikeLanes, animate, renderBadges]);

  return null;
}
