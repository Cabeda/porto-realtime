"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import type L from "leaflet";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Map speed (km/h) to a color from red (slow) through yellow to green (fast) */
function speedColor(speed: number | null): string {
  if (speed === null) return "#94a3b8"; // gray for no data
  if (speed <= 5) return "#dc2626";    // red
  if (speed <= 8) return "#ea580c";    // orange-red
  if (speed <= 12) return "#d97706";   // orange
  if (speed <= 16) return "#eab308";   // yellow
  if (speed <= 20) return "#84cc16";   // lime
  if (speed <= 25) return "#22c55e";   // green
  return "#15803d";                     // dark green
}

const LEGEND_ITEMS = [
  { label: "0-5", color: "#dc2626" },
  { label: "5-8", color: "#ea580c" },
  { label: "8-12", color: "#d97706" },
  { label: "12-16", color: "#eab308" },
  { label: "16-20", color: "#84cc16" },
  { label: "20-25", color: "#22c55e" },
  { label: "25+", color: "#15803d" },
  { label: "N/A", color: "#94a3b8" },
];

export default function HeatmapPage() {
  const [period, setPeriod] = useState<"today" | "7d" | "30d">("today");
  const [route, setRoute] = useState("");
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof L | null>(null);

  const { data: segmentData } = useSWR(
    `/api/analytics/segment-speeds?period=${period}${route ? `&route=${route}` : ""}`,
    fetcher,
    { refreshInterval: period === "today" ? 300000 : 0 }
  );

  const { data: routes } = useSWR("/api/routes", fetcher);

  // Initialize map (dynamic import to avoid SSR window error)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) return;

      leafletRef.current = leaflet.default;
      const Lf = leaflet.default;

      const map = Lf.map(containerRef.current, {
        center: [41.1579, -8.6291],
        zoom: 13,
        zoomControl: true,
      });

      Lf.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      layerRef.current = Lf.layerGroup().addTo(map);
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Draw segments
  const drawSegments = useCallback(() => {
    const Lf = leafletRef.current;
    if (!Lf || !layerRef.current || !segmentData?.segments) return;

    layerRef.current.clearLayers();

    for (const seg of segmentData.segments) {
      if (!seg.geometry?.coordinates) continue;

      const coords: L.LatLngExpression[] = seg.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]] as L.LatLngExpression
      );

      const color = speedColor(seg.avgSpeed);
      const weight = seg.avgSpeed !== null ? 4 : 2;
      const opacity = seg.avgSpeed !== null ? 0.85 : 0.3;

      const polyline = Lf.polyline(coords, {
        color,
        weight,
        opacity,
      });

      const tooltip = seg.avgSpeed !== null
        ? `<b>${seg.route}</b> dir ${seg.directionId}<br/>Speed: ${seg.avgSpeed} km/h<br/>Samples: ${seg.sampleCount}`
        : `<b>${seg.route}</b> dir ${seg.directionId}<br/>No speed data`;

      polyline.bindTooltip(tooltip);
      polyline.addTo(layerRef.current!);
    }
  }, [segmentData]);

  useEffect(() => {
    drawSegments();
  }, [drawSegments]);

  const segmentsWithData = segmentData?.segments?.filter(
    (s: { avgSpeed: number | null }) => s.avgSpeed !== null
  ).length ?? 0;
  const totalSegments = segmentData?.segments?.length ?? 0;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Link href="/analytics" className="text-sm text-[var(--color-primary)] hover:underline">
          &larr; Analytics
        </Link>

        <div className="flex flex-wrap items-center gap-4 mt-2 mb-4">
          <h1 className="text-2xl font-bold">Velocity Heatmap</h1>

          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
          >
            <option value="">All routes</option>
            {routes?.routes?.map((r: { shortName: string; longName: string }) => (
              <option key={r.shortName} value={r.shortName}>
                {r.shortName} — {r.longName}
              </option>
            ))}
          </select>

          <div className="flex gap-2 ml-auto">
            {(["today", "7d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                }`}
              >
                {p === "today" ? "Today" : p === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>
        </div>

        <div className="text-sm text-[var(--color-text-secondary)] mb-3">
          {segmentData
            ? `${segmentsWithData} of ${totalSegments} segments with speed data`
            : "Loading segments..."}
        </div>

        {/* Map */}
        <div className="relative rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div ref={containerRef} className="w-full h-[600px]" />

          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 shadow-lg z-[1000]">
            <div className="text-xs font-semibold mb-2">Speed (km/h)</div>
            {LEGEND_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <span
                  className="w-4 h-1 rounded-full inline-block"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
          Segments are colored by average commercial speed. Red indicates congestion or slow service;
          green indicates free-flowing traffic. Gray segments have no data for the selected period.
          Hover over a segment for details.
        </p>
      </div>
    </div>
  );
}
