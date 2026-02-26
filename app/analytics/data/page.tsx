"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { DesktopNav } from "@/components/DesktopNav";

type ExportType = "positions" | "route-performance" | "segments";
type ExportFormat = "json" | "csv" | "geojson" | "parquet";

const EXPORT_TYPES: {
  value: ExportType;
  label: string;
  description: string;
  formats: ExportFormat[];
}[] = [
  {
    value: "positions",
    label: "Bus Positions",
    description:
      "Raw GPS positions collected every 30 seconds from FIWARE. Today's data from the database (JSON/CSV); older days archived as Parquet on R2.",
    formats: ["json", "csv", "parquet"],
  },
  {
    value: "route-performance",
    label: "Route Performance",
    description:
      "Daily aggregated metrics per route: headway, EWT, adherence, speed, bunching, gapping. Supports date range filtering.",
    formats: ["json", "csv"],
  },
  {
    value: "segments",
    label: "Route Segments",
    description:
      "~200m road segments with geometry for each route pattern. Useful for GIS analysis and mapping.",
    formats: ["json", "geojson"],
  },
];

interface ArchivesResponse {
  dates: string[];
  r2Configured: boolean;
}

const archivesFetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DataPage() {
  const [type, setType] = useState<ExportType>("route-performance");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [route, setRoute] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Fetch available R2 archive dates
  const { data: archives } = useSWR<ArchivesResponse>(
    "/api/analytics/export?type=archives",
    archivesFetcher,
    { revalidateOnFocus: false }
  );

  const selectedType = EXPORT_TYPES.find((t) => t.value === type)!;

  // Reset format when type changes
  function handleTypeChange(newType: ExportType) {
    setType(newType);
    const newTypeConfig = EXPORT_TYPES.find((t) => t.value === newType)!;
    if (!newTypeConfig.formats.includes(format)) {
      setFormat(newTypeConfig.formats[0]!);
    }
  }

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("format", format);

    if (type === "positions") {
      params.set("date", date);
    } else if (type === "route-performance") {
      params.set("from", from);
      params.set("to", to);
    }

    if (route) params.set("route", route);

    return `/api/analytics/export?${params.toString()}`;
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = buildUrl();

      // Parquet downloads redirect to R2 presigned URL
      if (format === "parquet") {
        window.open(url, "_blank");
        return;
      }

      const res = await fetch(url);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Download failed" }));
        alert(err.error || "Download failed");
        return;
      }

      const blob = await res.blob();
      const ext = format === "geojson" ? "geojson" : format;
      const filename = `portomove-${type}-${date || from}.${ext}`;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/analytics" className="text-sm text-accent hover:text-accent-hover">
              &larr;
            </Link>
            <h1 className="text-xl font-bold text-content">Download Data</h1>
          </div>
          <DesktopNav />
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-sm text-[var(--color-content-secondary)] mb-6">
          All transit analytics data is open and available for download. Use it for research,
          journalism, civic projects, or peer review. See the{" "}
          <Link href="/analytics/about" className="text-[var(--color-accent)] hover:underline">
            methodology page
          </Link>{" "}
          for details on how metrics are computed.
        </p>

        {/* Data type selector */}
        <div className="space-y-3 mb-6">
          {EXPORT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => handleTypeChange(t.value)}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${
                type === t.value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-content-secondary)]"
              }`}
            >
              <div className="font-semibold">{t.label}</div>
              <div className="text-sm text-[var(--color-content-secondary)] mt-1">
                {t.description}
              </div>
            </button>
          ))}
        </div>

        {/* Options */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6 space-y-4">
          {/* Format */}
          <div>
            <label className="text-sm font-medium block mb-1">Format</label>
            <div className="flex gap-2">
              {selectedType.formats.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    format === f
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface-sunken)] text-[var(--color-content-secondary)]"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Date fields */}
          {type === "positions" && (
            <div>
              <label className="text-sm font-medium block mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm"
              />
            </div>
          )}

          {type === "route-performance" && (
            <div className="flex gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm"
                />
              </div>
            </div>
          )}

          {/* Route filter */}
          {type !== "segments" && (
            <div>
              <label className="text-sm font-medium block mb-1">Route (optional)</label>
              <input
                type="text"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="e.g. 200, 502, M1"
                className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm w-40"
              />
            </div>
          )}
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full py-3 rounded-xl bg-[var(--color-accent)] text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {downloading ? "Downloading..." : "Download"}
        </button>

        {/* R2 Archives */}
        {archives && archives.dates && archives.dates.length > 0 && (
          <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="text-sm font-medium mb-1">Position Archives</div>
            <p className="text-sm text-[var(--color-content-secondary)] mb-3">
              Historical bus positions archived as Parquet files. Zero egress cost via Cloudflare
              R2.
            </p>
            <div className="flex flex-wrap gap-2">
              {archives.dates.map((d) => (
                <a
                  key={d}
                  href={`/api/analytics/export?type=positions&date=${d}&format=parquet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-surface-sunken)] text-[var(--color-content-secondary)] hover:text-[var(--color-accent)] transition-colors"
                >
                  {d}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* API hint */}
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-sm font-medium mb-2">API Access</div>
          <p className="text-sm text-[var(--color-content-secondary)] mb-2">
            You can also access the data programmatically:
          </p>
          <code className="block text-xs bg-[var(--color-surface-sunken)] p-3 rounded-lg overflow-x-auto break-all">
            {`GET ${buildUrl()}`}
          </code>
        </div>
      </div>
    </div>
  );
}
