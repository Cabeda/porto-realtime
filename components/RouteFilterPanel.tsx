"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";
import type { RouteInfo } from "@/lib/types";

interface RouteFilterPanelProps {
  allRoutes: RouteInfo[];
  liveRoutes: Set<string>;
  selectedRoutes: string[];
  favoriteRoutes: string[];
  showRouteFilter: boolean;
  onTogglePanel: () => void;
  onToggleRoute: (route: string) => void;
  onClearFilters: () => void;
  onToggleFavorite: (route: string) => void;
}

export function RouteFilterPanel({
  allRoutes,
  liveRoutes,
  selectedRoutes,
  favoriteRoutes,
  showRouteFilter,
  onTogglePanel,
  onToggleRoute,
  onClearFilters,
  onToggleFavorite,
}: RouteFilterPanelProps) {
  const t = useTranslations();

  if (allRoutes.length === 0) return null;

  const busRoutes = allRoutes.filter((r) => r.mode === "BUS");
  const metroRoutes = allRoutes.filter((r) => r.mode === "SUBWAY");

  const renderRouteGrid = (routes: RouteInfo[]) => (
    <div className="grid grid-cols-3 gap-2">
      {routes.map((route) => {
        const isLive = liveRoutes.has(route.shortName);
        return (
          <div key={route.gtfsId} className="relative flex flex-col items-center">
            <button
              onClick={() => onToggleRoute(route.shortName)}
              className={`w-full py-2 px-3 rounded-md text-sm font-semibold transition-all ${
                selectedRoutes.includes(route.shortName)
                  ? "bg-blue-600 dark:bg-blue-500 text-white shadow-md"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
              title={route.longName}
            >
              <span className="flex items-center justify-center gap-1">
                {route.shortName}
                {isLive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" title={t.map.live} />
                )}
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(route.shortName);
              }}
              className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs leading-none"
              title={favoriteRoutes.includes(route.shortName) ? t.stations.removeFromFavorites : t.stations.addToFavorites}
            >
              {favoriteRoutes.includes(route.shortName) ? (
                <span className="text-yellow-500">&#9733;</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500 hover:text-yellow-500">&#9734;</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <button
        onClick={onTogglePanel}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg transition-colors"
      >
        <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm flex items-center gap-2">
          🚌 {t.map.filterRoutes}
          {selectedRoutes.length > 0 && (
            <span className="text-xs bg-blue-600 dark:bg-blue-500 text-white px-2 py-0.5 rounded-full">
              {selectedRoutes.length}
            </span>
          )}
        </span>
        <span className="text-gray-500 dark:text-gray-400 text-sm">
          {showRouteFilter ? '▲' : '▼'}
        </span>
      </button>

      {showRouteFilter && (
        <div className="p-3 pt-0 border-t border-gray-200 dark:border-gray-700 max-h-[calc(100vh-12rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-2 pt-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {selectedRoutes.length > 0
                ? t.map.routesSelected(selectedRoutes.length)
                : t.map.allRoutes}
            </div>
            {selectedRoutes.length > 0 && (
              <button
                onClick={onClearFilters}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
              >
                {t.map.clearFilters}
              </button>
            )}
          </div>

          {/* Bus routes */}
          {busRoutes.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                🚌 {t.map.busLines}
                <span className="text-gray-400 dark:text-gray-500 font-normal normal-case">({busRoutes.length})</span>
              </div>
              {renderRouteGrid(busRoutes)}
            </div>
          )}

          {/* Metro routes */}
          {metroRoutes.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                🚇 {t.map.metroLines}
                <span className="text-gray-400 dark:text-gray-500 font-normal normal-case">({metroRoutes.length})</span>
              </div>
              {renderRouteGrid(metroRoutes)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
