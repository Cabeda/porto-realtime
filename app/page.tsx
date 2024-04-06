"use client";

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
  const [selectedGtfsId, setSelectedGtfsId] = useState("2:BRRS2"); 
  const [location, setLocation] = useState({ latitude: 0, longitude: 0 });

  const { data: station, error } = useSWR(
    `/api/station?gtfsId=${selectedGtfsId}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: stations, error: stationsError } = useSWR(
    "/api/stations",
    fetcher
  );

  const getClosestStation = (stations: any, location: any) => {
    return stations.data.stops.reduce((prev: any, current: any) => {
      const prevDistance = Math.sqrt(
        Math.pow(prev.lat - location.latitude, 2) +
          Math.pow(prev.lon - location.longitude, 2)
      );
      const currentDistance = Math.sqrt(
        Math.pow(current.lat - location.latitude, 2) +
          Math.pow(current.lon - location.longitude, 2)
      );
      return prevDistance < currentDistance ? prev : current;
    });
  }

  useEffect(() => {
    if (navigator.geolocation && stations) {
      navigator.geolocation.getCurrentPosition((position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      });
      const closest = getClosestStation(stations, location);
      setSelectedGtfsId(closest.gtfsId);
    } else {
      console.log("Geolocation is not supported by this browser.");
    }
  }, [stations, location]);

  const convertToTime = (time: number) => {
    const timeOffset = new Date().getTimezoneOffset() / 60;
    const hour = new Date(time * 1000).getHours() + timeOffset;
    const minute = new Date(time * 1000)
      .getMinutes()
      .toString()
      .padStart(2, "0");
    return `${hour}:${minute}`;
  };

  const diffCurrentimetoRealtimetime = (time: number) => {
    const currentTime = Date.now();
    const realtimeTimestamp = new Date().setHours(0, 0, 0, 0) + time * 1000;
    const diffMinutes = Math.floor((realtimeTimestamp - currentTime) / 60000);

    return diffMinutes > 0 ? `${diffMinutes} minutes` : "Already left";
  };

  if (error) return <div>Failed to load</div>;
  if (!station) return <div>Loading...</div>;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold">Porto Explore</h1>
          </div>
        </div>
        <div className="grid grid-flow-row mt-4">
          <div className="flex items-center justify-between">
            <select
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md"
              value={selectedGtfsId}
              onChange={(e) => setSelectedGtfsId(e.target.value)}
            >
              {stations &&
                stations.data.stops.map((station: any, index: any) => (
                  <option key={index} value={station.gtfsId}>
                    {`${station.name} (${station.code})`}
                  </option>
                ))}
            </select>
            <button className="ml-4 px-4 py-2 text-white bg-blue-500 rounded-md">
              Search
            </button>
          </div>
          {/* Add code to parse the station data */}
          {station && (
            <table className="mt-4 w-full text-left">
              <thead>
                <tr>
                  <th>Realtime State</th>
                  <th>Route Short Name</th>
                  <th>Realtime Departure</th>
                </tr>
              </thead>
              <tbody>
                {station.data.stop._stoptimesWithoutPatterns285iU7.map(
                  (item: any, index: any) => (
                    <tr key={index}>
                      <td>{item.realtimeState}</td>
                      <td>{item.trip.route.shortName}</td>
                      <td>
                        {convertToTime(item.realtimeDeparture)}{" "}
                        {diffCurrentimetoRealtimetime(item.realtimeDeparture)}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
