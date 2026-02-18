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
}

/** Flatten a BikeLane's segments into a single [lat, lon][] polyline path. */
function laneToPath(lane: BikeLane): [number, number][] {
  const path: [number, number][] = [];
  for (const seg of lane.segments) {
    for (const coord of seg) {
      // segments store [lon, lat] — flip to [lat, lon] for Leaflet
      path.push([coord[1], coord[0]]);
    }
  }
  return path;
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
export function ActivityBubbles({ map, show, bikeLanes }: ActivityBubblesProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const { data } = useSWR<ActiveCheckInsResponse>(
    show ? "/api/checkin/active" : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

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

        if (ci.mode === "BIKE" && ci.targetId) {
          const lane = laneByKey.get(ci.targetId);
          if (lane && lane.segments.length > 0) {
            bikePathAnims.push({ lane, count: ci.count });
            continue;
          }
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
      const bikeMarkers: {
        marker: ReturnType<typeof L.marker>;
        path: [number, number][];
        dists: number[];
        totalMeters: number;
        progress: number; // 0..1
        speed: number;    // progress per second (based on real distance & bike speed)
      }[] = [];

      for (const { lane, count } of bikePathAnims) {
        const path = laneToPath(lane);
        if (path.length < 2) continue;
        const dists = cumulativeDistancesMeters(path);
        const totalMeters = dists[dists.length - 1];
        if (totalMeters < 10) continue; // skip degenerate lanes

        // Speed in m/s for cycling, with slight random variation (±15%)
        const speedMs = MODE_SPEED_MS.BIKE * (0.85 + Math.random() * 0.3);
        // Convert to progress/second: speed_ms / total_meters
        const progressPerSec = speedMs / totalMeters;

        // Show up to 3 bike icons per lane, staggered evenly along the path
        const visibleCount = Math.min(count, 3);
        for (let j = 0; j < visibleCount; j++) {
          const icon = L.divIcon({
            html: `<span class="activity-bike-anim">🚲</span>`,
            className: "activity-bike-marker",
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });

          const startProgress = j / visibleCount;
          const startPos = interpolateAlongPath(path, dists, startProgress);
          const marker = L.marker(startPos, {
            icon,
            interactive: false,
            zIndexOffset: 900,
          }).addTo(map);

          markersRef.current.push(marker);
          bikeMarkers.push({
            marker,
            path,
            dists,
            totalMeters,
            progress: startProgress,
            speed: progressPerSec * (0.92 + Math.random() * 0.16), // slight per-icon variation
          });
        }

        // Show a count badge at the lane midpoint if more than 1 rider
        if (count > 1) {
          const midPos = interpolateAlongPath(path, dists, 0.5);
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

      // Smooth animation loop — bikes follow their lane at realistic speed
      if (bikeMarkers.length > 0) {
        let lastTime = performance.now();

        const animate = (time: number) => {
          // Cap dt to avoid jumps when tab is backgrounded
          const dt = Math.min((time - lastTime) / 1000, 0.1);
          lastTime = time;

          for (const bm of bikeMarkers) {
            bm.progress += bm.speed * dt;
            // Loop: wrap around when reaching the end
            if (bm.progress > 1) bm.progress -= 1;

            const pos = interpolateAlongPath(bm.path, bm.dists, bm.progress);
            bm.marker.setLatLng(pos);
          }

          animFrameRef.current = requestAnimationFrame(animate);
        };

        animFrameRef.current = requestAnimationFrame(animate);
      }
    });

    return () => {
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [data, show, map, bikeLanes]);

  return null;
}
