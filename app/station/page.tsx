"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from "swr";
import liveWhite from "./live-white.svg"; // Already correct - file exists in app/station/
import Image from "next/image";
import router from "next/navigation";
import Link from "next/link";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("An error occurred while fetching the data.");
  }
  return response.json();
};

function SearchStation() {
  const searchParams = useSearchParams();
  const id = searchParams?.get("gtfsId");

  const { data: station, error } = useSWR(
    `/api/station?gtfsId=${id}`,
    fetcher,
    { refreshInterval: 30000 }
  );

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

    return diffMinutes;
  };

  const diffText = (minutes: number) => {
    return minutes > 0 ? `${minutes} min` : "Already left";
  };

  if (error) return <div>Failed to load</div>;
  if (!station) return <div>Loading...</div>;

  return (
    <>
      <Link href="/">
      <button onClick={() => router} className="fixed top-0 left-0 mt-4 ml-4">
      Back
    </button>
    </Link>
    <main className="flex min-h-screen flex-col items-center justify-between p-8">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold">
              {station.data.stop.name} ({id})
            </h1>
          </div>
        </div>
        <div className="grid grid-flow-row mt-4">
          {station && (
            <table className="mt-4 w-full text-left">
              <thead className="hidden md:table-header-group">
                <tr>
                  <th>Leaves</th>
                  <th>Route</th>
                  <th>Destination</th>
                  <th>Realtime</th>
                </tr>
              </thead>
              <tbody>
                {station.data.stop._stoptimesWithoutPatterns285iU7.map(
                  (item: any, index: any) => {
                    const diff = diffCurrentimetoRealtimetime(
                      item.realtimeDeparture
                    );
                    return (
                      <tr
                        key={index}
                        className={`md:table-row block md:table-row rounded-lg shadow mb-4 p-4`}
                      >
                        <td className="block md:table-cell">
                          <strong className="md:hidden">Leaves: </strong>
                          {diff > 10
                            ? convertToTime(item.realtimeDeparture)
                            : diffText(diff)}
                        </td>
                        <td className="block md:table-cell">
                          <strong className="md:hidden">Route: </strong>
                          {item.trip.route.shortName}
                        </td>
                        <td className="block md:table-cell">
                          <strong className="md:hidden">Destination: </strong>
                          {item.trip.route.longName}
                        </td>
                        <td className="block md:table-cell">
                          {item.realtimeState}
                          {item.realtimeState === "UPDATED" && (
                            <div
                            className={`h-6 w-6 text-white ${
                              diff <= 5 ? "animate-pulse" : ""
                            }`}
                            >
                              <Image
                                src={liveWhite}
                                alt="Live"
                                width={24}
                                height={24}
                              />
                            <strong className="md:hidden">Realtime: </strong>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
    </>
  );
}

export default function Station() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchStation />
    </Suspense>
  );
}
