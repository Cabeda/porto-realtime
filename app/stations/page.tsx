"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import useSWR from "swr";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { logger } from "@/lib/logger";
import { StationsSkeleton } from "@/components/LoadingSkeletons";
import { PageHeader } from "@/components/PageHeader";
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

function walkingMinutes(km: number): number {
  // Average walking speed ~5 km/h
  return Math.ceil((km / 5) * 60);
}

function formatWalkTime(km: number): string {
  const mins = walkingMinutes(km);
  return mins < 1 ? "< 1 min" : `${mins} min`;
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
          <p className="text-sm text-content-muted mt-0.5">
            📍 {formatDistance(distance)} · 🚶 {formatWalkTime(distance)}
          </p>
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
  const [favoriteStationIds, setFavoriteStationIds] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
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
    const saved = localStorage.getItem("favoriteStations");
    setFavoriteStationIds(saved ? JSON.parse(saved) : []);
    setFavoritesLoaded(true);
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    localStorage.setItem("favoriteStations", JSON.stringify(favoriteStationIds));
  }, [favoriteStationIds, favoritesLoaded]);

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
      <PageHeader title={t.stations.stopsLabel} maxWidth="max-w-2xl" />

      <div className="max-w-2xl mx-auto px-4 py-6 pb-20 sm:pb-6 space-y-8">
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
        {filter.length === 1 && (
          <p className="text-content-muted text-sm italic">{t.stations.typeMoreChars}</p>
        )}
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
    </div>
  );
}
