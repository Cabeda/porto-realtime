"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { SettingsModal } from "@/components/SettingsModal";
import { UserMenu } from "@/components/UserMenu";
import { BottomSheet } from "@/components/BottomSheet";
import { FeedbackForm } from "@/components/FeedbackForm";
import { RatingDistribution } from "@/components/RatingDistribution";
import { FeedbackSummary } from "@/components/FeedbackSummary";
import { ReviewCard } from "@/components/ReviewCard";
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
function RouteMap({
  patterns,
  stops,
  lineId: _lineId,
}: {
  patterns: LinePattern[];
  stops: LineStop[];
  lineId: string;
}) {
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

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        maxZoom: 19,
      }).setView([41.1579, -8.6291], 13);
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
        const latLngs = activePattern.coordinates.map((c) => [c[1], c[0]] as [number, number]);
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
        const size = isTerminal ? 32 : 24;
        const vb = "0 0 20 24";
        const icon = L.divIcon({
          html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.2}" viewBox="${vb}" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
            <rect x="9" y="8" width="2" height="16" rx="1" fill="#5f6368"/>
            <rect x="2" y="0" width="16" height="12" rx="2.5" fill="${isTerminal ? "#0d9488" : "#6b7280"}" stroke="white" stroke-width="1"/>
            <path d="M6.5 3.5h7a1 1 0 011 1v2.5a1 1 0 01-1 1h-7a1 1 0 01-1-1V4.5a1 1 0 011-1z" fill="white" opacity="0.9"/>
            <rect x="6" y="8.5" width="3" height="1.5" rx="0.5" fill="white" opacity="0.7"/>
            <rect x="11" y="8.5" width="3" height="1.5" rx="0.5" fill="white" opacity="0.7"/>
          </svg>`,
          className: "line-stop-marker",
          iconSize: [size, size * 1.2],
          iconAnchor: [size / 2, size * 1.2],
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
    <div className="bg-surface-raised rounded-lg shadow-md overflow-hidden">
      {directions.length > 1 && (
        <div className="flex border-b border-border">
          {directions.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setSelectedDirection(i)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors truncate ${
                i === selectedDirection
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500"
                  : "text-content-muted hover:bg-surface-sunken"
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
  const t = useTranslations();
  const searchParams = useSearchParams();
  const lineId = searchParams?.get("id") || "";
  const [showSettings, setShowSettings] = useState(false);

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
  const [sort, setSort] = useState<"recent" | "helpful">("recent");
  const { data: feedbackList, mutate } = useFeedbackList("LINE", lineId || null, page, 20, sort);

  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);

  // Batch fetch stop feedback summaries
  const stopIds = lineInfo?.stops?.map((s) => s.gtfsId) || [];
  const { data: stopSummaries } = useFeedbackSummaries("STOP", stopIds);

  const handleFeedbackSuccess = useCallback(
    (_feedback: FeedbackItem) => {
      mutate();
    },
    [mutate]
  );

  if (!lineId) {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
        <p className="text-content-muted">{t.reviews.line}</p>
      </div>
    );
  }

  const stars = detail ? Math.round(detail.avg) : 0;
  const totalPages = feedbackList ? Math.ceil(feedbackList.total / 20) : 0;
  const longName = lineInfo?.longName || "";

  return (
    <div className="min-h-screen bg-surface-sunken transition-colors">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/community"
              className="inline-flex items-center text-accent hover:text-accent-hover font-medium text-sm transition-colors"
            >
              <span className="mr-2">←</span>
              {t.reviews.backToReviews}
            </Link>
            <div className="flex items-center gap-2">
              <UserMenu />
              <button
                onClick={() => setShowSettings(true)}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-surface-sunken hover:bg-border text-content-secondary transition-colors"
                title={t.nav.settings}
                aria-label={t.nav.settings}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white text-xl font-bold">{lineId}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-content">
                {t.reviews.line} {lineId}
              </h1>
              {longName && <p className="text-xs text-content-muted truncate">{longName}</p>}
              {detail && detail.count > 0 && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-yellow-400 text-sm">
                    {"★".repeat(stars)}
                    {"☆".repeat(5 - stars)}
                  </span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {detail.avg.toFixed(1)}
                  </span>
                  <span className="text-xs text-content-muted">
                    ({t.feedback.ratings(detail.count)})
                  </span>
                </div>
              )}
            </div>
            <Link
              href={`/analytics/line?route=${encodeURIComponent(lineId)}`}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium flex-shrink-0"
              title="Ver estatísticas da linha"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <span className="hidden sm:inline">Estatísticas</span>
            </Link>
            <button
              onClick={() => setShowFeedbackSheet(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors text-sm font-medium flex-shrink-0"
            >
              ★ {t.feedback.rate}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-20 sm:pb-6 space-y-6">
        {/* Route map */}
        {lineInfo && lineInfo.patterns.length > 0 && (
          <RouteMap patterns={lineInfo.patterns} stops={lineInfo.stops} lineId={lineId} />
        )}

        {/* Loading skeleton for map */}
        {!lineInfo && (
          <div className="bg-surface-raised rounded-lg shadow-md h-[280px] animate-pulse" />
        )}

        {/* Stops list */}
        {lineInfo && lineInfo.stops.length > 0 && (
          <div className="bg-surface-raised rounded-lg shadow-md p-4">
            <h2 className="text-sm font-semibold text-content-secondary mb-3">
              {t.reviews.stopsCount(lineInfo.stops.length)}
            </h2>
            <div className="space-y-0">
              {lineInfo.stops.map((stop, i) => {
                const isFirst = i === 0;
                const isLast = i === lineInfo.stops.length - 1;
                return (
                  <div key={stop.gtfsId} className="flex items-start gap-3 relative">
                    {/* Timeline */}
                    <div className="flex flex-col items-center flex-shrink-0 w-5">
                      {!isFirst && <div className="w-0.5 h-3 bg-blue-300 dark:bg-blue-600" />}
                      <div
                        className={`rounded-full border-2 border-white dark:border-gray-800 shadow-sm flex-shrink-0 ${
                          isFirst || isLast ? "w-3.5 h-3.5 bg-blue-500" : "w-2.5 h-2.5 bg-red-400"
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
                          className="text-sm font-medium text-content-secondary hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                        >
                          {stop.name}
                        </Link>
                        {stopSummaries?.[stop.gtfsId] && (
                          <FeedbackSummary summary={stopSummaries[stop.gtfsId]} compact />
                        )}
                      </div>
                      <Link
                        href={`/reviews/stop?id=${encodeURIComponent(stop.gtfsId)}`}
                        className="text-xs text-content-muted hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-content-secondary">
                {t.feedback.recentComments} ({feedbackList.total})
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setSort("recent");
                    setPage(0);
                  }}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${sort === "recent" ? "bg-accent text-white" : "bg-surface-sunken text-content-muted hover:text-content-secondary"}`}
                >
                  {t.feedback.sortByRecent}
                </button>
                <button
                  onClick={() => {
                    setSort("helpful");
                    setPage(0);
                  }}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${sort === "helpful" ? "bg-accent text-white" : "bg-surface-sunken text-content-muted hover:text-content-secondary"}`}
                >
                  {t.feedback.sortByHelpful}
                </button>
              </div>
            </div>
            {feedbackList.feedbacks.map((f) => (
              <ReviewCard key={f.id} feedback={f} />
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-sm rounded-lg bg-surface-raised border border-border disabled:opacity-40 hover:bg-surface-sunken transition-colors"
                >
                  ← {t.reviews.previous}
                </button>
                <span className="text-xs text-content-muted">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-sm rounded-lg bg-surface-raised border border-border disabled:opacity-40 hover:bg-surface-sunken transition-colors"
                >
                  {t.reviews.next} →
                </button>
              </div>
            )}
          </div>
        ) : feedbackList ? (
          <div className="bg-surface-raised rounded-lg shadow-md p-8 text-center">
            <div className="text-5xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-content mb-2">{t.reviews.noReviews}</h3>
            <p className="text-content-muted text-sm">{t.reviews.noReviewsDesc}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface-raised rounded-lg shadow p-4 h-24 animate-pulse" />
            ))}
          </div>
        )}
      </main>

      <BottomSheet
        isOpen={showFeedbackSheet}
        onClose={() => setShowFeedbackSheet(false)}
        title={t.feedback.lineFeedback}
      >
        <FeedbackForm
          type="LINE"
          targetId={lineId}
          targetName={`${t.reviews.line} ${lineId}`}
          existingFeedback={feedbackList?.userFeedback}
          onSuccess={handleFeedbackSuccess}
        />
      </BottomSheet>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default function LineReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-sunken flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      }
    >
      <LineReviewsContent />
    </Suspense>
  );
}
