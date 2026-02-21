"use client";

import { useState } from "react";
import Link from "next/link";

type ExportType = "positions" | "route-performance" | "segments";
type ExportFormat = "json" | "csv" | "geojson";

const EXPORT_TYPES: { value: ExportType; label: string; description: string; formats: ExportFormat[] }[] = [
  {
    value: "positions",
    label: "Bus Positions",
    description: "Raw GPS positions collected every 30 seconds from FIWARE. Requires a specific date (only today's data is available in the database; older data is archived).",
    formats: ["json", "csv"],
  },
  {
    value: "route-performance",
    label: "Route Performance",
    description: "Daily aggregated metrics per route: headway, EWT, adherence, speed, bunching, gapping. Supports date range filtering.",
    formats: ["json", "csv"],
  },
  {
    value: "segments",
    label: "Route Segments",
    description: "~200m road segments with geometry for each route pattern. Useful for GIS analysis and mapping.",
    formats: ["json", "geojson"],
  },
];

export default function DataPage() {
  const [type, setType] = useState<ExportType>("route-performance");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(
    new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [route, setRoute] = useState("");
  const [downloading, setDownloading] = useState(false);

  const selectedType = EXPORT_TYPES.find((t) => t.value === type)!;

  // Reset format when type changes
  function handleTypeChange(newType: ExportType) {
    setType(newType);
    const newTypeConfig = EXPORT_TYPES.find((t) => t.value === newType)!;
    if (!newTypeConfig.formats.includes(format)) {
      setFormat(newTypeConfig.formats[0]);
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
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/analytics" className="text-sm text-[var(--color-primary)] hover:underline">
          &larr; Analytics
        </Link>

        <h1 className="text-2xl font-bold mt-2 mb-2">Download Data</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          All transit analytics data is open and available for download. Use it for research,
          journalism, civic projects, or peer review. See the{" "}
          <Link href="/analytics/about" className="text-[var(--color-primary)] hover:underline">
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
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-secondary)]"
              }`}
            >
              <div className="font-semibold">{t.label}</div>
              <div className="text-sm text-[var(--color-text-secondary)] mt-1">
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
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-bg)] text-[var(--color-text-secondary)]"
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
                className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm"
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
                  className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm"
                />
              </div>
            </div>
          )}

          {/* Route filter */}
          {type !== "segments" && (
            <div>
              <label className="text-sm font-medium block mb-1">
                Route (optional)
              </label>
              <input
                type="text"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="e.g. 200, 502, M1"
                className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm w-40"
              />
            </div>
          )}
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {downloading ? "Downloading..." : "Download"}
        </button>

        {/* API hint */}
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-sm font-medium mb-2">API Access</div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-2">
            You can also access the data programmatically:
          </p>
          <code className="block text-xs bg-[var(--color-bg)] p-3 rounded-lg overflow-x-auto break-all">
            {`GET ${buildUrl()}`}
          </code>
        </div>
      </div>
    </div>
  );
}
