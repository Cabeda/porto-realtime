"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import useSWR from "swr";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { logger } from "@/lib/logger";
import { StationsSkeleton } from "@/components/LoadingSkeletons";
import { SettingsModal } from "@/components/SettingsModal";
import { DesktopNav } from "@/components/DesktopNav";
import { GlobalSearch } from "@/components/GlobalSearch";
import { FeedbackSummary } from "@/components/FeedbackSummary";
import { stationsFetcher } from "@/lib/fetchers";
import { useFeedbackSummaries } from "@/lib/hooks/useFeedback";
import type { Stop, StopsResponse, FeedbackSummaryData } from "@/lib/types";

interface StopWithDistance extends Stop {
  distance: number;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function StationCard({
  station,
  isFavorite,
  onToggleFavorite,
  distance,
  feedbackSummary,
}: {
  station: Stop;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  distance?: number;
  feedbackSummary?: FeedbackSummaryData;
}) {
  const t = useTranslations();
  return (
    <div className="bg-surface-raised rounded-xl shadow-md hover:shadow-lg transition-all p-4 flex items-center gap-4">
      <Link href={`/station?gtfsId=${station.gtfsId}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-content truncate">{station.name}</h3>
          {feedbackSummary && feedbackSummary.count > 0 && (
            <FeedbackSummary summary={feedbackSummary} compact />
          )}
        </div>
        {station.code && <p className="text-xs text-content-muted mt-0.5">{station.code}</p>}
        {distance !== undefined && (
          <p className="text-sm text-content-muted mt-0.5">📍 {formatDistance(distance)}</p>
        )}
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={`/?station=${encodeURIComponent(station.gtfsId)}`}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm"
          title={t.stations.viewOnMap}
          aria-label={t.stations.viewOnMap}
        >
          🗺️
        </Link>
        <button
          onClick={onToggleFavorite}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors text-lg ${
            isFavorite
              ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-500"
              : "bg-surface-sunken text-content-muted hover:text-yellow-500"
          }`}
          aria-label={isFavorite ? t.stations.removeFromFavorites : t.stations.addToFavorites}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}

export default function StationsPage() {
  const t = useTranslations();
  const [showSettings, setShowSettings] = useState(false);
  const [favoriteStationIds, setFavoriteStationIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("favoriteStations");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => logger.warn("Location denied")
      );
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("favoriteStations", JSON.stringify(favoriteStationIds));
  }, [favoriteStationIds]);

  const { data: stations, error } = useSWR<StopsResponse>("/api/stations", stationsFetcher, {
    dedupingInterval: 7 * 24 * 60 * 60 * 1000,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const toggleFavorite = (gtfsId: string) => {
    setFavoriteStationIds((prev) =>
      prev.includes(gtfsId) ? prev.filter((id) => id !== gtfsId) : [...prev, gtfsId]
    );
  };

  const isFavorite = (gtfsId: string) => favoriteStationIds.includes(gtfsId);

  const stops = stations?.data?.stops ?? [];
  const closestStations: StopWithDistance[] = location
    ? stops
        .map((s) => ({
          ...s,
          distance: haversine(location.latitude, location.longitude, s.lat, s.lon),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5)
    : [];
  const favoriteStations = stops.filter((s) => favoriteStationIds.includes(s.gtfsId));
  const filteredStations =
    filter.length >= 2
      ? stops.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 30)
      : [];

  // Collect visible station IDs for batch feedback summary
  const visibleStationIds = useMemo(() => {
    const ids = new Set<string>();
    closestStations.forEach((s) => ids.add(s.gtfsId));
    favoriteStations.forEach((s) => ids.add(s.gtfsId));
    filteredStations.forEach((s) => ids.add(s.gtfsId));
    return Array.from(ids);
  }, [closestStations, favoriteStations, filteredStations]);

  const { data: stopSummaries } = useFeedbackSummaries("STOP", visibleStationIds);

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-sunken">
        <div className="text-center">
          <span className="text-4xl">⚠️</span>
          <p className="mt-2 text-red-600 dark:text-red-400">{t.stations.errorLoading}</p>
        </div>
      </div>
    );
  if (!stations) return <StationsSkeleton />;

  return (
    <div className="min-h-screen bg-surface-sunken transition-colors">
      {/* Header */}
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-content flex-shrink-0">{t.stations.stopsLabel}</h1>
          <DesktopNav />
          <button
            onClick={() => setShowSettings(true)}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-surface-sunken hover:bg-border text-content-secondary transition-colors"
            title={t.nav.settings}
            aria-label={t.nav.settings}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-20 sm:pb-6 space-y-8">
        {/* Global Search */}
        <GlobalSearch />

        {/* Station filter */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.stations.filterPlaceholder}
            className="w-full pl-10 pr-4 py-3 bg-surface-raised border border-border rounded-xl text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent shadow-sm"
          />
        </div>

        {/* Search results */}
        {filter.length >= 2 && (
          <section>
            <h2 className="text-sm font-semibold text-content-muted uppercase tracking-wide mb-3">
              {t.stations.results} ({filteredStations.length}
              {filteredStations.length === 30 ? "+" : ""})
            </h2>
            {filteredStations.length > 0 ? (
              <div className="space-y-2">
                {filteredStations.map((s) => (
                  <StationCard
                    key={s.id}
                    station={s}
                    isFavorite={isFavorite(s.gtfsId)}
                    onToggleFavorite={() => toggleFavorite(s.gtfsId)}
                    feedbackSummary={stopSummaries?.[s.gtfsId]}
                  />
                ))}
              </div>
            ) : (
              <p className="text-content-muted text-sm italic">{t.stations.noStopsFound}</p>
            )}
          </section>
        )}

        {/* Nearby */}
        {filter.length < 2 && closestStations.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-content-muted uppercase tracking-wide mb-3">
              📍 {t.stations.nearest}
            </h2>
            <div className="space-y-2">
              {closestStations.map((s) => (
                <StationCard
                  key={`near-${s.id}`}
                  station={s}
                  isFavorite={isFavorite(s.gtfsId)}
                  onToggleFavorite={() => toggleFavorite(s.gtfsId)}
                  distance={s.distance}
                  feedbackSummary={stopSummaries?.[s.gtfsId]}
                />
              ))}
            </div>
          </section>
        )}

        {/* Favorites */}
        {filter.length < 2 && (
          <section>
            <h2 className="text-sm font-semibold text-content-muted uppercase tracking-wide mb-3">
              ⭐ {t.stations.favorites}
            </h2>
            {favoriteStations.length > 0 ? (
              <div className="space-y-2">
                {favoriteStations.map((s) => (
                  <StationCard
                    key={`fav-${s.gtfsId}`}
                    station={s}
                    isFavorite
                    onToggleFavorite={() => toggleFavorite(s.gtfsId)}
                    feedbackSummary={stopSummaries?.[s.gtfsId]}
                  />
                ))}
              </div>
            ) : (
              <p className="text-content-muted text-sm italic">{t.stations.tapToFavorite}</p>
            )}
          </section>
        )}
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
