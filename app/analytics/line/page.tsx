"use client";

import { useState, Suspense } from "react";
import useSWR from "swr";

import { useSearchParams } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  Cell,
} from "recharts";

import { PageHeader } from "@/components/PageHeader";
import { PeriodSelector, type PeriodValue } from "@/components/analytics/PeriodSelector";
import { MetricTooltip, useMetricTips } from "@/components/analytics/MetricTooltip";

// --- Stop spacing helpers ---

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface LineStop {
  gtfsId: string;
  name: string;
  lat: number;
  lon: number;
}

interface SpacingSegment {
  label: string;
  meters: number;
}

function computeSpacings(stops: LineStop[]): SpacingSegment[] {
  const segments: SpacingSegment[] = [];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!;
    const curr = stops[i]!;
    const d = haversineMeters(prev.lat, prev.lon, curr.lat, curr.lon);
    segments.push({ label: curr.name, meters: Math.round(d) });
  }
  return segments;
}

// EU benchmark ~400 m, US average ~313 m (Works in Progress article)
const EU_BENCHMARK = 400;
const US_AVERAGE = 313;

function spacingColor(meters: number): string {
  if (meters < 200) return "#ef4444"; // very short — over-stopped
  if (meters < EU_BENCHMARK) return "#f59e0b"; // below EU benchmark
  return "#22c55e"; // at or above EU benchmark
}

interface StopSpacingSectionProps {
  lineId: string;
}

function StopSpacingSection({ lineId }: StopSpacingSectionProps) {
  const { data: lineInfo } = useSWR<{ patterns: { directionId: number; stops: LineStop[] }[] }>(
    `/api/line?id=${encodeURIComponent(lineId)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3600000 }
  );
  const [dirIdx, setDirIdx] = useState(0);

  if (!lineInfo) {
    return (
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 h-48 animate-pulse" />
    );
  }

  const directions = lineInfo.patterns.reduce<typeof lineInfo.patterns>((acc, p) => {
    if (!acc.find((d) => d.directionId === p.directionId)) acc.push(p);
    return acc;
  }, []);

  const activeStops = directions[dirIdx]?.stops ?? [];
  const segments = computeSpacings(activeStops);

  if (segments.length === 0) return null;

  const avg = Math.round(segments.reduce((s, x) => s + x.meters, 0) / segments.length);
  const min = Math.min(...segments.map((s) => s.meters));
  const max = Math.max(...segments.map((s) => s.meters));
  const belowEU = segments.filter((s) => s.meters < EU_BENCHMARK).length;
  const pctBelowEU = Math.round((belowEU / segments.length) * 100);

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold">Stop Spacing</h2>
        {directions.length > 1 && (
          <div className="flex gap-1">
            {directions.map((d, i) => (
              <button
                key={d.directionId}
                onClick={() => setDirIdx(i)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  i === dirIdx
                    ? "bg-(--color-accent) text-white"
                    : "bg-(--color-surface-sunken) text-(--color-content-secondary)"
                }`}
              >
                Dir {d.directionId}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-(--color-content-secondary) mb-4">
        Distance between consecutive stops. EU benchmark ≈ 400 m · US average ≈ 313 m.
      </p>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          {
            label: "Avg spacing",
            value: `${avg} m`,
            sub: avg >= EU_BENCHMARK ? "≥ EU benchmark" : "< EU benchmark",
            ok: avg >= EU_BENCHMARK,
          },
          { label: "Min spacing", value: `${min} m`, sub: "shortest gap", ok: min >= 200 },
          { label: "Max spacing", value: `${max} m`, sub: "longest gap", ok: true },
          {
            label: "Below EU benchmark",
            value: `${pctBelowEU}%`,
            sub: `${belowEU} of ${segments.length} gaps`,
            ok: pctBelowEU < 30,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-(--color-border) p-3">
            <div className="text-xs text-(--color-content-secondary)">{kpi.label}</div>
            <div className={`text-xl font-bold ${kpi.ok ? "text-green-500" : "text-amber-500"}`}>
              {kpi.value}
            </div>
            <div className="text-xs text-(--color-content-secondary)">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={segments} margin={{ top: 4, right: 8, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            interval={Math.max(0, Math.floor(segments.length / 12) - 1)}
          />
          <YAxis tick={{ fontSize: 11 }} unit=" m" />
          <Tooltip formatter={(v: number | undefined) => [`${v ?? 0} m`, "Distance"]} />
          <ReferenceLine
            y={EU_BENCHMARK}
            stroke="#22c55e"
            strokeWidth={2}
            label={{
              value: "EU 400 m",
              fontSize: 11,
              fontWeight: 700,
              fill: "#22c55e",
              position: "insideTopLeft",
            }}
          />
          <ReferenceLine
            y={US_AVERAGE}
            stroke="#f59e0b"
            strokeWidth={2}
            label={{
              value: "US 313 m",
              fontSize: 11,
              fontWeight: 700,
              fill: "#f59e0b",
              position: "insideBottomLeft",
            }}
          />
          <Bar dataKey="meters" radius={[3, 3, 0, 0]} name="Distance">
            {segments.map((s, i) => (
              <Cell key={i} fill={spacingColor(s.meters)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isDateStr(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function buildLineUrl(route: string, period: PeriodValue, view: string): string {
  const dateParam = isDateStr(period) ? `date=${period}` : `period=${period}`;
  return `/api/analytics/line?route=${route}&${dateParam}&view=${view}`;
}

function GradeBadge({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    A: "bg-green-500",
    B: "bg-green-400",
    C: "bg-yellow-400",
    D: "bg-orange-400",
    F: "bg-red-500",
    "N/A": "bg-gray-400",
  };
  return (
    <span
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-lg font-bold ${colors[grade] || "bg-gray-400"}`}
    >
      {grade}
    </span>
  );
}

export default function LineAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-(--color-surface-sunken) flex items-center justify-center text-(--color-content-secondary)">
          Loading...
        </div>
      }
    >
      <LineAnalyticsContent />
    </Suspense>
  );
}

function LineAnalyticsContent() {
  const searchParams = useSearchParams();
  const routeParam = searchParams.get("route") || "";
  const [route, setRoute] = useState(routeParam);
  const [period, setPeriod] = useState<PeriodValue>("7d");
  const tips = useMetricTips();

  const { data: summary } = useSWR(route ? buildLineUrl(route, period, "summary") : null, fetcher);

  const { data: headways } = useSWR(
    route ? buildLineUrl(route, period, "headways") : null,
    fetcher
  );

  const { data: runtimes } = useSWR(
    route ? buildLineUrl(route, period, "runtimes") : null,
    fetcher
  );

  const { data: routes } = useSWR("/api/routes", fetcher);

  return (
    <div className="min-h-screen bg-(--color-surface-sunken) text-(--color-content)">
      <PageHeader title="Line Analytics" backHref="/analytics" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Route selector */}
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold">Line</h1>
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="px-3 py-2 rounded-lg border border-(--color-border) bg-(--color-surface) text-lg font-bold"
          >
            <option value="">Select a route...</option>
            {routes?.routes?.map((r: { gtfsId: string; shortName: string; longName: string }) => (
              <option key={r.gtfsId} value={r.shortName}>
                {r.shortName} — {r.longName}
              </option>
            ))}
          </select>
          <div className="ml-auto">
            <PeriodSelector value={period} onChange={setPeriod} presets={["7d", "30d"]} />
          </div>
        </div>

        {!route && (
          <div className="text-center py-20 text-(--color-content-secondary)">
            Select a route above to see its performance analytics.
          </div>
        )}

        {route && summary && (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 flex items-center gap-3">
                <GradeBadge grade={summary.grade} />
                <div>
                  <div className="text-xs text-(--color-content-secondary) flex items-center">
                    Grade <MetricTooltip text={tips.grade} />
                  </div>
                  <div className="font-semibold">{summary.grade}</div>
                </div>
              </div>
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
                <div className="text-xs text-(--color-content-secondary) flex items-center">
                  Trips <MetricTooltip text={tips.trips} />
                </div>
                <div className="text-xl font-bold">{summary.totalTrips}</div>
              </div>
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
                <div className="text-xs text-(--color-content-secondary) flex items-center">
                  EWT <MetricTooltip text={tips.ewt} />
                </div>
                <div className="text-xl font-bold">
                  {summary.avgEwt !== null
                    ? `${Math.floor(summary.avgEwt / 60)}m ${summary.avgEwt % 60}s`
                    : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
                <div className="text-xs text-(--color-content-secondary) flex items-center">
                  Adherence <MetricTooltip text={tips.headwayAdherence} />
                </div>
                <div className="text-xl font-bold">
                  {summary.avgHeadwayAdherence !== null ? `${summary.avgHeadwayAdherence}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
                <div className="text-xs text-(--color-content-secondary) flex items-center">
                  Speed <MetricTooltip text={tips.speed} />
                </div>
                <div className="text-xl font-bold">
                  {summary.avgCommercialSpeed !== null ? `${summary.avgCommercialSpeed} km/h` : "—"}
                </div>
              </div>
            </div>

            {/* Stop Spacing Analysis */}
            <StopSpacingSection lineId={route} />

            {/* Headway Distribution */}
            {headways?.headways?.length > 0 && (
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 mb-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center">
                  Headway Distribution <MetricTooltip text={tips.headwayDistribution} />
                </h2>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={headways.headways}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="minutes" tick={{ fontSize: 12 }} unit=" min" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      fill="var(--color-accent)"
                      radius={[4, 4, 0, 0]}
                      name="Trips"
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 text-sm text-(--color-content-secondary)">
                  Average headway: {headways.avgHeadwayMins ?? "—"} min | Total observations:{" "}
                  {headways.totalHeadways}
                </div>
              </div>
            )}

            {/* Runtime Distribution */}
            {runtimes?.runtimes?.length > 0 && (
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 mb-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center">
                  Runtime Distribution <MetricTooltip text={tips.runtimeDistribution} />
                </h2>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={runtimes.runtimes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="minutes" tick={{ fontSize: 12 }} unit=" min" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Trips" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 text-sm text-(--color-content-secondary)">
                  Average: {runtimes.avgRuntimeMins ?? "—"} min | Median:{" "}
                  {runtimes.medianRuntimeMins ?? "—"} min
                </div>
              </div>
            )}

            {/* Daily Performance Trend */}
            {summary.dailyPerformance?.length > 0 && (
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
                <h2 className="text-lg font-semibold mb-4">Daily Performance</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={summary.dailyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} unit=" km/h" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="speed"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={false}
                      name="Speed (km/h)"
                    />
                    <ReferenceLine
                      yAxisId="left"
                      y={15.4}
                      stroke="#f59e0b"
                      strokeDasharray="4 3"
                      label={{
                        value: "STCP 2024 (15.4)",
                        fontSize: 10,
                        fill: "#f59e0b",
                        position: "insideTopRight",
                      }}
                    />
                    <ReferenceLine
                      yAxisId="left"
                      y={18}
                      stroke="#22c55e"
                      strokeDasharray="4 3"
                      label={{
                        value: "EU target (18)",
                        fontSize: 10,
                        fill: "#22c55e",
                        position: "insideTopRight",
                      }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="adherence"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                      name="Adherence (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* No data state */}
            {!summary.totalTrips && (
              <div className="text-center py-12 text-(--color-content-secondary)">
                No trip data available for route {route} in this period. Data will appear after the
                aggregation pipeline runs.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
