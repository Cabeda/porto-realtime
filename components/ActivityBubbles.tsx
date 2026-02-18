"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import type { Map as LMap } from "leaflet";
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
  BUS: 5.5,     // ~20 km/h city bus
  METRO: 8.3,   // ~30 km/h metro
  BIKE: 4.2,    // ~15 km/h casual cycling
  WALK: 1.4,    // ~5 km/h walking
  SCOOTER: 3.3, // ~12 km/h e-scooter
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
    const R = 6371000; // Earth radius in meters
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

/**
 * Renders map-embedded activity indicators at active check-in locations.
 * - Bus/Metro/Walk/Scooter: mode emoji badge with rider count
 * - Bike lanes: animated bike icon that follows the actual lane geometry at ~15 km/h, looping
 * Auto-refreshes every 30s via SWR.
 */
export function ActivityBubbles({ map, show, bikeLanes, animate = true, activeCheckIns }: ActivityBubblesProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Use passed-in data if available, otherwise fetch independently
  const { data: fetchedData } = useSWR<ActiveCheckInsResponse>(
    show && !activeCheckIns ? "/api/checkin/active" : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  const data = activeCheckIns || fetchedData;

  useEffect(() => {
    if (!map || !show) {
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    import("leaflet").then((L) => {
      // Remove old markers
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      if (!data?.checkIns?.length) return;

      // Inject styles once
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
          .activity-bike-marker {
            transition: transform 0.6s linear;
          }
        `;
        document.head.appendChild(style);
      }

      // Build a lookup from lane name/id → lane geometry
      const laneByKey = new Map<string, BikeLane>();
      if (bikeLanes) {
        for (const lane of bikeLanes) {
          laneByKey.set(lane.name, lane);
          laneByKey.set(lane.id, lane);
        }
      }

      // Separate bike-lane check-ins (for path animation) from others (for badges)
      const bikePathAnims: { lane: BikeLane; count: number }[] = [];
      const badges: typeof data.checkIns = [];

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
          // Check if this is a bike park (handled by LeafletMap bike park markers)
          // Bike parks have targetId but won't match any lane — check if it matches a park
          const isBikePark = !laneByKey.has(ci.targetId) && bikeLanes && bikeLanes.length > 0;
          if (isBikePark) {
            // Lane data is loaded but targetId doesn't match any lane → it's a park, skip
            continue;
          }
          // Lane data not loaded yet, or unknown target — show as a badge at the coordinates
        }
        badges.push(ci);
      }

      // Render badge markers for non-bike-lane check-ins
      for (const ci of badges) {
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

        markersRef.current.push(marker);
      }

      // Animate bike icons along actual lane geometry at realistic speed
      // Each bike follows a single continuous segment (no flying between disconnected segments)
      const bikeMarkers: {
        marker: ReturnType<typeof L.marker>;
        path: [number, number][];
        dists: number[];
        totalMeters: number;
        progress: number; // 0..1
        speed: number;    // progress per second (based on real distance & bike speed)
        direction: 1 | -1; // ping-pong direction so bike doesn't teleport at ends
      }[] = [];

      for (const { lane, count } of bikePathAnims) {
        const segPaths = laneToSegmentPaths(lane);
        if (segPaths.length === 0) continue;

        // Pre-compute distances for each segment
        const segments = segPaths.map((path) => {
          const dists = cumulativeDistancesMeters(path);
          return { path, dists, totalMeters: dists[dists.length - 1] };
        }).filter((s) => s.totalMeters >= 10); // skip degenerate segments

        if (segments.length === 0) continue;

        if (animate) {
          // Distribute bikes across segments
          const visibleCount = Math.min(count, 3);

          for (let j = 0; j < visibleCount; j++) {
            // Pick segment: distribute evenly, cycling through segments
            const seg = segments[j % segments.length];

            // For very short segments, skip animation — just show a static bike
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

            // Stagger start positions within the segment
            const bikesOnThisSeg = Math.ceil(visibleCount / segments.length);
            const indexOnSeg = Math.floor(j / segments.length);
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

          // Show a count badge at the longest segment's midpoint
          if (count > 1) {
            const longest = segments.reduce((a, b) => a.totalMeters > b.totalMeters ? a : b);
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
          // Not animating — just show a count badge at the longest segment midpoint
          const longest = segments.reduce((a, b) => a.totalMeters > b.totalMeters ? a : b);
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

      // Smooth animation loop — bikes ping-pong along their segment
      // We update positions every ~500ms and let CSS transition (0.6s) smooth the movement
      if (bikeMarkers.length > 0) {
        let lastTime = performance.now();
        const UPDATE_INTERVAL = 0.5; // seconds between position updates

        const animLoop = (time: number) => {
          const elapsed = (time - lastTime) / 1000;

          if (elapsed >= UPDATE_INTERVAL) {
            for (const bm of bikeMarkers) {
              bm.progress += bm.speed * elapsed * bm.direction;
              // Ping-pong: reverse direction at ends instead of wrapping
              if (bm.progress >= 1) {
                bm.progress = 2 - bm.progress;
                bm.direction = -1;
              } else if (bm.progress <= 0) {
                bm.progress = -bm.progress;
                bm.direction = 1;
              }
              // Clamp to avoid edge cases
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
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [data, show, map, bikeLanes, animate]);

  return null;
}
