"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import star from "../star-white.svg";
import { useRouter } from "next/navigation";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("An error occurred while fetching the data.");
  }
  return response.json();
};

export default function Home() {
  // Store only gtfsId strings in favorites, not full objects
  const [favoriteStationIds, setFavoriteStationIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const savedFavorites = localStorage.getItem("favoriteStations");
      return savedFavorites ? JSON.parse(savedFavorites) : [];
    }
    return [];
  });
  const [location, setLocation] = useState({ latitude: 0, longitude: 0 });

  const router = useRouter();

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      });
    } else {
      console.log("Geolocation is not supported by this browser.");
    }
  }, []);

  // Persist favorites to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "favoriteStations",
        JSON.stringify(favoriteStationIds)
      );
    }
  }, [favoriteStationIds]);

  const {
    data: stations,
    error: stationsError,
    isLoading: boolean,
  } = useSWR("/api/stations", fetcher, {
    // Cache stops data for 30 days
    dedupingInterval: 30 * 24 * 60 * 60 * 1000, // 30 days
    revalidateIfStale: false, // Don't revalidate even if stale
    revalidateOnFocus: false, // Don't revalidate when window gains focus
    revalidateOnReconnect: false, // Don't revalidate on network reconnect
  });

  const [filter, setFilter] = useState("");

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  };

  // Helper functions for favorites
  const toggleFavorite = (gtfsId: string) => {
    setFavoriteStationIds((prev) => {
      if (prev.includes(gtfsId)) {
        return prev.filter((id) => id !== gtfsId);
      } else {
        return [...prev, gtfsId];
      }
    });
  };

  const isFavorite = (gtfsId: string) => favoriteStationIds.includes(gtfsId);

  // Get favorite station objects from IDs
  const favoriteStations = stations?.data.stops.filter((station: any) =>
    favoriteStationIds.includes(station.gtfsId)
  ) || [];

  const get5ClosestStations = (stations: any, location: any) => {
    return stations.data.stops
      .map((station: any) => ({
        ...station,
        distance: Math.sqrt(
          Math.pow(station.lat - location.latitude, 2) +
            Math.pow(station.lon - location.longitude, 2)
        ) * 100,
      }))
      .sort((a: any, b: any) => a.distance - b.distance)
      .slice(0, 5);
  };

  if (stationsError) return <div>Failed to load</div>;
  if (!stations) return <div>Loading...</div>;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8">
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold">Porto Explore</h1>
          <Link 
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-md"
          >
            🗺️ Live Map
          </Link>
        </div>
      </div>
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="grid grid-flow-row mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold pt-12 pb-4">Closest Stations</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {stations &&
              get5ClosestStations(stations, location).map(
                (closeStation: any, index: any) => (
                  <div
                    key={`closest-${closeStation.id}`}
                    className="p-4 border border-gray-200 rounded-md"
                  >
                    <Link href={`/station?gtfsId=${closeStation.gtfsId}`}>
                      <h3 className="text-xl font-bold">{closeStation.name}</h3>
                      <p>{closeStation.gtfsId}</p>
                      <p>{closeStation.distance.toFixed(2)} km</p>
                    </Link>
                    <button
                      className={`mt-2 p-2 text-white rounded ${
                        isFavorite(closeStation.gtfsId) ? "bg-yellow-500" : "bg-blue-500"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleFavorite(closeStation.gtfsId);
                      }}
                      aria-label={
                        isFavorite(closeStation.gtfsId)
                          ? "Remove from favorites"
                          : "Add to favorites"
                      }
                    >
                      <Image src={star} alt="Favorite" width={24} height={24} />
                    </button>
                  </div>
                )
              )}
          </div>
          <h2 className="text-2xl font-bold pt-12 pb-4">Favorite Stations</h2>
          <div className="grid gap-4">
            {favoriteStations.length > 0 ? (
              favoriteStations.map((favoriteStation: any) => (
                <div
                  key={`favorite-${favoriteStation.gtfsId}`}
                  className="p-4 border border-gray-300 rounded-md hover:bg-gray-100"
                >
                  <Link href={`/station?gtfsId=${favoriteStation.gtfsId}`}>
                    <h3 className="text-xl font-bold">{favoriteStation.name}</h3>
                    <p className="text-gray-600">{favoriteStation.gtfsId}</p>
                  </Link>
                  <button
                    className="mt-2 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleFavorite(favoriteStation.gtfsId);
                    }}
                    aria-label="Remove from favorites"
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500 italic">No favorite stations yet. Click the star button to add stations to your favorites.</p>
            )}
          </div>

          <h2 className="text-2xl font-bold pt-12 pb-4">All Stations</h2>
          <input
            type="text"
            value={filter}
            onChange={handleFilterChange}
            placeholder="Filter stations by name"
            className="p-2 border border-gray-300 rounded-md"
          />
          {stations &&
            stations.data.stops
              .filter((station: any) =>
                station.name.toLowerCase().includes(filter.toLowerCase())
              )
              .map((station: any) => (
                <Link
                  key={station.id}
                  href={`/station?gtfsId=${station.gtfsId}`}
                >
                  <div className="p-4 border border-gray-300 rounded-md hover:bg-gray-100">
                    <p className="font-semibold">{station.name}</p>
                    <p className="text-sm text-gray-600">{station.gtfsId}</p>
                    <button
                      className={`mt-2 p-2 text-white rounded ${
                        isFavorite(station.gtfsId) ? "bg-yellow-500" : "bg-blue-500"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleFavorite(station.gtfsId);
                      }}
                      aria-label={
                        isFavorite(station.gtfsId)
                          ? "Remove from favorites"
                          : "Add to favorites"
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
