"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from "swr";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("An error occurred while fetching the data.");
  }
  return response.json();
};

export default function Station() {
  const searchParams = useSearchParams();
  const id = searchParams?.get("gtfsId");

  const { data: station, error } = useSWR(
    `/api/station?gtfsId=${id}`,
    fetcher,
    { refreshInterval: 60000 }
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

    return diffMinutes > 0 ? `${diffMinutes} minutes` : "Already left";
  };

  if (error) return <div>Failed to load</div>;
  if (!station) return <div>Loading...</div>;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <main className="flex min-h-screen flex-col items-center justify-between p-24">
        <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-between">
              <h1 className="text-4xl font-bold">{station.data.stop.name}</h1>
            </div>
          </div>
          <div className="grid grid-flow-row mt-4">
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
    </Suspense>
  );
}
