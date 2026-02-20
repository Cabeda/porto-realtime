"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useTranslations } from "@/lib/hooks/useTranslations";
import type {
  ProposalType,
  ProposalGeoJSON,
  RoutePatternsResponse,
  BikeLanesResponse,
  RouteInfo,
  RoutesResponse,
} from "@/lib/types";

interface EntityPickerProps {
  type: ProposalType;
  onSelect: (targetId: string, geometry: ProposalGeoJSON | null) => void;
  selectedTargetId: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function EntityPicker({ type, onSelect, selectedTargetId }: EntityPickerProps) {
  const t = useTranslations();
  const tp = t.proposals;
  const [search, setSearch] = useState("");

  // Fetch routes for LINE type
  const { data: routesData } = useSWR<RoutesResponse>(
    type === "LINE" ? "/api/routes" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // Fetch route shapes for LINE geometry
  const { data: shapesData } = useSWR<RoutePatternsResponse>(
    type === "LINE" ? "/api/route-shapes" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // Fetch bike lanes for BIKE_LANE type
  const { data: lanesData } = useSWR<BikeLanesResponse>(
    type === "BIKE_LANE" ? "/api/bike-lanes" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // Build items list based on type
  const items = useMemo(() => {
    if (type === "LINE" && routesData?.routes) {
      return routesData.routes.map((r: RouteInfo) => ({
        id: r.shortName,
        label: `${r.shortName} — ${r.longName}`,
        icon: r.mode === "SUBWAY" ? "🚇" : "🚌",
      }));
    }
    if (type === "BIKE_LANE" && lanesData?.lanes) {
      return lanesData.lanes.map((l) => ({
        id: l.id,
        label: `${l.name} (${Math.round(l.length)}m)`,
        icon: "🛤️",
      }));
    }
    // STOP type — no entity picker, just free text
    return [];
  }, [type, routesData, lanesData]);

  // Filter items by search
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, search]);

  // Build GeoJSON from selected entity
  const getGeometry = (entityId: string): ProposalGeoJSON | null => {
    if (type === "LINE" && shapesData?.patterns) {
      const patterns = shapesData.patterns.filter(
        (p) => p.routeShortName === entityId
      );
      if (patterns.length === 0) return null;
      const features: ProposalGeoJSON["features"] = patterns.map((p) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: p.geometry.coordinates,
        },
        properties: {
          route: p.routeShortName,
          headsign: p.headsign,
          direction: p.directionId,
        },
      }));
      return { type: "FeatureCollection", features };
    }

    if (type === "BIKE_LANE" && lanesData?.lanes) {
      const lane = lanesData.lanes.find((l) => l.id === entityId);
      if (!lane) return null;
      const features: ProposalGeoJSON["features"] = lane.segments.map(
        (seg, i) => ({
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: seg,
          },
          properties: { name: lane.name, segment: i },
        })
      );
      return { type: "FeatureCollection", features };
    }

    return null;
  };

  const handleSelect = (entityId: string) => {
    if (entityId === selectedTargetId) {
      // Deselect
      onSelect("", null);
    } else {
      const geo = getGeometry(entityId);
      onSelect(entityId, geo);
    }
  };

  // STOP type uses free text input, not a picker
  if (type === "STOP") return null;

  if (items.length === 0) {
    return (
      <div className="text-xs text-content-muted py-2">{tp.loadingEntities}</div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-content-secondary mb-1">
        {type === "LINE" ? tp.selectLine : tp.selectBikeLane}
      </label>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={tp.searchEntities}
        className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm mb-2"
      />

      {/* Scrollable list */}
      <div className="max-h-48 overflow-y-auto border border-border rounded-lg bg-surface divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs text-content-muted text-center">
            {t.search.noResults}
          </div>
        ) : (
          filtered.slice(0, 50).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                selectedTargetId === item.id
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-content hover:bg-surface-sunken"
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {selectedTargetId === item.id && (
                <svg className="w-4 h-4 ml-auto flex-shrink-0 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))
        )}
      </div>

      {filtered.length > 50 && (
        <p className="text-xs text-content-muted mt-1">
          {tp.showingFirst50}
        </p>
      )}
    </div>
  );
}
