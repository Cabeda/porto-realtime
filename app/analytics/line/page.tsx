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
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function GradeBadge({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    A: "bg-green-500", B: "bg-green-400", C: "bg-yellow-400",
    D: "bg-orange-400", F: "bg-red-500", "N/A": "bg-gray-400",
  };
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-lg font-bold ${colors[grade] || "bg-gray-400"}`}>
      {grade}
    </span>
  );
}

export default function LineAnalyticsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center text-[var(--color-text-secondary)]">Loading...</div>}>
      <LineAnalyticsContent />
    </Suspense>
  );
}

function LineAnalyticsContent() {
  const searchParams = useSearchParams();
  const routeParam = searchParams.get("route") || "";
  const [route, setRoute] = useState(routeParam);
  const [period, setPeriod] = useState<"7d" | "30d">("7d");

  const { data: summary } = useSWR(
    route ? `/api/analytics/line?route=${route}&period=${period}&view=summary` : null,
    fetcher
  );

  const { data: headways } = useSWR(
    route ? `/api/analytics/line?route=${route}&period=${period}&view=headways` : null,
    fetcher
  );

  const { data: runtimes } = useSWR(
    route ? `/api/analytics/line?route=${route}&period=${period}&view=runtimes` : null,
    fetcher
  );

  const { data: routes } = useSWR("/api/routes", fetcher);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Link href="/analytics" className="text-sm text-[var(--color-primary)] hover:underline">
          &larr; Analytics
        </Link>

        {/* Route selector */}
        <div className="flex items-center gap-4 mt-2 mb-6">
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
          <div className="flex gap-2 ml-auto">
            {(["7d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                }`}
              >
                {p === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>
        </div>

        {!route && (
          <div className="text-center py-20 text-[var(--color-text-secondary)]">
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
                  <div className="text-xs text-[var(--color-text-secondary)]">Grade</div>
                  <div className="font-semibold">{summary.grade}</div>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-text-secondary)]">Trips</div>
                <div className="text-xl font-bold">{summary.totalTrips}</div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-text-secondary)]">EWT</div>
                <div className="text-xl font-bold">
                  {summary.avgEwt !== null ? `${Math.floor(summary.avgEwt / 60)}m ${summary.avgEwt % 60}s` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-text-secondary)]">Adherence</div>
                <div className="text-xl font-bold">
                  {summary.avgHeadwayAdherence !== null ? `${summary.avgHeadwayAdherence}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-text-secondary)]">Speed</div>
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
                    <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Trips" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  Average headway: {headways.avgHeadwayMins ?? "—"} min | Total observations: {headways.totalHeadways}
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
                <div className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  Average: {runtimes.avgRuntimeMins ?? "—"} min | Median: {runtimes.medianRuntimeMins ?? "—"} min
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
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="speed" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Speed (km/h)" />
                    <Line type="monotone" dataKey="adherence" stroke="#22c55e" strokeWidth={2} dot={false} name="Adherence (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* No data state */}
            {!summary.totalTrips && (
              <div className="text-center py-12 text-[var(--color-text-secondary)]">
                No trip data available for route {route} in this period. Data will appear after the aggregation pipeline runs.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
