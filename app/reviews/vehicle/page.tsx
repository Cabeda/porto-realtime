"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { translations } from "@/lib/translations";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { BottomSheet } from "@/components/BottomSheet";
import { FeedbackForm } from "@/components/FeedbackForm";
import { useFeedbackList, useFeedbackSummaries } from "@/lib/hooks/useFeedback";
import type { FeedbackItem } from "@/lib/types";

function VehicleReviewsContent() {
  const searchParams = useSearchParams();
  const vehicleId = searchParams?.get("id") || "";
  const t = translations.reviews;

  const { data: summaries } = useFeedbackSummaries("VEHICLE", vehicleId ? [vehicleId] : []);
  const summary = summaries?.[vehicleId];

  const [page, setPage] = useState(0);
  const { data: feedbackList, mutate } = useFeedbackList("VEHICLE", vehicleId || null, page, 20);

  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);

  const handleFeedbackSuccess = useCallback((_feedback: FeedbackItem) => {
    mutate();
  }, [mutate]);

  if (!vehicleId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <p className="text-gray-500 dark:text-gray-400">Veículo não especificado</p>
      </div>
    );
  }

  const stars = summary ? Math.round(summary.avg) : 0;
  const totalPages = feedbackList ? Math.ceil(feedbackList.total / 20) : 0;

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
              {t.backToReviews}
            </Link>
            <DarkModeToggle />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-400 dark:to-indigo-500 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white text-lg font-bold">{vehicleId}</span>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Veículo {vehicleId}
              </h1>
              {summary && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-yellow-400 text-sm">
                    {"★".repeat(stars)}{"☆".repeat(5 - stars)}
                  </span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {summary.avg.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({translations.feedback.ratings(summary.count)})
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowFeedbackSheet(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors text-sm font-medium"
            >
              ★ {translations.feedback.rate}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
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
                  {f.metadata?.lineContext && (
                    <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                      {t.onLine(f.metadata.lineContext)}
                    </span>
                  )}
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
        title={translations.feedback.vehicleFeedback}
      >
        <FeedbackForm
          type="VEHICLE"
          targetId={vehicleId}
          targetName={`Veículo ${vehicleId}`}
          existingFeedback={feedbackList?.userFeedback}
          onSuccess={handleFeedbackSuccess}
        />
      </BottomSheet>
    </div>
  );
}

export default function VehicleReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
        </div>
      }
    >
      <VehicleReviewsContent />
    </Suspense>
  );
}
