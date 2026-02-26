"use client";

import { useRef, useState } from "react";
import { useTranslations } from "@/lib/hooks/useTranslations";
import type { ProposalGeoJSON } from "@/lib/types";

interface GeoFileUploadProps {
  onParsed: (geo: ProposalGeoJSON) => void;
  onClear: () => void;
  hasGeometry: boolean;
}

const ACCEPTED_EXTENSIONS = [".geojson", ".json", ".gpx", ".kml"];
const MAX_FILE_SIZE = 500 * 1024; // 500KB

function parseGPX(text: string): ProposalGeoJSON | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return null;

  const features: ProposalGeoJSON["features"] = [];

  // Parse tracks
  const tracks = doc.querySelectorAll("trk");
  for (const trk of tracks) {
    const name = trk.querySelector("name")?.textContent || "";
    const segments = trk.querySelectorAll("trkseg");
    for (const seg of segments) {
      const points = seg.querySelectorAll("trkpt");
      const coords: number[][] = [];
      for (const pt of points) {
        const lat = parseFloat(pt.getAttribute("lat") || "0");
        const lon = parseFloat(pt.getAttribute("lon") || "0");
        if (lat && lon) coords.push([lon, lat]);
      }
      if (coords.length >= 2) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { name },
        });
      }
    }
  }

  // Parse routes
  const routes = doc.querySelectorAll("rte");
  for (const rte of routes) {
    const name = rte.querySelector("name")?.textContent || "";
    const points = rte.querySelectorAll("rtept");
    const coords: number[][] = [];
    for (const pt of points) {
      const lat = parseFloat(pt.getAttribute("lat") || "0");
      const lon = parseFloat(pt.getAttribute("lon") || "0");
      if (lat && lon) coords.push([lon, lat]);
    }
    if (coords.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { name },
      });
    }
  }

  // Parse waypoints
  const waypoints = doc.querySelectorAll("wpt");
  for (const wpt of waypoints) {
    const lat = parseFloat(wpt.getAttribute("lat") || "0");
    const lon = parseFloat(wpt.getAttribute("lon") || "0");
    const name = wpt.querySelector("name")?.textContent || "";
    if (lat && lon) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { name },
      });
    }
  }

  return features.length > 0 ? { type: "FeatureCollection", features } : null;
}

function parseKML(text: string): ProposalGeoJSON | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return null;

  const features: ProposalGeoJSON["features"] = [];

  const placemarks = doc.querySelectorAll("Placemark");
  for (const pm of placemarks) {
    const name = pm.querySelector("name")?.textContent || "";

    // LineString
    const lineCoords = pm.querySelector("LineString coordinates");
    if (lineCoords?.textContent) {
      const coords = lineCoords.textContent
        .trim()
        .split(/\s+/)
        .map((c) => {
          const [lon, lat] = c.split(",").map(Number);
          return [lon, lat] as number[];
        })
        .filter((c) => !isNaN(c[0]!) && !isNaN(c[1]!));
      if (coords.length >= 2) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { name },
        });
        continue;
      }
    }

    // Point
    const pointCoords = pm.querySelector("Point coordinates");
    if (pointCoords?.textContent) {
      const [lon, lat] = pointCoords.textContent.trim().split(",").map(Number) as [number, number];
      if (!isNaN(lon) && !isNaN(lat)) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] as [number, number] },
          properties: { name },
        });
        continue;
      }
    }

    // Polygon
    const polyCoords = pm.querySelector("Polygon outerBoundaryIs LinearRing coordinates");
    if (polyCoords?.textContent) {
      const coords = polyCoords.textContent
        .trim()
        .split(/\s+/)
        .map((c) => {
          const [lon, lat] = c.split(",").map(Number);
          return [lon, lat] as number[];
        })
        .filter((c) => !isNaN(c[0]!) && !isNaN(c[1]!));
      if (coords.length >= 3) {
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [coords] },
          properties: { name },
        });
      }
    }
  }

  return features.length > 0 ? { type: "FeatureCollection", features } : null;
}

function parseGeoJSON(text: string): ProposalGeoJSON | null {
  try {
    const parsed = JSON.parse(text);

    // Already a FeatureCollection
    if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
      return parsed as ProposalGeoJSON;
    }

    // Single Feature — wrap it
    if (parsed.type === "Feature" && parsed.geometry) {
      return {
        type: "FeatureCollection",
        features: [parsed],
      };
    }

    // Raw geometry — wrap it
    if (parsed.type && parsed.coordinates) {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: parsed, properties: {} }],
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function GeoFileUpload({ onParsed, onClear, hasGeometry }: GeoFileUploadProps) {
  const t = useTranslations();
  const tp = t.proposals;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);

    if (file.size > MAX_FILE_SIZE) {
      setError(tp.fileTooLarge);
      return;
    }

    const ext = file.name.toLowerCase().split(".").pop();
    if (!ext || !ACCEPTED_EXTENSIONS.some((e) => e.endsWith(ext))) {
      setError(tp.unsupportedFormat);
      return;
    }

    const text = await file.text();
    let result: ProposalGeoJSON | null = null;

    if (ext === "gpx") {
      result = parseGPX(text);
    } else if (ext === "kml") {
      result = parseKML(text);
    } else {
      result = parseGeoJSON(text);
    }

    if (!result || result.features.length === 0) {
      setError(tp.parseError);
      return;
    }

    setFileName(file.name);
    onParsed(result);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClear = () => {
    setFileName(null);
    setError(null);
    onClear();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-content-secondary mb-1">
        {tp.geoFileLabel}
      </label>

      {hasGeometry && fileName ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-surface text-sm">
          <svg
            className="w-4 h-4 text-green-500 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-content truncate flex-1">{fileName}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-content-muted hover:text-red-500 transition-colors flex-shrink-0"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-border rounded-lg bg-surface text-content-muted hover:border-accent hover:text-accent transition-colors text-sm"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          {tp.uploadFile}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".geojson,.json,.gpx,.kml"
        onChange={handleChange}
        className="hidden"
      />

      <p className="text-xs text-content-muted mt-1">{tp.geoFileHelp}</p>

      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}
