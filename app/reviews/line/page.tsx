"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { translations } from "@/lib/translations";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { BottomSheet } from "@/components/BottomSheet";
import { FeedbackForm } from "@/components/FeedbackForm";
import { RatingDistribution } from "@/components/RatingDistribution";
import { FeedbackSummary } from "@/components/FeedbackSummary";
import { useFeedbackList, useFeedbackSummaries } from "@/lib/hooks/useFeedback";
import type { FeedbackItem } from "@/lib/types";

interface TargetDetail {
  targetId: string;
  avg: number;
  count: number;
  distribution: number[];
}

interface LineStop {
  gtfsId: string;
  name: string;
  lat: number;
  lon: number;
  code: string;
}

interface LinePattern {
  id: string;
  headsign: string;
  directionId: number;
  stops: LineStop[];
  coordinates: [number, number][];
}

interface LineInfo {
  gtfsId: string;
  shortName: string;
  longName: string;
  patterns: LinePattern[];
  stops: LineStop[];
}

const jsonFetcher = (url: string) => fetch(url).then((r) => r.json());

// Lightweight route map — renders polylines + stop markers via Leaflet
function RouteMap({ patterns, stops, lineId }: { patterns: LinePattern[]; stops: LineStop[]; lineId: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const [selectedDirection, setSelectedDirection] = useState(0);

  // Deduplicate directions by headsign
  const directions = patterns.reduce<LinePattern[]>((acc, p) => {
    if (!acc.find((d) => d.directionId === p.directionId)) acc.push(p);
    return acc;
  }, []);

  const activePattern = directions[selectedDirection] || directions[0];
  const activeStops = activePattern?.stops || stops;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      // Need CSS
      const linkEl = document.querySelector('link[href*="leaflet.css"]');
      if (!linkEl) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);
      }

      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([41.1579, -8.6291], 13);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Draw route + stops when pattern changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    import("leaflet").then((L) => {
      // Clear existing layers (except tile layer)
      map.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
      });

      if (!activePattern) return;

      // Draw polyline
      if (activePattern.coordinates.length > 0) {
        const latLngs = activePattern.coordinates.map(
          (c) => [c[1], c[0]] as [number, number]
        );
        const polyline = L.polyline(latLngs, {
          color: "#3b82f6",
          weight: 4,
          opacity: 0.8,
        }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
      }

      // Draw stop markers
      activeStops.forEach((stop, i) => {
        const isTerminal = i === 0 || i === activeStops.length - 1;
        const icon = L.divIcon({
          html: `<div style="width:${isTerminal ? 14 : 8}px;height:${isTerminal ? 14 : 8}px;background:${isTerminal ? "#3b82f6" : "#ef4444"};border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
          className: "line-stop-marker",
          iconSize: [isTerminal ? 14 : 8, isTerminal ? 14 : 8],
          iconAnchor: [isTerminal ? 7 : 4, isTerminal ? 7 : 4],
        });

        L.marker([stop.lat, stop.lon], { icon })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:system-ui;font-size:13px;">
              <strong>${stop.name}</strong><br/>
              <a href="/station?gtfsId=${encodeURIComponent(stop.gtfsId)}" style="color:#3b82f6;">Ver horários →</a>
            </div>`
          );
      });
    });
  }, [activePattern, activeStops]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      {directions.length > 1 && (
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {directions.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setSelectedDirection(i)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors truncate ${
                i === selectedDirection
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              → {d.headsign}
            </button>
          ))}
        </div>
      )}
      <div ref={mapRef} style={{ height: 280 }} />
    </div>
  );
}

function LineReviewsContent() {
  const searchParams = useSearchParams();
  const lineId = searchParams?.get("id") || "";

  // Fetch line info (patterns + stops)
  const { data: lineInfo } = useSWR<LineInfo>(
    lineId ? `/api/line?id=${encodeURIComponent(lineId)}` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // Fetch rating detail
  const { data: detail } = useSWR<TargetDetail>(
    lineId ? `/api/feedback/rankings?type=LINE&targetId=${encodeURIComponent(lineId)}` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const [page, setPage] = useState(0);
  const { data: feedbackList, mutate } = useFeedbackList("LINE", lineId || null, page, 20);

  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);

  // Batch fetch stop feedback summaries
  const stopIds = lineInfo?.stops?.map((s) => s.gtfsId) || [];
  const { data: stopSummaries } = useFeedbackSummaries("STOP", stopIds);

  const handleFeedbackSuccess = useCallback((_feedback: FeedbackItem) => {
    mutate();
  }, [mutate]);

  if (!lineId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <p className="text-gray-500 dark:text-gray-400">Linha não especificada</p>
      </div>
    );
  }

  const stars = detail ? Math.round(detail.avg) : 0;
  const totalPages = feedbackList ? Math.ceil(feedbackList.total / 20) : 0;
  const longName = lineInfo?.longName || "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/reviews"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-sm transition-colors"
            >
              <span className="mr-2">←</span>
              {translations.reviews.backToReviews}
            </Link>
            <DarkModeToggle />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white text-xl font-bold">{lineId}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Linha {lineId}
              </h1>
              {longName && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{longName}</p>
              )}
              {detail && detail.count > 0 && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-yellow-400 text-sm">
                    {"★".repeat(stars)}{"☆".repeat(5 - stars)}
                  </span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {detail.avg.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({translations.feedback.ratings(detail.count)})
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowFeedbackSheet(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors text-sm font-medium flex-shrink-0"
            >
              ★ {translations.feedback.rate}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Route map */}
        {lineInfo && lineInfo.patterns.length > 0 && (
          <RouteMap patterns={lineInfo.patterns} stops={lineInfo.stops} lineId={lineId} />
        )}

        {/* Loading skeleton for map */}
        {!lineInfo && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-[280px] animate-pulse" />
        )}

        {/* Stops list */}
        {lineInfo && lineInfo.stops.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Paragens ({lineInfo.stops.length})
            </h2>
            <div className="space-y-0">
              {lineInfo.stops.map((stop, i) => {
                const isFirst = i === 0;
                const isLast = i === lineInfo.stops.length - 1;
                return (
                  <div key={stop.gtfsId} className="flex items-start gap-3 relative">
                    {/* Timeline */}
                    <div className="flex flex-col items-center flex-shrink-0 w-5">
                      {!isFirst && (
                        <div className="w-0.5 h-3 bg-blue-300 dark:bg-blue-600" />
                      )}
                      <div
                        className={`rounded-full border-2 border-white dark:border-gray-800 shadow-sm flex-shrink-0 ${
                          isFirst || isLast
                            ? "w-3.5 h-3.5 bg-blue-500"
                            : "w-2.5 h-2.5 bg-red-400"
                        }`}
                      />
                      {!isLast && (
                        <div className="w-0.5 flex-1 min-h-[12px] bg-blue-300 dark:bg-blue-600" />
                      )}
                    </div>
                    {/* Stop info */}
                    <div className="flex-1 min-w-0 pb-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/station?gtfsId=${encodeURIComponent(stop.gtfsId)}`}
                          className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                        >
                          {stop.name}
                        </Link>
                        {stopSummaries?.[stop.gtfsId] && (
                          <FeedbackSummary
                            summary={stopSummaries[stop.gtfsId]}
                            compact
                          />
                        )}
                      </div>
                      <Link
                        href={`/reviews/stop?id=${encodeURIComponent(stop.gtfsId)}`}
                        className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                      >
                        {stop.code}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rating distribution */}
        {detail && detail.count > 0 && (
          <RatingDistribution distribution={detail.distribution} total={detail.count} />
        )}

        {/* Comments */}
        {feedbackList && feedbackList.feedbacks.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {translations.feedback.recentComments} ({feedbackList.total})
            </h2>
            {feedbackList.feedbacks.map((f) => (
              <div key={f.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-yellow-400 text-sm">
                    {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(f.createdAt).toLocaleDateString("pt-PT", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {f.comment && (
                  <p className="text-sm text-gray-700 dark:text-gray-300">{f.comment}</p>
                )}
              </div>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Seguinte →
                </button>
              </div>
            )}
          </div>
        ) : feedbackList ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
            <div className="text-5xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {translations.reviews.noReviews}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {translations.reviews.noReviewsDesc}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-24 animate-pulse" />
            ))}
          </div>
        )}
      </main>

      <BottomSheet
        isOpen={showFeedbackSheet}
        onClose={() => setShowFeedbackSheet(false)}
        title={translations.feedback.lineFeedback}
      >
        <FeedbackForm
          type="LINE"
          targetId={lineId}
          targetName={`Linha ${lineId}`}
          existingFeedback={feedbackList?.userFeedback}
          onSuccess={handleFeedbackSuccess}
        />
      </BottomSheet>
    </div>
  );
}

export default function LineReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      }
    >
      <LineReviewsContent />
    </Suspense>
  );
}
