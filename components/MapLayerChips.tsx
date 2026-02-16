"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";

interface LayerChip {
  id: string;
  icon: string;
  label: string;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

interface MapLayerChipsProps {
  showStops: boolean;
  onToggleStops: () => void;
  stopsDisabled: boolean;
  showRoutes: boolean;
  onToggleRoutes: () => void;
  routesDisabled: boolean;
  showBikeParks: boolean;
  onToggleBikeParks: () => void;
  bikeParksDisabled: boolean;
  showBikeLanes: boolean;
  onToggleBikeLanes: () => void;
  bikeLanesDisabled: boolean;
  selectedRoutesCount: number;
  onOpenRouteFilter: () => void;
}

export function MapLayerChips({
  showStops,
  onToggleStops,
  stopsDisabled,
  showRoutes,
  onToggleRoutes,
  routesDisabled,
  showBikeParks,
  onToggleBikeParks,
  bikeParksDisabled,
  showBikeLanes,
  onToggleBikeLanes,
  bikeLanesDisabled,
  selectedRoutesCount,
  onOpenRouteFilter,
}: MapLayerChipsProps) {
  const t = useTranslations();

  const layers: LayerChip[] = [
    {
      id: "stops",
      icon: "🚏",
      label: t.map.stops,
      active: showStops,
      disabled: stopsDisabled,
      onToggle: onToggleStops,
    },
    {
      id: "routes",
      icon: "🛣️",
      label: t.map.paths,
      active: showRoutes,
      disabled: routesDisabled,
      onToggle: onToggleRoutes,
    },
    {
      id: "bikeParks",
      icon: "🚲",
      label: "Parques",
      active: showBikeParks,
      disabled: bikeParksDisabled,
      onToggle: onToggleBikeParks,
    },
    {
      id: "bikeLanes",
      icon: "🛤️",
      label: "Ciclovias",
      active: showBikeLanes,
      disabled: bikeLanesDisabled,
      onToggle: onToggleBikeLanes,
    },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {/* Route filter chip */}
      <button
        onClick={onOpenRouteFilter}
        className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium shadow-md border transition-all ${
          selectedRoutesCount > 0
            ? "bg-accent text-content-inverse border-accent"
            : "bg-surface-raised text-content-secondary border-border hover:bg-surface-sunken"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span className="hidden sm:inline">{t.map.filterRoutes}</span>
        {selectedRoutesCount > 0 && (
          <span className="bg-white/30 rounded-full px-1 min-w-[1rem] text-center text-[10px]">
            {selectedRoutesCount}
          </span>
        )}
      </button>

      {/* Layer toggle chips */}
      {layers.map((layer) => (
        <button
          key={layer.id}
          onClick={layer.onToggle}
          disabled={layer.disabled}
          className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium shadow-md border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            layer.active
              ? "bg-accent text-content-inverse border-accent"
              : "bg-surface-raised text-content-secondary border-border hover:bg-surface-sunken"
          }`}
          title={layer.label}
        >
          <span className="text-sm leading-none">{layer.icon}</span>
          <span className="hidden sm:inline">{layer.label}</span>
        </button>
      ))}
    </div>
  );
}
