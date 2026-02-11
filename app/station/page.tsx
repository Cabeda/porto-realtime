"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from "swr";
import Link from "next/link";
import { translations } from "@/lib/translations";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import type { StationResponse, StoptimesWithoutPatterns } from "@/lib/types";

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

  const { data: station, error } = useSWR<StationResponse>(
    `/api/station?gtfsId=${id}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  // Use serviceDay + departureSeconds for correct time calculation
  const convertToTime = (serviceDay: number, departureSeconds: number) => {
    const date = new Date((serviceDay + departureSeconds) * 1000);
    return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  };

  const getDiffMinutes = (serviceDay: number, departureSeconds: number) => {
    const departureMs = (serviceDay + departureSeconds) * 1000;
    return Math.floor((departureMs - Date.now()) / 60000);
  };

  const getDepartureDisplay = (minutes: number) => {
    if (minutes <= 0) return { text: translations.station.alreadyLeft, color: "text-gray-400 dark:text-gray-500" };
    if (minutes <= 2) return { text: `${minutes} min`, color: "text-red-600 dark:text-red-400 font-bold" };
    if (minutes <= 5) return { text: `${minutes} min`, color: "text-orange-600 dark:text-orange-400 font-semibold" };
    if (minutes <= 10) return { text: `${minutes} min`, color: "text-blue-600 dark:text-blue-400 font-semibold" };
    return { text: "", color: "text-gray-700 dark:text-gray-300" };
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
          <div className="text-red-600 dark:text-red-400 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="mt-2 text-lg font-semibold">{translations.station.noData}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!station) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-pulse">
          <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-4xl mx-auto px-4 py-4">
              <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
              <div className="h-10 w-64 bg-gray-300 dark:bg-gray-600 rounded"></div>
            </div>
          </div>
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-24"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const departures = station.data.stop.stoptimesWithoutPatterns || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link 
              href="/stations" 
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-sm transition-colors"
            >
              <span className="mr-2">←</span>
              Voltar para Estações
            </Link>
            <DarkModeToggle />
          </div>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-12 h-12 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md">
                  🚏
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    {station.data.stop.name}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Código: {id}
                  </p>
                </div>
              </div>
            </div>
            <Link
              href={`/?station=${id}`}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium"
            >
              <span>🗺️</span>
              Ver no Mapa
            </Link>
          </div>
        </div>
      </header>

      {/* Departures */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Info banner */}
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl">ℹ️</span>
          <div className="flex-1">
            <p className="text-blue-900 dark:text-blue-200 text-sm font-medium">Partidas em Tempo Real</p>
            <p className="text-blue-700 dark:text-blue-300 text-xs mt-1">
              Atualiza automaticamente a cada 30 segundos
            </p>
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-300 font-mono bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded">
            {new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {departures.length > 0 ? (
          <div className="space-y-3">
            {departures.map((item: StoptimesWithoutPatterns, index: number) => {
              const diff = getDiffMinutes(item.serviceDay, item.realtimeDeparture);
              const departure = getDepartureDisplay(diff);
              const isRealtime = item.realtimeState === "UPDATED";
              const isLeaving = diff <= 2 && diff > 0;

              return (
                <div
                  key={index}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all p-4 border-l-4 ${
                    isLeaving 
                      ? "border-red-500 dark:border-red-400 animate-pulse" 
                      : isRealtime 
                        ? "border-green-500 dark:border-green-400" 
                        : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                        <span className="text-white text-xl font-bold">
                          {item.trip.route.shortName}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                          {item.headsign || item.trip.route.longName}
                        </h3>
                        {isRealtime && (
                          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded-full">
                            <span className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></span>
                            Tempo Real
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span>→</span>
                        <span className="truncate">{item.trip.route.longName}</span>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <div className={`text-3xl font-bold ${departure.color}`}>
                        {diff > 10
                          ? convertToTime(item.serviceDay, item.realtimeDeparture)
                          : diff <= 0
                            ? departure.text
                            : `${diff}`}
                      </div>
                      {diff <= 10 && diff > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {diff === 1 ? 'minuto' : 'minutos'}
                        </div>
                      )}
                      {diff <= 0 && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Partiu
                        </div>
                      )}
                    </div>
                  </div>

                  {diff > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Hora programada: {convertToTime(item.serviceDay, item.scheduledDeparture)}</span>
                      {item.departureDelay !== 0 && (
                        <span className={item.departureDelay > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}>
                          {item.departureDelay > 0 ? '+' : ''}{Math.floor(item.departureDelay / 60)} min
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Horários temporariamente indisponíveis
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Os dados de horários podem estar desatualizados no servidor.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
              Os autocarros continuam a circular — consulte o{" "}
              <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
                mapa em tempo real
              </Link>{" "}
              para ver as posições atuais.
            </p>
          </div>
        )}

        {departures.length > 0 && (
          <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
            A mostrar {departures.length} {departures.length === 1 ? 'partida' : 'partidas'}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Station() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">{translations.station.loading}</p>
        </div>
      </div>
    }>
      <SearchStation />
    </Suspense>
  );
}
