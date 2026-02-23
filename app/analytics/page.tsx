"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";
import Link from "next/link";

import { DesktopNav } from "@/components/DesktopNav";
import { PeriodSelector, type PeriodValue } from "@/components/analytics/PeriodSelector";
import { MetricTooltip, METRIC_TIPS } from "@/components/analytics/MetricTooltip";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isDateStr(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function buildApiUrl(base: string, period: PeriodValue): string {
  if (isDateStr(period)) {
    return `${base}?date=${period}`;
  }
  return `${base}?period=${period}`;
}

function KpiCard({
  label,
  value,
  unit,
  subtitle,
  color,
  tooltip,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  subtitle?: string;
  color?: string;
  tooltip?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide flex items-center">
        {label}
        {tooltip && <MetricTooltip text={tooltip} />}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className="text-2xl font-bold"
          style={color ? { color } : undefined}
        >
          {value ?? "—"}
        </span>
        {unit && (
          <span className="text-sm text-[var(--color-content-secondary)]">
            {unit}
          </span>
        )}
      </div>
      {subtitle && (
        <div className="mt-1 text-xs text-[var(--color-content-secondary)]">
          {subtitle}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<PeriodValue>("today");
  const [selectedRoute, setSelectedRoute] = useState("");

  const { data: routes } = useSWR("/api/routes", fetcher, { revalidateOnFocus: false });

  function buildUrl(base: string) {
    const url = buildApiUrl(base, period);
    return selectedRoute ? `${url}&route=${encodeURIComponent(selectedRoute)}` : url;
  }

  const { data: summary } = useSWR(
    buildApiUrl("/api/analytics/network-summary", period),
    fetcher,
    { refreshInterval: period === "today" ? 300000 : 0 }
  );

  const { data: speedTs } = useSWR(
    buildUrl("/api/analytics/speed-timeseries"),
    fetcher
  );

  const { data: fleet } = useSWR(
    buildUrl("/api/analytics/fleet-activity"),
    fetcher,
    { refreshInterval: period === "today" ? 300000 : 0 }
  );

  const periodLabel = isDateStr(period) ? period : period === "today" ? "right now" : `over ${period}`;

  // For "today", null-out trailing hours with no data so the chart stops
  // at the current hour rather than misleadingly sloping to zero.
  const fleetTimeseries = (() => {
    const ts = fleet?.timeseries;
    if (!ts) return ts;
    if (period !== "today") return ts;
    let last = ts.length - 1;
    while (last > 0 && ts[last].totalVehicles === 0) last--;
    return ts.map((entry: { hour: number; label: string; totalVehicles: number; routes: unknown[] }, i: number) =>
      i > last ? { ...entry, totalVehicles: null } : entry
    );
  })();

  return (
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-content flex-shrink-0">Transit Analytics</h1>
          <DesktopNav />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Period selector + route filter */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <p className="text-sm text-[var(--color-content-secondary)]">
            STCP network performance — Porto
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
            >
              <option value="">All routes</option>
              {routes?.routes?.map((r: { shortName: string; longName: string }) => (
                <option key={r.shortName} value={r.shortName}>
                  {r.shortName} — {r.longName}
                </option>
              ))}
            </select>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Active Buses"
            value={
              summary?.activeVehicles != null
                ? summary.activeVehicles
                : summary?.days != null
                ? `${summary.days} days`
                : null
            }
            subtitle={periodLabel}
            tooltip={METRIC_TIPS.activeBuses}
          />
          <KpiCard
            label="Network Speed"
            value={summary?.avgSpeed}
            unit="km/h"
            color={
              summary?.avgSpeed
                ? summary.avgSpeed > 15
                  ? "#22c55e"
                  : summary.avgSpeed > 10
                  ? "#eab308"
                  : "#ef4444"
                : undefined
            }
            tooltip={METRIC_TIPS.networkSpeed}
          />
          <KpiCard
            label="Excess Wait Time"
            value={
              summary?.ewt !== null && summary?.ewt !== undefined
                ? `${Math.floor(summary.ewt / 60)}m ${summary.ewt % 60}s`
                : null
            }
            subtitle={
              period === "today" && summary?.lastAggregatedDate
                ? `from ${summary.lastAggregatedDate}`
                : undefined
            }
            color={
              summary?.ewt
                ? summary.ewt < 120
                  ? "#22c55e"
                  : summary.ewt < 240
                  ? "#eab308"
                  : "#ef4444"
                : undefined
            }
            tooltip={METRIC_TIPS.ewt}
          />
          <KpiCard
            label="Worst Line"
            value={summary?.worstRoute}
            subtitle={
              summary?.worstRouteEwt
                ? `EWT: ${Math.round(summary.worstRouteEwt / 60)}min${period === "today" && summary?.lastAggregatedDate ? ` (${summary.lastAggregatedDate})` : ""}`
                : undefined
            }
            tooltip={METRIC_TIPS.worstLine}
          />
        </div>

        {/* Navigation links */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/analytics/heatmap"
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-border)] transition-colors"
          >
            Velocity Heatmap
          </Link>
          <Link
            href="/analytics/reliability"
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-border)] transition-colors"
          >
            Reliability Rankings
          </Link>
          <Link
            href="/analytics/data"
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-border)] transition-colors"
          >
            Download Data
          </Link>
          <Link
            href="/analytics/about"
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-border)] transition-colors"
          >
            Methodology
          </Link>
        </div>

        {/* Speed Over Time Chart */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            Average Speed by Hour
          </h2>
          {speedTs?.timeseries ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={speedTs.timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--color-content-secondary)" }}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--color-content-secondary)" }}
                  domain={[0, "auto"]}
                  unit=" km/h"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avgSpeed"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={false}
                  name="Avg Speed"
                />
                <ReferenceLine y={18} stroke="#22c55e" strokeDasharray="4 3" label={{ value: "Meta EU 18", fill: "#22c55e", fontSize: 11, position: "insideTopRight" }} />
                <ReferenceLine y={12} stroke="#eab308" strokeDasharray="4 3" label={{ value: "Mínimo 12", fill: "#eab308", fontSize: 11, position: "insideTopRight" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-[var(--color-content-secondary)]">
              {speedTs === undefined ? "Loading..." : "No data available yet. Data will appear after the first day of collection."}
            </div>
          )}
        </div>

        {/* Fleet Activity Chart */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-lg font-semibold mb-4">
            Active Buses by Hour
          </h2>
          {fleetTimeseries ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={fleetTimeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--color-content-secondary)" }}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--color-content-secondary)" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalVehicles"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.2}
                  name="Active Buses"
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-[var(--color-content-secondary)]">
              {fleet === undefined ? "Loading..." : "No data available yet."}
            </div>
          )}        </div>
      </div>
    </div>
  );
}
