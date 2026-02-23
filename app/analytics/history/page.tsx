"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import type L from "leaflet";
import { DesktopNav } from "@/components/DesktopNav";
import "leaflet/dist/leaflet.css";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Interpolate a position along a polyline [0..1]
function interpolatePolyline(
  coords: [number, number][],
  t: number
): [number, number] {
  if (coords.length === 0) return [41.1579, -8.6291];
  if (t <= 0) return coords[0];
  if (t >= 1) return coords[coords.length - 1];

  // Compute cumulative distances
  const dists: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const dlat = coords[i][0] - coords[i - 1][0];
    const dlon = coords[i][1] - coords[i - 1][1];
    dists.push(dists[i - 1] + Math.sqrt(dlat * dlat + dlon * dlon));
  }
  const total = dists[dists.length - 1];
  const target = t * total;

  for (let i = 1; i < dists.length; i++) {
    if (dists[i] >= target) {
      const seg = dists[i] - dists[i - 1];
      const frac = seg > 0 ? (target - dists[i - 1]) / seg : 0;
      return [
        coords[i - 1][0] + frac * (coords[i][0] - coords[i - 1][0]),
        coords[i - 1][1] + frac * (coords[i][1] - coords[i - 1][1]),
      ];
    }
  }
  return coords[coords.length - 1];
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toUTCString().slice(17, 22); // HH:MM
}

interface TripEntry {
  v: string;       // vehicle num
  r: string;       // route
  d: number;       // directionId
  s: number;       // startedAt ms
  e: number;       // endedAt ms
  spd: number | null;
}

interface ReplayData {
  date: string;
  dayStartMs: number;
  dayEndMs: number;
  trips: TripEntry[];
}

interface PatternGeometry {
  patternId: string;
  routeShortName: string;
  directionId: number;
  geometry: { coordinates: [number, number][] };
}

export default function HistoryPage() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  const [date, setDate] = useState(yesterday);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [speed, setSpeed] = useState(60); // 60x = 1 min real time per second

  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  const { data: replayData, isLoading: replayLoading } = useSWR<ReplayData>(
    `/api/analytics/replay?date=${date}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: shapesData } = useSWR<{ patterns: PatternGeometry[] }>(
    "/api/route-shapes",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 86400_000 }
  );

  // Build route→direction→coords index
  const shapeIndex = useRef<Map<string, [number, number][]>>(new Map());
  useEffect(() => {
    if (!shapesData?.patterns) return;
    const idx = new Map<string, [number, number][]>();
    for (const p of shapesData.patterns) {
      const key = `${p.routeShortName}:${p.directionId}`;
      if (!idx.has(key)) {
        idx.set(key, p.geometry.coordinates.map(([lon, lat]) => [lat, lon]));
      }
    }
    shapeIndex.current = idx;
  }, [shapesData]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) return;
      const Lf = leaflet.default;
      leafletRef.current = Lf;

      const map = Lf.map(containerRef.current, {
        center: [41.1579, -8.6291],
        zoom: 13,
        zoomControl: true,
      });

      Lf.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19,
        }
      ).addTo(map);

      layerRef.current = Lf.layerGroup().addTo(map);
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current.clear();
      }
    };
  }, []);

  // Reset scrubber when data loads
  useEffect(() => {
    if (replayData) {
      setCurrentMs(replayData.dayStartMs);
      setPlaying(false);
    }
  }, [replayData]);

  // Draw frame
  const drawFrame = useCallback(
    (ms: number) => {
      const Lf = leafletRef.current;
      const layer = layerRef.current;
      if (!Lf || !layer || !replayData) return;

      const active = replayData.trips.filter((t) => t.s <= ms && t.e >= ms);
      const activeIds = new Set(active.map((t) => `${t.v}:${t.r}:${t.d}`));

      // Remove stale markers
      for (const [id, marker] of markersRef.current) {
        if (!activeIds.has(id)) {
          layer.removeLayer(marker);
          markersRef.current.delete(id);
        }
      }

      // Update / create markers
      for (const trip of active) {
        const id = `${trip.v}:${trip.r}:${trip.d}`;
        const progress = (ms - trip.s) / (trip.e - trip.s);
        const coords =
          shapeIndex.current.get(`${trip.r}:${trip.d}`) ??
          shapeIndex.current.get(`${trip.r}:0`);

        if (!coords || coords.length === 0) continue;

        const pos = interpolatePolyline(coords, progress);

        if (markersRef.current.has(id)) {
          markersRef.current.get(id)!.setLatLng(pos);
        } else {
          const marker = Lf.circleMarker(pos, {
            radius: 5,
            color: "#fff",
            weight: 1,
            fillColor: "var(--color-accent, #3b82f6)",
            fillOpacity: 0.9,
          });
          marker.bindTooltip(`${trip.r} · ${trip.v}`);
          marker.addTo(layer);
          markersRef.current.set(id, marker);
        }
      }
    },
    [replayData]
  );

  // Animation loop
  useEffect(() => {
    if (!playing || !replayData) return;

    const tick = (now: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }
      const dtMs = (now - lastTickRef.current) * speed;
      lastTickRef.current = now;

      setCurrentMs((prev) => {
        const next = prev + dtMs;
        if (next >= replayData.dayEndMs) {
          setPlaying(false);
          return replayData.dayEndMs;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
    };
  }, [playing, speed, replayData]);

  // Draw on every currentMs change
  useEffect(() => {
    drawFrame(currentMs);
  }, [currentMs, drawFrame]);

  const totalMs = replayData
    ? replayData.dayEndMs - replayData.dayStartMs
    : 1;
  const progressPct = replayData
    ? ((currentMs - replayData.dayStartMs) / totalMs) * 100
    : 0;

  const activeCount = replayData
    ? replayData.trips.filter((t) => t.s <= currentMs && t.e >= currentMs).length
    : 0;

  return (
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/analytics" className="text-sm text-accent hover:text-accent-hover">
              &larr;
            </Link>
            <h1 className="text-xl font-bold text-content">History Replay</h1>
          </div>
          <DesktopNav />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <input
            type="date"
            value={date}
            max={yesterday}
            onChange={(e) => {
              setDate(e.target.value);
              setPlaying(false);
            }}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
          />

          <button
            onClick={() => setPlaying((p) => !p)}
            disabled={!replayData || replayLoading}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm disabled:opacity-40"
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>

          <button
            onClick={() => {
              setPlaying(false);
              setCurrentMs(replayData?.dayStartMs ?? 0);
            }}
            disabled={!replayData}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm disabled:opacity-40"
          >
            ↺ Reset
          </button>

          <label className="flex items-center gap-2 text-sm">
            Speed
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
            >
              <option value={30}>30×</option>
              <option value={60}>60×</option>
              <option value={120}>120×</option>
              <option value={300}>300×</option>
            </select>
          </label>

          <span className="text-sm text-[var(--color-content-secondary)] ml-auto">
            {replayData ? `${activeCount} vehicles active` : replayLoading ? "Loading…" : ""}
          </span>
        </div>

        {/* Scrubber */}
        <div className="mb-4">
          <input
            type="range"
            min={replayData?.dayStartMs ?? 0}
            max={replayData?.dayEndMs ?? 1}
            value={currentMs}
            onChange={(e) => {
              setPlaying(false);
              setCurrentMs(Number(e.target.value));
            }}
            disabled={!replayData}
            className="w-full accent-[var(--color-accent)]"
          />
          <div className="flex justify-between text-xs text-[var(--color-content-secondary)] mt-1">
            <span>{replayData ? formatTime(replayData.dayStartMs) : "--:--"}</span>
            <span className="font-mono">{formatTime(currentMs)}</span>
            <span>{replayData ? formatTime(replayData.dayEndMs) : "--:--"}</span>
          </div>
        </div>

        {/* Map */}
        <div className="relative rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div ref={containerRef} className="w-full h-[580px]" />
          {!replayData && !replayLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/80 text-sm text-[var(--color-content-secondary)]">
              Select a date to load replay data
            </div>
          )}
          {replayLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/80 text-sm text-[var(--color-content-secondary)]">
              Loading trip data…
            </div>
          )}
        </div>

        <p className="mt-3 text-sm text-[var(--color-content-secondary)]">
          Vehicles are interpolated along known route shapes. Position is estimated — not GPS-exact.
          Data available from the day aggregation runs (yesterday and earlier).
        </p>
      </div>
    </div>
  );
}
