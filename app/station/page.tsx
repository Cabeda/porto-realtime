"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { SettingsModal } from "@/components/SettingsModal";
import { BottomSheet } from "@/components/BottomSheet";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FeedbackSummary } from "@/components/FeedbackSummary";
import { useFeedbackSummaries, useFeedbackList } from "@/lib/hooks/useFeedback";
import type { StationResponse, StoptimesWithoutPatterns, FeedbackItem } from "@/lib/types";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("An error occurred while fetching the data.");
  }
  return response.json();
};

function SearchStation() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const id = searchParams?.get("gtfsId");
  const [showSettings, setShowSettings] = useState(false);

  const { data: station, error } = useSWR<StationResponse>(
    `/api/station?gtfsId=${id}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  // Feedback state
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);
  const [feedbackTargetType, setFeedbackTargetType] = useState<"LINE" | "STOP">("STOP");
  const [feedbackTargetId, setFeedbackTargetId] = useState<string>("");
  const [feedbackTargetName, setFeedbackTargetName] = useState<string>("");

  // Feedback summaries for this stop
  const stopIds = id ? [id] : [];
  const { data: stopSummaries, mutate: mutateStopSummaries } = useFeedbackSummaries("STOP", stopIds);

  // Get unique line IDs from departures for line summaries
  const allDepartures = station?.data?.stop?.stoptimesWithoutPatterns || [];
  const lineIds = Array.from(new Set(allDepartures.map((d) => d.trip.route.shortName)));
  const { data: lineSummaries, mutate: mutateLineSummaries } = useFeedbackSummaries("LINE", lineIds);

  // Feedback list for the currently-open target
  const { data: feedbackList } = useFeedbackList(
    feedbackTargetType,
    showFeedbackSheet ? feedbackTargetId : null
  );

  const openFeedback = useCallback((type: "LINE" | "STOP", targetId: string, targetName: string) => {
    setFeedbackTargetType(type);
    setFeedbackTargetId(targetId);
    setFeedbackTargetName(targetName);
    setShowFeedbackSheet(true);
  }, []);

  const handleFeedbackSuccess = useCallback((_feedback: FeedbackItem) => {
    // Revalidate summaries
    if (feedbackTargetType === "STOP") mutateStopSummaries();
    else mutateLineSummaries();
  }, [feedbackTargetType, mutateStopSummaries, mutateLineSummaries]);

  // Live countdown tick
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Use serviceDay + departureSeconds for correct time calculation
  const convertToTime = (serviceDay: number, departureSeconds: number) => {
    const date = new Date((serviceDay + departureSeconds) * 1000);
    return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  };

  const getDiffMinutes = (serviceDay: number, departureSeconds: number) => {
    const departureMs = (serviceDay + departureSeconds) * 1000;
    return Math.floor((departureMs - now) / 60000);
  };

  const getDepartureDisplay = (minutes: number) => {
    if (minutes <= 0) return { text: t.station.alreadyLeft, color: "text-content-muted" };
    if (minutes <= 2) return { text: `${minutes} min`, color: "text-red-600 dark:text-red-400 font-bold" };
    if (minutes <= 5) return { text: `${minutes} min`, color: "text-orange-600 dark:text-orange-400 font-semibold" };
    if (minutes <= 10) return { text: `${minutes} min`, color: "text-blue-600 dark:text-blue-400 font-semibold" };
    return { text: "", color: "text-content-secondary" };
  };

  if (error) {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
        <div className="bg-surface-raised rounded-lg shadow-lg p-6 max-w-md w-full">
          <div className="text-red-600 dark:text-red-400 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="mt-2 text-lg font-semibold">{t.station.noData}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!station) {
    return (
      <div className="min-h-screen bg-surface-sunken">
        <div className="animate-pulse">
          <div className="bg-surface-raised shadow-sm border-b border-border">
            <div className="max-w-4xl mx-auto px-4 py-4">
              <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
              <div className="h-10 w-64 bg-gray-300 dark:bg-gray-600 rounded"></div>
            </div>
          </div>
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-surface-raised rounded-lg shadow p-4 h-24"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const departures = station.data.stop.stoptimesWithoutPatterns || [];

  return (
    <div className="min-h-screen bg-surface-sunken transition-colors">
      {/* Header */}
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10 transition-colors">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link 
              href="/stations" 
              className="inline-flex items-center text-accent hover:text-accent-hover font-medium text-sm transition-colors"
            >
              <span className="mr-2">←</span>
              {t.station.backToStations}
            </Link>
            <button
              onClick={() => setShowSettings(true)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-surface-sunken hover:bg-border text-content-secondary transition-colors"
              title={t.nav.settings}
              aria-label={t.nav.settings}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-12 h-12 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md">
                  🚏
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-content">
                    {station.data.stop.name}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-content-muted">
                      {t.station.code}: {id}
                    </p>
                    {id && (
                      <FeedbackSummary
                        summary={stopSummaries?.[id]}
                        onClick={() => openFeedback("STOP", id, station.data.stop.name)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => id && openFeedback("STOP", id, station.data.stop.name)}
                className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors text-sm font-medium"
              >
                ★ {t.feedback.rate}
              </button>
              <Link
                href={`/?station=${id}`}
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium"
              >
                <span>🗺️</span>
                {t.station.viewOnMap}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Departures */}
      <main className="max-w-4xl mx-auto px-4 py-6 pb-20 sm:pb-6">
        {/* Info banner */}
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl">ℹ️</span>
          <div className="flex-1">
            <p className="text-blue-900 dark:text-blue-200 text-sm font-medium">{t.station.realtimeDepartures}</p>
            <p className="text-blue-700 dark:text-blue-300 text-xs mt-1">
              {t.station.updatesEvery30s}
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
                  className={`bg-surface-raised rounded-lg shadow-md hover:shadow-lg transition-all p-4 border-l-4 ${
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
                      <div className="mt-1 flex justify-center">
                        <FeedbackSummary
                          summary={lineSummaries?.[item.trip.route.shortName]}
                          onClick={() => openFeedback("LINE", item.trip.route.shortName, `Linha ${item.trip.route.shortName}`)}
                          compact
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-content truncate">
                          {item.headsign || item.trip.route.longName}
                        </h3>
                        {isRealtime && (
                          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded-full">
                            <span className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></span>
                            {t.station.realtime}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-content-secondary">
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
                        <div className="text-xs text-content-muted mt-1">
                          {diff === 1 ? t.station.minute : t.station.minutePlural}
                        </div>
                      )}
                      {diff <= 0 && (
                        <div className="text-xs text-content-muted mt-1">
                          {t.station.departed}
                        </div>
                      )}
                    </div>
                  </div>

                  {diff > 0 && (
                    <div className="mt-3 pt-3 border-t border-border-strong flex items-center justify-between text-xs text-content-muted">
                      <span>{t.station.scheduledTime}: {convertToTime(item.serviceDay, item.scheduledDeparture)}</span>
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
          <div className="bg-surface-raised rounded-lg shadow-md p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-semibold text-content mb-2">
              {t.station.unavailableTitle}
            </h3>
            <p className="text-content-secondary">
              {t.station.unavailableDesc}
            </p>
            <p className="text-sm text-content-muted mt-4">
              {t.station.unavailableHint}{" "}
              <Link href="/" className="text-accent hover:underline">
                {t.station.realtimeMap}
              </Link>{" "}
              {t.station.toSeePositions}
            </p>
          </div>
        )}

        {departures.length > 0 && (
          <div className="mt-6 text-center text-xs text-content-muted">
            {t.station.showing} {departures.length} {departures.length === 1 ? t.station.departure : t.station.departures}
          </div>
        )}
      </main>

      {/* Feedback Bottom Sheet */}
      <BottomSheet
        isOpen={showFeedbackSheet}
        onClose={() => setShowFeedbackSheet(false)}
        title={feedbackTargetType === "LINE" ? t.feedback.lineFeedback : t.feedback.stopFeedback}
      >
        <FeedbackForm
          type={feedbackTargetType}
          targetId={feedbackTargetId}
          targetName={feedbackTargetName}
          existingFeedback={feedbackList?.userFeedback}
          onSuccess={handleFeedbackSuccess}
        />

        {/* Recent comments */}
        {feedbackList && feedbackList.feedbacks.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-content-secondary mb-3">
              {t.feedback.recentComments}
            </h3>
            <div className="space-y-3">
              {feedbackList.feedbacks
                .filter((f) => f.comment)
                .slice(0, 5)
                .map((f) => (
                  <div key={f.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-yellow-400 text-xs">
                        {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                      </span>
                      <span className="text-xs text-content-muted">
                        {new Date(f.createdAt).toLocaleDateString("pt-PT")}
                      </span>
                    </div>
                    <p className="text-sm text-content-secondary">{f.comment}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </BottomSheet>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function StationFallback() {
  const t = useTranslations();
  return (
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent mb-4"></div>
        <p className="text-content-secondary">{t.station.loading}</p>
      </div>
    </div>
  );
}

export default function Station() {
  return (
    <Suspense fallback={<StationFallback />}>
      <SearchStation />
    </Suspense>
  );
}
