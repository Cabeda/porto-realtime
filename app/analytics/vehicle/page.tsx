"use client";

import { useState, Suspense } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
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

function buildUrl(params: Record<string, string | undefined>, view: string) {
  const base = new URLSearchParams();
  base.set("view", view);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) base.set(k, v);
  }
  return `/api/analytics/vehicle?${base}`;
}

function periodParam(period: PeriodValue) {
  return isDateStr(period) ? { date: period } : { period };
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
  const router = useRouter();
  const vehicleParam = searchParams.get("vehicle") || "";
  const [vehicle, setVehicle] = useState(vehicleParam);
  const [period, setPeriod] = useState<PeriodValue>("7d");
  const [search, setSearch] = useState("");

  const pp = periodParam(period);

  const { data: fleetData } = useSWR(
    buildUrl(pp, "fleet"),
    fetcher
  );

  const { data: summary } = useSWR(
    vehicle ? buildUrl({ ...pp, vehicle }, "summary") : null,
    fetcher
  );

  const { data: tripsData } = useSWR(
    vehicle ? buildUrl({ ...pp, vehicle }, "trips") : null,
    fetcher
  );

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

  function selectVehicle(v: string) {
    setVehicle(v);
    router.replace(`/analytics/vehicle?vehicle=${encodeURIComponent(v)}`, { scroll: false });
  }

  const filteredFleet = fleetData?.fleet?.filter((v: { vehicleNum: string }) =>
    !search || v.vehicleNum.includes(search)
  );

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
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <p className="text-sm text-[var(--color-content-secondary)]">
            {fleetData ? `${fleetData.totalVehicles} vehicles active` : "Loading fleet…"}
          </p>
          <PeriodSelector value={period} onChange={(p) => { setPeriod(p); setVehicle(""); }} presets={["7d", "30d"]} />
        </div>

        {/* Fleet table */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-8">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="font-semibold flex-1">Fleet Overview</h2>
            <input
              type="text"
              placeholder="Filter by number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-content-secondary)]">
                  <th className="text-left px-4 py-3 font-medium">Vehicle</th>
                  <th className="text-right px-4 py-3 font-medium">Trips</th>
                  <th className="text-right px-4 py-3 font-medium">Avg Speed</th>
                  <th className="text-right px-4 py-3 font-medium">Adherence</th>
                  <th className="text-left px-4 py-3 font-medium">Routes</th>
                </tr>
              </thead>
              <tbody>
                {!fleetData && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--color-content-secondary)]">Loading…</td></tr>
                )}
                {filteredFleet?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--color-content-secondary)]">No vehicles found.</td></tr>
                )}
                {filteredFleet?.map((v: { vehicleNum: string; trips: number; avgSpeed: number | null; avgAdherence: number | null; routes: string[] }) => (
                  <tr
                    key={v.vehicleNum}
                    onClick={() => selectVehicle(v.vehicleNum)}
                    className={`border-b border-[var(--color-border)] cursor-pointer transition-colors hover:bg-[var(--color-surface-sunken)] ${vehicle === v.vehicleNum ? "bg-[var(--color-surface-sunken)] font-semibold" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-mono text-[var(--color-accent)]">{v.vehicleNum}</td>
                    <td className="px-4 py-2.5 text-right">{v.trips}</td>
                    <td className="px-4 py-2.5 text-right">{v.avgSpeed != null ? `${v.avgSpeed} km/h` : "—"}</td>
                    <td className="px-4 py-2.5 text-right"><AdherenceBadge pct={v.avgAdherence} /></td>
                    <td className="px-4 py-2.5 text-[var(--color-content-secondary)] text-xs">{v.routes.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-vehicle detail */}
        {vehicle && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold">Bus {vehicle}</h2>
              <button
                onClick={() => { setVehicle(""); router.replace("/analytics/vehicle", { scroll: false }); }}
                className="text-xs text-[var(--color-content-secondary)] hover:text-[var(--color-content)] transition-colors"
              >
                ✕ clear
              </button>
            </div>

            {!summary && <div className="text-center py-10 text-[var(--color-content-secondary)]">Loading…</div>}

            {summary && (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide">Trips</div>
                    <div className="text-2xl font-bold mt-1">{summary.totalTrips ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide">Avg Speed</div>
                    <div className="text-2xl font-bold mt-1">{summary.avgSpeed != null ? `${summary.avgSpeed} km/h` : "—"}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide">Runtime Adherence</div>
                    <div className="text-2xl font-bold mt-1"><AdherenceBadge pct={summary.avgRuntimeAdherence} /></div>
                    <div className="text-xs text-[var(--color-content-muted)] mt-0.5">actual / scheduled</div>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="text-xs text-[var(--color-content-secondary)] uppercase tracking-wide">Routes</div>
                    <div className="text-sm font-semibold mt-1 flex flex-wrap gap-1">
                      {summary.routesOperated?.length > 0
                        ? summary.routesOperated.map((r: string) => (
                            <Link key={r} href={`/analytics/line?route=${encodeURIComponent(r)}`}
                              className="px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] border border-[var(--color-border)] text-xs hover:text-accent transition-colors">
                              {r}
                            </Link>
                          ))
                        : "—"}
                    </div>
                  </div>
                </div>

                {summary.dailyPerformance?.length > 0 && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
                    <h3 className="text-base font-semibold mb-4">Daily Performance</h3>
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

                {adherenceDist.length > 0 && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
                    <h3 className="text-base font-semibold mb-4">Runtime Adherence Distribution</h3>
                    <p className="text-xs text-[var(--color-content-secondary)] mb-3">100% = on schedule · &lt;100% = faster · &gt;100% = slower</p>
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

                {tripsData?.trips?.length > 0 && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <h3 className="text-base font-semibold mb-4">Recent Trips</h3>
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
                                <Link href={`/analytics/line?route=${encodeURIComponent(t.route)}`} className="font-semibold hover:text-accent transition-colors">{t.route}</Link>
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
          </>
        )}
      </div>
    </div>
  );
}
