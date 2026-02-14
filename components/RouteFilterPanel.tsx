"use client";

import { FeedbackSummary } from "@/components/FeedbackSummary";
import type { FeedbackSummaryData } from "@/lib/types";

interface RouteFilterPanelProps {
  availableRoutes: string[];
  selectedRoutes: string[];
  favoriteRoutes: string[];
  showRouteFilter: boolean;
  onTogglePanel: () => void;
  onToggleRoute: (route: string) => void;
  onClearFilters: () => void;
  onToggleFavorite: (route: string) => void;
  feedbackSummaries?: Record<string, FeedbackSummaryData>;
  onRateLine?: (route: string) => void;
}

export function RouteFilterPanel({
  availableRoutes,
  selectedRoutes,
  favoriteRoutes,
  showRouteFilter,
  onTogglePanel,
  onToggleRoute,
  onClearFilters,
  onToggleFavorite,
  feedbackSummaries,
  onRateLine,
}: RouteFilterPanelProps) {
  if (availableRoutes.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <button
        onClick={onTogglePanel}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg transition-colors"
      >
        <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm flex items-center gap-2">
          🚌 Filtrar Linhas
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
                ? `${selectedRoutes.length} linha${selectedRoutes.length > 1 ? 's' : ''} selecionada${selectedRoutes.length > 1 ? 's' : ''}`
                : 'Todas as linhas'}
            </div>
            {selectedRoutes.length > 0 && (
              <button
                onClick={onClearFilters}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {availableRoutes.map(route => (
              <div key={route} className="relative flex flex-col items-center">
                <button
                  onClick={() => onToggleRoute(route)}
                  className={`w-full py-2 px-3 rounded-md text-sm font-semibold transition-all ${
                    selectedRoutes.includes(route)
                      ? "bg-blue-600 dark:bg-blue-500 text-white shadow-md"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {route}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(route);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs leading-none"
                  title={favoriteRoutes.includes(route) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                >
                  {favoriteRoutes.includes(route) ? (
                    <span className="text-yellow-500">&#9733;</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 hover:text-yellow-500">&#9734;</span>
                  )}
                </button>
                {feedbackSummaries && (
                  <div className="mt-1">
                    <FeedbackSummary
                      summary={feedbackSummaries[route]}
                      compact
                      onClick={onRateLine ? () => onRateLine(route) : undefined}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
