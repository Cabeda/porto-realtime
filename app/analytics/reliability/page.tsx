"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { computeGrade } from "@/lib/analytics/metrics";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
  const [period, setPeriod] = useState<"7d" | "30d">("7d");

  const { data } = useSWR(
    `/api/analytics/reliability?period=${period}`,
    fetcher
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/analytics"
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              &larr; Analytics
            </Link>
            <h1 className="text-2xl font-bold mt-1">Service Reliability</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Route rankings by headway adherence and excess wait time
            </p>
          </div>
          <div className="flex gap-2">
            {(["7d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                }`}
              >
                {p === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>
        </div>

        {/* Network KPIs */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="text-xs text-[var(--color-text-secondary)] uppercase">
                Network EWT
              </div>
              <div className="text-2xl font-bold mt-1">
                {data.networkEwt !== null
                  ? `${Math.floor(data.networkEwt / 60)}m ${data.networkEwt % 60}s`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="text-xs text-[var(--color-text-secondary)] uppercase">
                Headway Adherence
              </div>
              <div className="text-2xl font-bold mt-1">
                {data.networkAdherence !== null
                  ? `${data.networkAdherence}%`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="text-xs text-[var(--color-text-secondary)] uppercase">
                Bunching Rate
              </div>
              <div className="text-2xl font-bold mt-1">
                {data.networkBunching !== null
                  ? `${data.networkBunching}%`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="text-xs text-[var(--color-text-secondary)] uppercase">
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
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left px-4 py-3 font-medium">Route</th>
                  <th className="text-left px-4 py-3 font-medium">Grade</th>
                  <th className="text-right px-4 py-3 font-medium">EWT</th>
                  <th className="text-right px-4 py-3 font-medium">Adherence</th>
                  <th className="text-right px-4 py-3 font-medium">Speed</th>
                  <th className="text-right px-4 py-3 font-medium">Bunching</th>
                  <th className="text-right px-4 py-3 font-medium">Gapping</th>
                  <th className="text-right px-4 py-3 font-medium">Trips</th>
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
                      className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/analytics/line?route=${r.route}`}
                          className="font-semibold text-[var(--color-primary)] hover:underline"
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
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-text-secondary)]">
                      Loading...
                    </td>
                  </tr>
                )}
                {data?.rankings?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-text-secondary)]">
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
