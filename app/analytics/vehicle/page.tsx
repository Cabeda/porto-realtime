"use client";

import { useState, Suspense } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from "recharts";

import { DesktopNav } from "@/components/DesktopNav";
import { PeriodSelector, type PeriodValue } from "@/components/analytics/PeriodSelector";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isDateStr(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function buildUrl(vehicle: string, period: PeriodValue, view: string) {
  const dateParam = isDateStr(period) ? `date=${period}` : `period=${period}`;
  return `/api/analytics/vehicle?vehicle=${encodeURIComponent(vehicle)}&${dateParam}&view=${view}`;
}

function AdherenceBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[var(--color-content-muted)]">—</span>;
  const color = pct <= 105 ? "#22c55e" : pct <= 115 ? "#eab308" : "#ef4444";
  return <span style={{ color }} className="font-semibold">{pct}%</span>;
}

export default function VehicleAnalyticsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-surface-sunken)] flex items-center justify-center text-[var(--color-content-secondary)]">Loading...</div>}>
      <VehicleAnalyticsContent />
    </Suspense>
  );
}

function VehicleAnalyticsContent() {
  const searchParams = useSearchParams();
  const vehicleParam = searchParams.get("vehicle") || "";
  const [vehicle, setVehicle] = useState(vehicleParam);
  const [input, setInput] = useState(vehicleParam);
  const [period, setPeriod] = useState<PeriodValue>("7d");

  const { data: summary } = useSWR(
    vehicle ? buildUrl(vehicle, period, "summary") : null,
    fetcher
  );

  const { data: tripsData } = useSWR(
    vehicle ? buildUrl(vehicle, period, "trips") : null,
    fetcher
  );

  // Runtime adherence distribution (5% buckets)
  const adherenceDist = (() => {
    if (!tripsData?.trips) return [];
    const buckets = new Map<number, number>();
    for (const t of tripsData.trips) {
      if (t.adherencePct === null) continue;
      const bucket = Math.floor(t.adherencePct / 5) * 5;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([pct, count]) => ({ pct, count }));
  })();

  return (
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/analytics" className="text-sm text-accent hover:text-accent-hover">&larr;</Link>
            <h1 className="text-xl font-bold text-content">Vehicle Analytics</h1>
          </div>
          <DesktopNav />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Vehicle selector */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <h2 className="text-2xl font-bold">Bus</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); setVehicle(input.trim()); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 3245"
              className="w-32 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-110 transition"
            >
              Go
            </button>
          </form>
          <div className="ml-auto">
            <PeriodSelector value={period} onChange={setPeriod} presets={["7d", "30d"]} />
          </div>
        </div>

        {!vehicle && (
          <div className="text-center py-20 text-[var(--color-content-secondary)]">
            Enter a vehicle number above to see its performance analytics.
          </div>
        )}

        {vehicle && !summary && (
          <div className="text-center py-20 text-[var(--color-content-secondary)]">Loading...</div>
        )}

        {vehicle && summary && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide">Trips</div>
                <div className="text-2xl font-bold mt-1">{summary.totalTrips ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide">Avg Speed</div>
                <div className="text-2xl font-bold mt-1">
                  {summary.avgSpeed != null ? `${summary.avgSpeed} km/h` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide">Runtime Adherence</div>
                <div className="text-2xl font-bold mt-1">
                  <AdherenceBadge pct={summary.avgRuntimeAdherence} />
                </div>
                <div className="text-xs text-[var(--color-content-muted)] mt-0.5">actual / scheduled</div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide">Routes</div>
                <div className="text-sm font-semibold mt-1 flex flex-wrap gap-1">
                  {summary.routesOperated?.length > 0
                    ? summary.routesOperated.map((r: string) => (
                        <Link
                          key={r}
                          href={`/analytics/line?route=${encodeURIComponent(r)}`}
                          className="px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] border border-[var(--color-border)] text-xs hover:text-accent transition-colors"
                        >
                          {r}
                        </Link>
                      ))
                    : "—"}
                </div>
              </div>
            </div>

            {/* Daily performance trend */}
            {summary.dailyPerformance?.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
                <h2 className="text-lg font-semibold mb-4">Daily Performance</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={summary.dailyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} unit=" km/h" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "8px" }} />
                    <Line yAxisId="left" type="monotone" dataKey="speed" stroke="var(--color-accent)" strokeWidth={2} dot={false} name="Speed (km/h)" />
                    <Line yAxisId="right" type="monotone" dataKey="adherence" stroke="#f59e0b" strokeWidth={2} dot={false} name="Adherence (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Runtime adherence distribution */}
            {adherenceDist.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
                <h2 className="text-lg font-semibold mb-4">Runtime Adherence Distribution</h2>
                <p className="text-xs text-[var(--color-content-secondary)] mb-3">
                  100% = on schedule · &lt;100% = faster · &gt;100% = slower
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={adherenceDist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="pct" tick={{ fontSize: 11 }} unit="%" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => [v, "Trips"]} labelFormatter={(l) => `${l}–${Number(l) + 5}%`} />
                    <ReferenceLine x={100} stroke="#22c55e" strokeDasharray="4 3" />
                    <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} name="Trips" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Trip log */}
            {tripsData?.trips?.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h2 className="text-lg font-semibold mb-4">Recent Trips</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--color-content-secondary)] border-b border-[var(--color-border)]">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4">Route</th>
                        <th className="pb-2 pr-4">Start</th>
                        <th className="pb-2 pr-4">Runtime</th>
                        <th className="pb-2 pr-4">Scheduled</th>
                        <th className="pb-2 pr-4">Adherence</th>
                        <th className="pb-2">Speed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tripsData.trips.map((t: {
                        date: string; route: string; startedAt: string | null;
                        runtimeMins: number | null; scheduledRuntimeMins: number | null;
                        adherencePct: number | null; speed: number | null;
                      }, i: number) => (
                        <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)] transition-colors">
                          <td className="py-2 pr-4 text-[var(--color-content-secondary)]">{t.date}</td>
                          <td className="py-2 pr-4">
                            <Link href={`/analytics/line?route=${encodeURIComponent(t.route)}`} className="font-semibold hover:text-accent transition-colors">
                              {t.route}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 text-[var(--color-content-secondary)]">
                            {t.startedAt ? new Date(t.startedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </td>
                          <td className="py-2 pr-4">{t.runtimeMins != null ? `${t.runtimeMins} min` : "—"}</td>
                          <td className="py-2 pr-4 text-[var(--color-content-secondary)]">{t.scheduledRuntimeMins != null ? `${t.scheduledRuntimeMins} min` : "—"}</td>
                          <td className="py-2 pr-4"><AdherenceBadge pct={t.adherencePct} /></td>
                          <td className="py-2">{t.speed != null ? `${Math.round(t.speed * 10) / 10} km/h` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {summary.totalTrips === 0 && (
              <div className="text-center py-12 text-[var(--color-content-secondary)]">
                No trip data found for vehicle {vehicle} in this period.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
