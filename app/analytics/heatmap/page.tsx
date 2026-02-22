"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import type L from "leaflet";
import { DesktopNav } from "@/components/DesktopNav";
import { PeriodSelector, type PeriodValue } from "@/components/analytics/PeriodSelector";
import "leaflet/dist/leaflet.css";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isDateStr(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Map speed (km/h) to a color — 3 meaningful bands */
function speedColor(speed: number | null): string {
  if (speed === null) return "#94a3b8";
  if (speed < 10) return "#dc2626";   // slow — congestion
  if (speed < 18) return "#f59e0b";   // moderate — acceptable urban
  return "#22c55e";                    // fast — free-flowing
}

const LEGEND_ITEMS = [
  { label: "< 10 km/h — Lento", color: "#dc2626" },
  { label: "10–18 km/h — Moderado", color: "#f59e0b" },
  { label: "> 18 km/h — Rápido", color: "#22c55e" },
  { label: "Sem dados", color: "#94a3b8" },
];

const HOUR_PRESETS = [
  { label: "Todo o dia", from: 0, to: 24 },
  { label: "Manhã cedo", from: 6, to: 9 },
  { label: "Ponta manhã", from: 7, to: 9 },
  { label: "Meio-dia", from: 11, to: 14 },
  { label: "Ponta tarde", from: 17, to: 19 },
  { label: "Noite", from: 20, to: 23 },
] as const;

export default function HeatmapPage() {
  const [period, setPeriod] = useState<PeriodValue>("today");
  const [route, setRoute] = useState("");
  const [hourPreset, setHourPreset] = useState(0); // index into HOUR_PRESETS
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof L | null>(null);

  const hp = HOUR_PRESETS[hourPreset];
  const hourSuffix = hp.from === 0 && hp.to === 24
    ? ""
    : `&hourFrom=${hp.from}&hourTo=${hp.to}`;

  const segUrl = isDateStr(period)
    ? `/api/analytics/segment-speeds?date=${period}${route ? `&route=${route}` : ""}${hourSuffix}`
    : `/api/analytics/segment-speeds?period=${period}${route ? `&route=${route}` : ""}${hourSuffix}`;

  const { data: segmentData } = useSWR(
    segUrl,
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
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/analytics" className="text-sm text-accent hover:text-accent-hover">&larr;</Link>
            <h1 className="text-xl font-bold text-content">Velocity Heatmap</h1>
          </div>
          <DesktopNav />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
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

          {/* Hour range presets */}
          <div className="flex flex-wrap gap-1">
            {HOUR_PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => setHourPreset(i)}
                className={`px-2 py-1 rounded text-xs border transition-colors ${
                  hourPreset === i
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-border)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ml-auto">
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </div>

        <div className="text-sm text-[var(--color-content-secondary)] mb-3">
          {segmentData
            ? totalSegments > 0
              ? `${segmentsWithData} of ${totalSegments} segments with speed data`
              : "No route segments found. The segment refresh cron needs to run first (/api/cron/refresh-segments)."
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

        <p className="mt-4 text-sm text-[var(--color-content-secondary)]">
          Segments are colored by average commercial speed. Red indicates congestion or slow service;
          green indicates free-flowing traffic. Gray segments have no data for the selected period.
          Hover over a segment for details.
        </p>
      </div>
    </div>
  );
}
