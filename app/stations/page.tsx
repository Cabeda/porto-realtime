"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import star from "../star-white.svg";
import { translations } from "@/lib/translations";
import { logger } from "@/lib/logger";
import { StationsSkeleton } from "@/components/LoadingSkeletons";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { stationsFetcher } from "@/lib/fetchers";
import type { Stop, StopsResponse } from "@/lib/types";

interface StopWithDistance extends Stop {
  distance: number;
}

export default function Home() {
  const [favoriteStationIds, setFavoriteStationIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const savedFavorites = localStorage.getItem("favoriteStations");
      return savedFavorites ? JSON.parse(savedFavorites) : [];
    }
    return [];
  });
  const [location, setLocation] = useState({ latitude: 0, longitude: 0 });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      });
    } else {
      logger.warn(translations.stations.geolocationNotSupported);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("favoriteStations", JSON.stringify(favoriteStationIds));
    }
  }, [favoriteStationIds]);

  const {
    data: stations,
    error: stationsError,
  } = useSWR<StopsResponse>("/api/stations", stationsFetcher, {
    dedupingInterval: 7 * 24 * 60 * 60 * 1000,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const [filter, setFilter] = useState("");

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  };

  const toggleFavorite = (gtfsId: string) => {
    setFavoriteStationIds((prev) =>
      prev.includes(gtfsId) ? prev.filter((id) => id !== gtfsId) : [...prev, gtfsId]
    );
  };

  const isFavorite = (gtfsId: string) => favoriteStationIds.includes(gtfsId);

  const favoriteStations = stations?.data.stops.filter((station: Stop) =>
    favoriteStationIds.includes(station.gtfsId)
  ) || [];

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const get5ClosestStations = (stationsData: StopsResponse, loc: { latitude: number; longitude: number }): StopWithDistance[] => {
    return stationsData.data.stops
      .map((station: Stop) => ({
        ...station,
        distance: calculateDistance(loc.latitude, loc.longitude, station.lat, station.lon),
      }))
      .sort((a: StopWithDistance, b: StopWithDistance) => a.distance - b.distance)
      .slice(0, 5);
  };

  if (stationsError) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div className="text-red-600 dark:text-red-400">{translations.stations.errorLoading}</div>
  </div>;
  if (!stations) return <StationsSkeleton />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8 bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Porto Explore</h1>
          <div className="flex items-center gap-3">
            <DarkModeToggle />
            <Link
              href="/"
              className="px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold shadow-md"
            >
              🗺️ {translations.nav.map}
            </Link>
          </div>
        </div>
      </div>
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="grid grid-flow-row mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold pt-12 pb-4 text-gray-900 dark:text-white">{translations.stations.closestStations}</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {get5ClosestStations(stations, location).map((closeStation: StopWithDistance) => (
              <div
                key={`closest-${closeStation.id}`}
                className="p-4 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-md hover:shadow-md transition-shadow"
              >
                <Link href={`/station?gtfsId=${closeStation.gtfsId}`}>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{closeStation.name}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{closeStation.gtfsId}</p>
                  <p className="text-gray-600 dark:text-gray-400">{closeStation.distance.toFixed(2)} {translations.stations.km}</p>
                </Link>
                <button
                  className={`mt-2 p-2 text-white rounded transition-colors ${
                    isFavorite(closeStation.gtfsId) ? "bg-yellow-500 dark:bg-yellow-600" : "bg-blue-500 dark:bg-blue-600"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleFavorite(closeStation.gtfsId);
                  }}
                  aria-label={
                    isFavorite(closeStation.gtfsId)
                      ? translations.stations.removeFromFavorites
                      : translations.stations.addToFavorites
                  }
                >
                  <Image src={star} alt="Favorite" width={24} height={24} />
                </button>
              </div>
            ))}
          </div>
          <h2 className="text-2xl font-bold pt-12 pb-4 text-gray-900 dark:text-white">{translations.stations.favorites}</h2>
          <div className="grid gap-4">
            {favoriteStations.length > 0 ? (
              favoriteStations.map((favoriteStation: Stop) => (
                <div
                  key={`favorite-${favoriteStation.gtfsId}`}
                  className="p-4 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Link href={`/station?gtfsId=${favoriteStation.gtfsId}`}>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{favoriteStation.name}</h3>
                    <p className="text-gray-600 dark:text-gray-400">{favoriteStation.gtfsId}</p>
                  </Link>
                  <button
                    className="mt-2 px-3 py-1 bg-red-500 dark:bg-red-600 text-white rounded hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleFavorite(favoriteStation.gtfsId);
                    }}
                    aria-label={translations.stations.removeFromFavorites}
                  >
                    {translations.stations.removeFromFavorites}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">{translations.stations.noFavoritesDesc}</p>
            )}
          </div>

          <h2 className="text-2xl font-bold pt-12 pb-4 text-gray-900 dark:text-white">{translations.stations.allStations}</h2>
          <input
            type="text"
            value={filter}
            onChange={handleFilterChange}
            placeholder={translations.stations.filterPlaceholder}
            className="p-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
          />
          {stations.data.stops
            .filter((station: Stop) =>
              station.name.toLowerCase().includes(filter.toLowerCase())
            )
            .map((station: Stop) => (
              <Link key={station.id} href={`/station?gtfsId=${station.gtfsId}`}>
                <div className="p-4 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <p className="font-semibold text-gray-900 dark:text-white">{station.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{station.gtfsId}</p>
                  <button
                    className={`mt-2 p-2 text-white rounded transition-colors ${
                      isFavorite(station.gtfsId) ? "bg-yellow-500 dark:bg-yellow-600" : "bg-blue-500 dark:bg-blue-600"
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleFavorite(station.gtfsId);
                    }}
                    aria-label={
                      isFavorite(station.gtfsId)
                        ? translations.stations.removeFromFavorites
                        : translations.stations.addToFavorites
                    }
                  >
                    <Image src={star} className="fill-current text-white" alt="Favorite" width={24} height={24} />
                  </button>
                </div>
              </Link>
            ))}
        </div>
      </div>
    </main>
  );
}
