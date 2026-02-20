"use client";

import { useEffect, useRef } from "react";
import type { ProposalGeoJSON } from "@/lib/types";

interface ProposalMapPreviewProps {
  geometry: ProposalGeoJSON;
  height?: string;
  className?: string;
}

/**
 * Lightweight Leaflet map that renders GeoJSON geometry for proposal previews.
 * Used in both ProposalForm (preview) and ProposalCard (display).
 */
export function ProposalMapPreview({
  geometry,
  height = "200px",
  className = "",
}: ProposalMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !geometry?.features?.length) return;

    // Dynamic import to avoid SSR issues
    const initMap = async () => {
      const L = (await import("leaflet")).default;

      // Clean up previous map
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current!, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      const geoLayer = L.geoJSON(geometry as GeoJSON.FeatureCollection, {
        style: {
          color: "#3b82f6",
          weight: 4,
          opacity: 0.8,
        },
        pointToLayer: (_feature, latlng) => {
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: "#3b82f6",
            color: "#fff",
            weight: 2,
            fillOpacity: 0.8,
          });
        },
      }).addTo(map);

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
      }

      mapRef.current = map;
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [geometry]);

  if (!geometry?.features?.length) return null;

  return (
    <div
      ref={containerRef}
      className={`rounded-lg overflow-hidden border border-border ${className}`}
      style={{ height }}
    />
  );
}
