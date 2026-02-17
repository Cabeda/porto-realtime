"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import type { Map as LMap } from "leaflet";
import type { ActiveCheckInsResponse } from "@/lib/types";

const MODE_COLORS: Record<string, string> = {
  BUS: "#3b82f6",
  METRO: "#8b5cf6",
  BIKE: "#10b981",
  WALK: "#f59e0b",
  SCOOTER: "#ec4899",
};

const fetcher = async (url: string): Promise<ActiveCheckInsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

interface ActivityBubblesProps {
  map: LMap | null;
  show: boolean;
}

/**
 * Renders subtle animated ripple circles on the Leaflet map at active check-in locations.
 * Uses Leaflet divIcon markers with CSS animations — lightweight and performant.
 * Auto-refreshes every 30s via SWR.
 */
export function ActivityBubbles({ map, show }: ActivityBubblesProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);

  const { data } = useSWR<ActiveCheckInsResponse>(
    show ? "/api/checkin/active" : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  useEffect(() => {
    if (!map || !show) {
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];
      return;
    }

    import("leaflet").then((L) => {
      // Remove old markers
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];

      if (!data?.checkIns?.length) return;

      // Inject animation keyframes once
      if (!document.getElementById("activity-bubble-styles")) {
        const style = document.createElement("style");
        style.id = "activity-bubble-styles";
        style.textContent = `
          @keyframes activity-ripple {
            0% { transform: scale(0.3); opacity: 0.5; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          .activity-bubble-ring {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            animation: activity-ripple 3s ease-out infinite;
          }
          .activity-bubble-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.6;
          }
          .activity-bubble-marker {
            pointer-events: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      data.checkIns.forEach((ci, i) => {
        if (ci.lat == null || ci.lon == null) return;

        const color = MODE_COLORS[ci.mode] || "#3b82f6";
        const delay = ((i * 0.7) % 3).toFixed(1);

        const html = `
          <div style="position:relative;width:24px;height:24px;">
            <div class="activity-bubble-ring" style="border:2px solid ${color};animation-delay:${delay}s;"></div>
            <div class="activity-bubble-dot" style="background:${color};"></div>
          </div>`;

        const icon = L.divIcon({
          html,
          className: "activity-bubble-marker",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([ci.lat, ci.lon], {
          icon,
          interactive: false,
          zIndexOffset: -1000,
        }).addTo(map);

        markersRef.current.push(marker);
      });
    });

    return () => {
      markersRef.current.forEach((m) => { try { m.remove(); } catch { /* */ } });
      markersRef.current = [];
    };
  }, [data, show, map]);

  return null;
}
