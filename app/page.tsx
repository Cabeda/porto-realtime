"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("An error occurred while fetching the data.");
  }
  return response.json();
};

export default function Home() {
  const [favoriteStations, setFavoriteStations] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const savedFavorites = localStorage.getItem("favoriteStations");
      return savedFavorites ? JSON.parse(savedFavorites) : [];
    }
    return [];
  });
  const [location, setLocation] = useState({ latitude: 0, longitude: 0 });

  // Inside your component
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

  // Inside your component
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "favoriteStations",
        JSON.stringify(favoriteStations)
      );
    }
  }, [favoriteStations]);

  // Initialize favorites from local storage
  useState(() => {
    if (typeof window !== "undefined") {
      const savedFavorites = localStorage.getItem("favorites");
      return savedFavorites ? JSON.parse(savedFavorites) : [];
    }
  });

  const {
    data: stations,
    error: stationsError,
    isLoading: boolean,
  } = useSWR("/api/stations", fetcher);

  const [filter, setFilter] = useState("");

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  };

  const get5ClosestStations = (stations: any, location: any) => {
    return stations.data.stops
      .map((station: any) => ({
        ...station,
        distance: Math.sqrt(
          Math.pow(station.lat - location.latitude, 2) +
            Math.pow(station.lon - location.longitude, 2)
        ),
      }))
      .sort((a: any, b: any) => a.distance - b.distance)
      .slice(0, 5);
  };

  if (stationsError) return <div>Failed to load</div>;
  if (!stations) return <div>Loading...</div>;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold">Porto Explore</h1>
        </div>
      </div>
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="grid grid-flow-row mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Closest Stations</h2>
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
                      <button
                        className="mt-2 p-2 bg-blue-500 text-white rounded"
                        onClick={(e) => {
                          e.preventDefault();
                          setFavoriteStations([
                            ...(favoriteStations || []), // Initialize as empty array if null
                            closeStation,
                          ]);
                        }}
                      >
                        Make Favorite
                      </button>
                    </Link>
                  </div>
                )
              )}
          </div>
          <h2 className="text-2xl font-bold">Favorite Stations</h2>
          <div className="grid gap-4">
            {favoriteStations &&
              favoriteStations.map((favoriteStation: any) => (
                <div
                  key={`favorite-${favoriteStation.id}`}
                  className="p-4 border border-gray-300 rounded-md hover:bg-gray-100"
                >
                  <Link href={`/station?gtfsId=${favoriteStation.gtfsId}`}>

                  <h3 className="text-xl font-bold">{favoriteStation.name}</h3>
                  <p>{favoriteStation.gtfsId}</p>
                  <p>{favoriteStation.name}</p>
                  </Link>
                  <button
                    className="mt-2 p-2 bg-red-500 text-white rounded"
                    onClick={(e) => {
                      e.preventDefault();
                      setFavoriteStations(
                        favoriteStations.filter(
                          (station) => station !== favoriteStation
                        )
                      );
                    }}
                    >
                    Remove Favorite
                  </button>
                </div>
              ))}
          </div>
          <h2 className="text-2xl font-bold">All Stations</h2>
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
                    <p>{station.name}</p>
                    <p>{station.gtfsId}</p>
                    <button
                      className="mt-2 p-2 bg-blue-500 text-white rounded"
                      onClick={(e) => {
                        e.preventDefault();
                        setFavoriteStations([
                          ...(favoriteStations || []), // Initialize as empty array if null
                          station,
                        ]);
                      }}
                    >
                      Make Favorite
                    </button>
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </main>
  );
}
