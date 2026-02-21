"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslations } from "@/lib/hooks/useTranslations";
import type { ProposalGeoJSON } from "@/lib/types";

export interface RouteStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isNew?: boolean; // user-added stop
}

interface RouteEditorProps {
  /** Route polyline coordinates [lon, lat][] — read-only path display */
  routeCoordinates: [number, number][];
  /** Initial stops on the route */
  initialStops: RouteStop[];
  /** Called whenever stops change — parent uses this to build geometry */
  onGeometryChange: (geometry: ProposalGeoJSON) => void;
  height?: string;
}

let stopIdCounter = 0;
function nextStopId() {
  return `new-stop-${++stopIdCounter}`;
}

/**
 * Interactive Leaflet map for editing route stops.
 * - Shows route polyline (read-only)
 * - Draggable stop markers
 * - Click map to add new stop
 * - Click stop marker to remove it
 * - Undo + reset controls
 */
export function RouteEditor({
  routeCoordinates,
  initialStops,
  onGeometryChange,
  height = "350px",
}: RouteEditorProps) {
  const t = useTranslations();
  const tp = t.proposals;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylineRef = useRef<L.Polyline | null>(null);

  const [stops, setStops] = useState<RouteStop[]>(initialStops);
  const [history, setHistory] = useState<RouteStop[][]>([]);

  // Build GeoJSON from current stops + route polyline
  const buildGeometry = useCallback(
    (currentStops: RouteStop[]): ProposalGeoJSON => {
      const features: ProposalGeoJSON["features"] = [];

      // Route polyline as a LineString feature
      if (routeCoordinates.length >= 2) {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: routeCoordinates,
          },
          properties: { role: "route" },
        });
      }

      // Each stop as a Point feature
      for (const stop of currentStops) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [stop.lon, stop.lat],
          },
          properties: {
            role: "stop",
            name: stop.name,
            isNew: stop.isNew || false,
            originalId: stop.id,
          },
        });
      }

      return { type: "FeatureCollection", features };
    },
    [routeCoordinates]
  );

  // Push current state to history before making a change
  const pushHistory = useCallback(() => {
    setHistory((prev) => [...prev.slice(-20), stops]);
  }, [stops]);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStops(last);
      onGeometryChange(buildGeometry(last));
      return prev.slice(0, -1);
    });
  }, [buildGeometry, onGeometryChange]);

  const handleReset = useCallback(() => {
    pushHistory();
    setStops(initialStops);
    onGeometryChange(buildGeometry(initialStops));
  }, [initialStops, pushHistory, buildGeometry, onGeometryChange]);

  // Sync geometry to parent whenever stops change
  useEffect(() => {
    onGeometryChange(buildGeometry(stops));
  }, [stops, buildGeometry, onGeometryChange]);

  // Reset stops when initialStops change (new line selected)
  useEffect(() => {
    setStops(initialStops);
    setHistory([]);
  }, [initialStops]);

  // Initialize and update the Leaflet map
  useEffect(() => {
    if (!containerRef.current) return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;

      // Clean up previous map
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current.clear();
        polylineRef.current = null;
      }

      const map = L.map(containerRef.current!, {
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Draw route polyline (read-only)
      if (routeCoordinates.length >= 2) {
        const latLngs = routeCoordinates.map(
          ([lon, lat]) => [lat, lon] as [number, number]
        );
        polylineRef.current = L.polyline(latLngs, {
          color: "#3b82f6",
          weight: 4,
          opacity: 0.6,
          interactive: false,
        }).addTo(map);
      }

      // Helper: create a stop marker
      const createMarker = (stop: RouteStop) => {
        const color = stop.isNew ? "#10b981" : "#3b82f6";
        const icon = L.divIcon({
          className: "route-editor-stop",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:grab;"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const marker = L.marker([stop.lat, stop.lon], {
          icon,
          draggable: true,
          title: stop.name,
        }).addTo(map);

        // Tooltip
        marker.bindTooltip(stop.name, {
          direction: "top",
          offset: [0, -10],
          className: "route-editor-tooltip",
        });

        // Drag end — update stop position
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          pushHistory();
          setStops((prev) =>
            prev.map((s) =>
              s.id === stop.id ? { ...s, lat: pos.lat, lon: pos.lng } : s
            )
          );
        });

        // Click — remove stop
        marker.on("click", () => {
          pushHistory();
          setStops((prev) => prev.filter((s) => s.id !== stop.id));
          marker.remove();
          markersRef.current.delete(stop.id);
        });

        markersRef.current.set(stop.id, marker);
      };

      // Add initial stop markers
      for (const stop of stops) {
        createMarker(stop);
      }

      // Click map to add new stop
      map.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const newStop: RouteStop = {
          id: nextStopId(),
          name: tp.addedStop,
          lat,
          lon: lng,
          isNew: true,
        };
        pushHistory();
        setStops((prev) => [...prev, newStop]);
        createMarker(newStop);
      });

      // Fit bounds
      const allPoints: [number, number][] = [
        ...routeCoordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
        ...stops.map((s) => [s.lat, s.lon] as [number, number]),
      ];
      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
        }
      }
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current.clear();
        polylineRef.current = null;
      }
    };
    // We intentionally only re-init the map when routeCoordinates or initialStops change,
    // not on every stops change (markers handle their own updates via events)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCoordinates, initialStops]);

  return (
    <div>
      <label className="block text-sm font-medium text-content-secondary mb-1">
        {tp.editStops}
      </label>
      <p className="text-xs text-content-muted mb-2">{tp.editStopsHelp}</p>

      {/* Map container */}
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden border border-border"
        style={{ height }}
      />

      {/* Controls bar */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-content-muted">
          {tp.stopCount(stops.length)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="text-xs px-2 py-1 rounded bg-surface-sunken text-content-muted hover:text-content transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {tp.undoLastChange}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs px-2 py-1 rounded bg-surface-sunken text-content-muted hover:text-content transition-colors"
          >
            {tp.resetStops}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-content-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 border border-white shadow-sm" />
          {tp.existingStop}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white shadow-sm" />
          {tp.addedStop}
        </span>
      </div>
    </div>
  );
}
