"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { translations } from "@/lib/translations";
import { logger } from "@/lib/logger";
import { StationsSkeleton } from "@/components/LoadingSkeletons";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { stationsFetcher } from "@/lib/fetchers";
import type { Stop, StopsResponse } from "@/lib/types";

interface StopWithDistance extends Stop {
  distance: number;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function StationCard({ station, isFavorite, onToggleFavorite, distance }: {
  station: Stop; isFavorite: boolean; onToggleFavorite: () => void; distance?: number;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all p-4 flex items-center gap-4">
      <Link href={`/station?gtfsId=${station.gtfsId}`} className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 dark:text-white truncate">{station.name}</h3>
        {distance !== undefined && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">📍 {formatDistance(distance)}</p>
        )}
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={`/?station=${encodeURIComponent(station.gtfsId)}`}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm"
          title="Ver no mapa"
        >
          🗺️
        </Link>
        <button
          onClick={onToggleFavorite}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors text-lg ${
            isFavorite
              ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-500"
              : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-yellow-500"
          }`}
          aria-label={isFavorite ? translations.stations.removeFromFavorites : translations.stations.addToFavorites}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}

export default function StationsPage() {
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

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <span className="text-4xl">⚠️</span>
        <p className="mt-2 text-red-600 dark:text-red-400">{translations.stations.errorLoading}</p>
      </div>
    </div>
  );
  if (!stations) return <StationsSkeleton />;

  const stops = stations.data.stops;
  const closestStations: StopWithDistance[] = location
    ? stops.map((s) => ({ ...s, distance: haversine(location.latitude, location.longitude, s.lat, s.lon) }))
        .sort((a, b) => a.distance - b.distance).slice(0, 5)
    : [];
  const favoriteStations = stops.filter((s) => favoriteStationIds.includes(s.gtfsId));
  const filteredStations = filter.length >= 2
    ? stops.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 30)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Paragens</h1>
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
              🗺️ Mapa
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={translations.stations.filterPlaceholder}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>

        {/* Search results */}
        {filter.length >= 2 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Resultados ({filteredStations.length}{filteredStations.length === 30 ? "+" : ""})
            </h2>
            {filteredStations.length > 0 ? (
              <div className="space-y-2">
                {filteredStations.map((s) => (
                  <StationCard key={s.id} station={s} isFavorite={isFavorite(s.gtfsId)} onToggleFavorite={() => toggleFavorite(s.gtfsId)} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm italic">Nenhuma paragem encontrada</p>
            )}
          </section>
        )}

        {/* Nearby */}
        {filter.length < 2 && closestStations.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              📍 Mais próximas
            </h2>
            <div className="space-y-2">
              {closestStations.map((s) => (
                <StationCard key={`near-${s.id}`} station={s} isFavorite={isFavorite(s.gtfsId)} onToggleFavorite={() => toggleFavorite(s.gtfsId)} distance={s.distance} />
              ))}
            </div>
          </section>
        )}

        {/* Favorites */}
        {filter.length < 2 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              ⭐ Favoritas
            </h2>
            {favoriteStations.length > 0 ? (
              <div className="space-y-2">
                {favoriteStations.map((s) => (
                  <StationCard key={`fav-${s.gtfsId}`} station={s} isFavorite onToggleFavorite={() => toggleFavorite(s.gtfsId)} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm italic">
                Toque ☆ numa paragem para a adicionar aos favoritos
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
