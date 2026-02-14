"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { SettingsModal } from "@/components/SettingsModal";
import { BottomSheet } from "@/components/BottomSheet";
import { FeedbackForm } from "@/components/FeedbackForm";
import { RatingDistribution } from "@/components/RatingDistribution";
import { useFeedbackList } from "@/lib/hooks/useFeedback";
import type { FeedbackItem, StationResponse } from "@/lib/types";

interface TargetDetail {
  targetId: string;
  avg: number;
  count: number;
  distribution: number[];
}

const jsonFetcher = (url: string) => fetch(url).then((r) => r.json());

function StopReviewsContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const stopId = searchParams?.get("id") || "";
  const [showSettings, setShowSettings] = useState(false);

  // Fetch stop name from station API
  const { data: stationData } = useSWR<StationResponse>(
    stopId ? `/api/station?gtfsId=${encodeURIComponent(stopId)}` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const stopName = stationData?.data?.stop?.name;

  const { data: detail } = useSWR<TargetDetail>(
    stopId ? `/api/feedback/rankings?type=STOP&targetId=${encodeURIComponent(stopId)}` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const [page, setPage] = useState(0);
  const { data: feedbackList, mutate } = useFeedbackList("STOP", stopId || null, page, 20);

  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);

  const handleFeedbackSuccess = useCallback((_feedback: FeedbackItem) => {
    mutate();
  }, [mutate]);

  if (!stopId) {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
        <p className="text-content-muted">{t.reviews.stops}</p>
      </div>
    );
  }

  const stars = detail ? Math.round(detail.avg) : 0;
  const totalPages = feedbackList ? Math.ceil(feedbackList.total / 20) : 0;
  const displayName = stopName || stopId;

  return (
    <div className="min-h-screen bg-surface-sunken transition-colors">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/reviews"
              className="inline-flex items-center text-accent hover:text-accent-hover font-medium text-sm transition-colors"
            >
              <span className="mr-2">←</span>
              {t.reviews.backToReviews}
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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-surface-sunken rounded-full flex items-center justify-center flex-shrink-0">
              <div className="w-4 h-4 bg-red-500 dark:bg-red-400 rounded-full border-2 border-surface-raised" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-content truncate">
                {displayName}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {stopName && (
                  <p className="text-xs text-content-muted">{stopId}</p>
                )}
                {detail && detail.count > 0 && (
                  <>
                    <span className="text-yellow-400 text-sm">
                      {"★".repeat(stars)}{"☆".repeat(5 - stars)}
                    </span>
                    <span className="text-sm font-semibold text-content-secondary">
                      {detail.avg.toFixed(1)}
                    </span>
                    <span className="text-xs text-content-muted">
                      ({t.feedback.ratings(detail.count)})
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowFeedbackSheet(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors text-sm font-medium"
              >
                ★ {t.feedback.rate}
              </button>
              <Link
                href={`/station?gtfsId=${encodeURIComponent(stopId)}`}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium"
              >
                {t.reviews.viewTimetable}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-20 sm:pb-6">
        {/* Rating distribution from API */}
        {detail && detail.count > 0 && (
          <RatingDistribution distribution={detail.distribution} total={detail.count} />
        )}

        {feedbackList && feedbackList.feedbacks.length > 0 ? (
          <div className="space-y-3 mt-6">
            <h2 className="text-sm font-semibold text-content-secondary">
              {t.feedback.recentComments} ({feedbackList.total})
            </h2>
            {feedbackList.feedbacks.map((f) => (
              <div key={f.id} className="bg-surface-raised rounded-lg shadow-md p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-yellow-400 text-sm">
                    {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                  </span>
                   <span className="text-xs text-content-muted">
                    {new Date(f.createdAt).toLocaleDateString("pt-PT", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {f.comment && (
                  <p className="text-sm text-content-secondary">{f.comment}</p>
                )}
              </div>
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
          <div className="bg-surface-raised rounded-lg shadow-md p-8 text-center mt-6">
            <div className="text-5xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-content mb-2">
              {t.reviews.noReviews}
            </h3>
            <p className="text-content-muted text-sm">
              {t.reviews.noReviewsDesc}
            </p>
          </div>
        ) : (
          <div className="space-y-3 mt-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface-raised rounded-lg shadow p-4 h-24 animate-pulse" />
            ))}
          </div>
        )}
      </main>

      <BottomSheet
        isOpen={showFeedbackSheet}
        onClose={() => setShowFeedbackSheet(false)}
        title={t.feedback.stopFeedback}
      >
        <FeedbackForm
          type="STOP"
          targetId={stopId}
          targetName={displayName}
          existingFeedback={feedbackList?.userFeedback}
          onSuccess={handleFeedbackSuccess}
        />
      </BottomSheet>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default function StopReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-sunken flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
        </div>
      }
    >
      <StopReviewsContent />
    </Suspense>
  );
}
