"use client";

import { useState, Suspense } from "react";
import useSWR from "swr";
import Link from "next/link";
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
} from "recharts";

import { DesktopNav } from "@/components/DesktopNav";
import { PeriodSelector, type PeriodValue } from "@/components/analytics/PeriodSelector";
import { MetricTooltip, METRIC_TIPS } from "@/components/analytics/MetricTooltip";

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
        <div className="min-h-screen bg-[var(--color-surface-sunken)] flex items-center justify-center text-[var(--color-content-secondary)]">
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
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/analytics" className="text-sm text-accent hover:text-accent-hover">
              &larr;
            </Link>
            <h1 className="text-xl font-bold text-content">Line Analytics</h1>
          </div>
          <DesktopNav />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Route selector */}
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold">Line</h1>
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-lg font-bold"
          >
            <option value="">Select a route...</option>
            {routes?.routes?.map((r: { shortName: string; longName: string }) => (
              <option key={r.shortName} value={r.shortName}>
                {r.shortName} — {r.longName}
              </option>
            ))}
          </select>
          <div className="ml-auto">
            <PeriodSelector value={period} onChange={setPeriod} presets={["7d", "30d"]} />
          </div>
        </div>

        {!route && (
          <div className="text-center py-20 text-[var(--color-content-secondary)]">
            Select a route above to see its performance analytics.
          </div>
        )}

        {route && summary && (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center gap-3">
                <GradeBadge grade={summary.grade} />
                <div>
                  <div className="text-xs text-[var(--color-content-secondary)] flex items-center">
                    Grade <MetricTooltip text={METRIC_TIPS.grade} />
                  </div>
                  <div className="font-semibold">{summary.grade}</div>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-content-secondary)] flex items-center">
                  Trips <MetricTooltip text={METRIC_TIPS.trips} />
                </div>
                <div className="text-xl font-bold">{summary.totalTrips}</div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-content-secondary)] flex items-center">
                  EWT <MetricTooltip text={METRIC_TIPS.ewt} />
                </div>
                <div className="text-xl font-bold">
                  {summary.avgEwt !== null
                    ? `${Math.floor(summary.avgEwt / 60)}m ${summary.avgEwt % 60}s`
                    : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-content-secondary)] flex items-center">
                  Adherence <MetricTooltip text={METRIC_TIPS.headwayAdherence} />
                </div>
                <div className="text-xl font-bold">
                  {summary.avgHeadwayAdherence !== null ? `${summary.avgHeadwayAdherence}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-content-secondary)] flex items-center">
                  Speed <MetricTooltip text={METRIC_TIPS.speed} />
                </div>
                <div className="text-xl font-bold">
                  {summary.avgCommercialSpeed !== null ? `${summary.avgCommercialSpeed} km/h` : "—"}
                </div>
              </div>
            </div>

            {/* Headway Distribution */}
            {headways?.headways?.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
                <h2 className="text-lg font-semibold mb-4">Headway Distribution</h2>
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
                <div className="mt-2 text-sm text-[var(--color-content-secondary)]">
                  Average headway: {headways.avgHeadwayMins ?? "—"} min | Total observations:{" "}
                  {headways.totalHeadways}
                </div>
              </div>
            )}

            {/* Runtime Distribution */}
            {runtimes?.runtimes?.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
                <h2 className="text-lg font-semibold mb-4">Runtime Distribution</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={runtimes.runtimes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="minutes" tick={{ fontSize: 12 }} unit=" min" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Trips" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 text-sm text-[var(--color-content-secondary)]">
                  Average: {runtimes.avgRuntimeMins ?? "—"} min | Median:{" "}
                  {runtimes.medianRuntimeMins ?? "—"} min
                </div>
              </div>
            )}

            {/* Daily Performance Trend */}
            {summary.dailyPerformance?.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
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
              <div className="text-center py-12 text-[var(--color-content-secondary)]">
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
