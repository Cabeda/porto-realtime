"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { computeGrade } from "@/lib/analytics/metrics";

import { DesktopNav } from "@/components/DesktopNav";
import { PeriodSelector, type PeriodValue } from "@/components/analytics/PeriodSelector";
import { MetricTooltip, METRIC_TIPS } from "@/components/analytics/MetricTooltip";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isDateStr(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function buildApiUrl(base: string, period: PeriodValue): string {
  if (isDateStr(period)) return `${base}?date=${period}`;
  return `${base}?period=${period}`;
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
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold ${colors[grade] || "bg-gray-400"}`}
    >
      {grade}
    </span>
  );
}

export default function ReliabilityPage() {
  const [period, setPeriod] = useState<PeriodValue>("7d");

  const { data } = useSWR(
    buildApiUrl("/api/analytics/reliability", period),
    fetcher
  );

  return (
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/analytics" className="text-sm text-accent hover:text-accent-hover">&larr;</Link>
            <h1 className="text-xl font-bold text-content">Service Reliability</h1>
          </div>
          <DesktopNav />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-[var(--color-content-secondary)]">
            Route rankings by headway adherence and excess wait time
          </p>
          <PeriodSelector
            value={period}
            onChange={setPeriod}
            presets={["7d", "30d"]}
          />
        </div>

        {/* Network KPIs */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="text-xs text-[var(--color-content-secondary)] uppercase flex items-center">
                Network EWT
                <MetricTooltip text={METRIC_TIPS.ewt} />
              </div>
              <div className="text-2xl font-bold mt-1">
                {data.networkEwt !== null
                  ? `${Math.floor(data.networkEwt / 60)}m ${data.networkEwt % 60}s`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="text-xs text-[var(--color-content-secondary)] uppercase flex items-center">
                Headway Adherence
                <MetricTooltip text={METRIC_TIPS.headwayAdherence} />
              </div>
              <div className="text-2xl font-bold mt-1">
                {data.networkAdherence !== null
                  ? `${data.networkAdherence}%`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="text-xs text-[var(--color-content-secondary)] uppercase flex items-center">
                Bunching Rate
                <MetricTooltip text={METRIC_TIPS.bunching} />
              </div>
              <div className="text-2xl font-bold mt-1">
                {data.networkBunching !== null
                  ? `${data.networkBunching}%`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="text-xs text-[var(--color-content-secondary)] uppercase">
                Routes Tracked
              </div>
              <div className="text-2xl font-bold mt-1">
                {data.totalRoutes ?? "—"}
              </div>
            </div>
          </div>
        )}

        {/* Rankings Table */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
                  <th className="text-left px-4 py-3 font-medium">Route</th>
                  <th className="text-left px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-1">Grade <MetricTooltip text={METRIC_TIPS.grade} /></span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="inline-flex items-center justify-end gap-1">EWT <MetricTooltip text={METRIC_TIPS.ewt} /></span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="inline-flex items-center justify-end gap-1">Adherence <MetricTooltip text={METRIC_TIPS.headwayAdherence} /></span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="inline-flex items-center justify-end gap-1">Speed <MetricTooltip text={METRIC_TIPS.speed} /></span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="inline-flex items-center justify-end gap-1">Bunching <MetricTooltip text={METRIC_TIPS.bunching} /></span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="inline-flex items-center justify-end gap-1">Gapping <MetricTooltip text={METRIC_TIPS.gapping} /></span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="inline-flex items-center justify-end gap-1">Trips <MetricTooltip text={METRIC_TIPS.trips} /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.rankings?.map(
                  (r: {
                    route: string;
                    grade: string;
                    ewt: number | null;
                    headwayAdherence: number | null;
                    avgSpeed: number | null;
                    bunching: number | null;
                    gapping: number | null;
                    trips: number;
                  }) => (
                    <tr
                      key={r.route}
                      className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/analytics/line?route=${r.route}`}
                          className="font-semibold text-[var(--color-accent)] hover:underline"
                        >
                          {r.route}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <GradeBadge grade={r.grade} />
                      </td>
                      <td className="text-right px-4 py-3">
                        {r.ewt !== null
                          ? `${Math.floor(r.ewt / 60)}m ${r.ewt % 60}s`
                          : "—"}
                      </td>
                      <td className="text-right px-4 py-3">
                        {r.headwayAdherence !== null
                          ? `${r.headwayAdherence}%`
                          : "—"}
                      </td>
                      <td className="text-right px-4 py-3">
                        {r.avgSpeed !== null ? `${r.avgSpeed} km/h` : "—"}
                      </td>
                      <td className="text-right px-4 py-3">
                        {r.bunching !== null ? `${r.bunching}%` : "—"}
                      </td>
                      <td className="text-right px-4 py-3">
                        {r.gapping !== null ? `${r.gapping}%` : "—"}
                      </td>
                      <td className="text-right px-4 py-3">{r.trips}</td>
                    </tr>
                  )
                )}
                {!data && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-content-secondary)]">
                      Loading...
                    </td>
                  </tr>
                )}
                {data?.rankings?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-content-secondary)]">
                      No data available yet. Reliability metrics will appear after the first day of aggregation.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
