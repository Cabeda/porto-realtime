"use client";

import { useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import type { Map as LMap, LatLngBounds } from "leaflet";
import type { ActiveCheckInsResponse, BikeLane } from "@/lib/types";

const MODE_EMOJI: Record<string, string> = {
  BUS: "🚌",
  METRO: "🚇",
  BIKE: "🚲",
  WALK: "🚶",
  SCOOTER: "🛴",
};

const MODE_COLORS: Record<string, string> = {
  BUS: "#3b82f6",
  METRO: "#8b5cf6",
  BIKE: "#10b981",
  WALK: "#f59e0b",
  SCOOTER: "#ec4899",
};

/** Realistic average speeds in m/s for each mode. */
const MODE_SPEED_MS: Record<string, number> = {
  BIKE: 4.2,    // ~15 km/h casual cycling
};

const fetcher = async (url: string): Promise<ActiveCheckInsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

interface ActivityBubblesProps {
  map: LMap | null;
  show: boolean;
  bikeLanes?: BikeLane[];
  animate?: boolean;
  activeCheckIns?: ActiveCheckInsResponse;
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
export function ActivityBubbles({ map, show, bikeLanes, animate = true, activeCheckIns }: ActivityBubblesProps) {
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

        const emoji = MODE_EMOJI[ci.mode] || "📍";
        const color = MODE_COLORS[ci.mode] || "#6b7280";
        const countText = ci.count > 1 ? `<span class="activity-badge-count">${ci.count}</span>` : "";

        const html = `<div class="activity-badge" style="background:${color};">
          <span class="activity-badge-emoji">${emoji}</span>${countText}
        </div>`;

        const icon = L.divIcon({
          html,
          className: "activity-badge-marker",
          iconSize: [0, 0],
          iconAnchor: [0, 16],
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
          .activity-bike-anim {
            font-size: 20px;
            line-height: 1;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
            pointer-events: none;
          }
          .activity-badge-marker, .activity-bike-marker {
            background: none !important;
            border: none !important;
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

      // Separate bike-lane check-ins (for path animation) from others (for badges)
      const bikePathAnims: { lane: BikeLane; count: number }[] = [];
      const badgeCandidates: typeof data.checkIns = [];

      for (const ci of data.checkIns) {
        if (ci.lat == null || ci.lon == null) continue;

        // Skip modes handled directly by LeafletMap markers
        if (ci.mode === "BUS" || ci.mode === "METRO") continue;

        if (ci.mode === "BIKE" && ci.targetId) {
          const lane = laneByKey.get(ci.targetId);
          if (lane && lane.segments.length > 0) {
            bikePathAnims.push({ lane, count: ci.count });
            continue;
          }
          const isBikePark = !laneByKey.has(ci.targetId) && bikeLanes && bikeLanes.length > 0;
          if (isBikePark) continue;
        }

        badgeCandidates.push(ci);
      }

      // Store badge data for the moveend handler
      badgeDataRef.current = badgeCandidates;

      // Render badges for current viewport immediately
      renderBadges();

      // Animate bike icons along actual lane geometry at realistic speed
      const bounds = map.getBounds();
      const bikeMarkers: {
        marker: ReturnType<typeof L.marker>;
        path: [number, number][];
        dists: number[];
        totalMeters: number;
        progress: number;
        speed: number;
        direction: 1 | -1;
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
                html: `<span class="activity-bike-anim">🚲</span>`,
                className: "activity-bike-marker",
                iconSize: [20, 20],
                iconAnchor: [10, 10],
              });
              const midPos = interpolateAlongPath(seg.path, seg.dists, 0.5);
              const marker = L.marker(midPos, { icon, interactive: false, zIndexOffset: 900 }).addTo(map);
              markersRef.current.push(marker);
              continue;
            }

            const speedMs = MODE_SPEED_MS.BIKE * (0.85 + Math.random() * 0.3);
            const progressPerSec = speedMs / seg.totalMeters;

            const icon = L.divIcon({
              html: `<span class="activity-bike-anim">🚲</span>`,
              className: "activity-bike-marker",
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });

            const bikesOnThisSeg = Math.ceil(visibleCount / segsToUse.length);
            const indexOnSeg = Math.floor(j / segsToUse.length);
            const startProgress = bikesOnThisSeg > 1 ? indexOnSeg / bikesOnThisSeg : Math.random() * 0.5;
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
              direction: 1,
            });
          }

          // Count badge at longest segment midpoint
          if (count > 1 && segsToUse.length > 0) {
            const longest = segsToUse.reduce((a, b) => a.totalMeters > b.totalMeters ? a : b);
            const midPos = interpolateAlongPath(longest.path, longest.dists, 0.5);
            const badgeHtml = `<div class="activity-badge" style="background:#10b981;">
              <span class="activity-badge-emoji">🚲</span>
              <span class="activity-badge-count">${count}</span>
            </div>`;

            const badgeIcon = L.divIcon({
              html: badgeHtml,
              className: "activity-badge-marker",
              iconSize: [0, 0],
              iconAnchor: [0, 24],
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
            const badgeHtml = `<div class="activity-badge" style="background:#10b981;">
              <span class="activity-badge-emoji">🚲</span>
              <span class="activity-badge-count">${count}</span>
            </div>`;

            const badgeIcon = L.divIcon({
              html: badgeHtml,
              className: "activity-badge-marker",
              iconSize: [0, 0],
              iconAnchor: [0, 24],
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

      // Animation loop — bikes ping-pong along their segment
      // Update positions every ~500ms; no CSS transition to avoid jitter during map pan
      if (bikeMarkers.length > 0) {
        let lastTime = performance.now();
        const UPDATE_INTERVAL = 0.5;

        const animLoop = (time: number) => {
          const elapsed = (time - lastTime) / 1000;

          if (elapsed >= UPDATE_INTERVAL) {
            for (const bm of bikeMarkers) {
              bm.progress += bm.speed * elapsed * bm.direction;
              if (bm.progress >= 1) {
                bm.progress = 2 - bm.progress;
                bm.direction = -1;
              } else if (bm.progress <= 0) {
                bm.progress = -bm.progress;
                bm.direction = 1;
              }
              bm.progress = Math.max(0, Math.min(1, bm.progress));

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
