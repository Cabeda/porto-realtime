"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { translations } from "@/lib/translations";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import type { FeedbackType, FeedbackMetadata } from "@/lib/types";

interface RankingComment {
  targetId: string;
  rating: number;
  comment: string | null;
  metadata: FeedbackMetadata | null;
  createdAt: string;
}

interface RankingItem {
  targetId: string;
  avg: number;
  count: number;
  recentComments: RankingComment[];
}

interface RankingsResponse {
  rankings: RankingItem[];
  totalFeedback: number;
  totalTargets: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TABS: { key: FeedbackType; label: string; icon: string }[] = [
  { key: "LINE", label: translations.reviews.lines, icon: "🚌" },
  { key: "STOP", label: translations.reviews.stops, icon: "🚏" },
  { key: "VEHICLE", label: translations.reviews.vehicles, icon: "🚍" },
];

function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(rating);
  return (
    <span className="text-yellow-400 text-sm">
      {"★".repeat(stars)}
      {"☆".repeat(5 - stars)}
    </span>
  );
}

function RankingCard({ item, type, rank }: { item: RankingItem; type: FeedbackType; rank: number }) {
  const t = translations.reviews;
  const detailHref =
    type === "LINE"
      ? `/reviews/line?id=${encodeURIComponent(item.targetId)}`
      : type === "VEHICLE"
        ? `/reviews/vehicle?id=${encodeURIComponent(item.targetId)}`
        : `/reviews/stop?id=${encodeURIComponent(item.targetId)}`;

  const label =
    type === "LINE"
      ? `Linha ${item.targetId}`
      : type === "VEHICLE"
        ? `Veículo ${item.targetId}`
        : item.targetId;

  const bgColor =
    rank === 1
      ? "border-l-yellow-400"
      : rank === 2
        ? "border-l-gray-400"
        : rank === 3
          ? "border-l-amber-600"
          : "border-l-gray-200 dark:border-l-gray-700";

  return (
    <Link href={detailHref}>
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all p-4 border-l-4 ${bgColor}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300">
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {label}
              </h3>
              <span className="flex-shrink-0 text-sm font-bold text-gray-700 dark:text-gray-200">
                {item.avg.toFixed(1)}
              </span>
              <StarRating rating={item.avg} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {translations.feedback.ratings(item.count)}
            </p>
          </div>
          <span className="text-gray-400 dark:text-gray-500 text-sm">→</span>
        </div>

        {item.recentComments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
            {item.recentComments.slice(0, 2).map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-yellow-400 text-xs mt-0.5 flex-shrink-0">
                  {"★".repeat(c.rating)}
                </span>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                  {c.comment}
                </p>
              </div>
            ))}
            {item.recentComments.length > 2 && (
              <p className="text-xs text-blue-500 dark:text-blue-400">{t.seeAll}</p>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function ReviewsPage() {
  const t = translations.reviews;
  const [activeTab, setActiveTab] = useState<FeedbackType>("LINE");
  const [sort, setSort] = useState<"count" | "avg">("count");

  const { data, isLoading } = useSWR<RankingsResponse>(
    `/api/feedback/rankings?type=${activeTab}&sort=${sort}&order=desc&limit=50`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-sm transition-colors"
            >
              <span className="mr-2">←</span>
              Mapa
            </Link>
            <DarkModeToggle />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t.subtitle}
          </p>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Sort + stats bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {data && (
              <>
                {t.totalTargets(data.totalTargets)}
                <span className="mx-1">·</span>
                {t.totalReviews(data.totalFeedback)}
              </>
            )}
          </div>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            <button
              onClick={() => setSort("count")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sort === "count"
                  ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {t.sortByCount}
            </button>
            <button
              onClick={() => setSort("avg")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sort === "avg"
                  ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {t.sortByRating}
            </button>
          </div>
        </div>

        {/* Rankings list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-20 animate-pulse"
              />
            ))}
          </div>
        ) : data && data.rankings.length > 0 ? (
          <div className="space-y-3">
            {data.rankings.map((item, i) => (
              <RankingCard
                key={item.targetId}
                item={item}
                type={activeTab}
                rank={i + 1}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
            <div className="text-5xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t.noReviews}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {t.noReviewsDesc}
            </p>
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-20 sm:hidden">
        <div className="flex justify-around py-2">
          <Link href="/" className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-500 dark:text-gray-400">
            <span className="text-lg">🗺️</span>
            <span className="text-[10px]">{translations.nav.map}</span>
          </Link>
          <Link href="/stations" className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-500 dark:text-gray-400">
            <span className="text-lg">🚏</span>
            <span className="text-[10px]">{translations.nav.stations}</span>
          </Link>
          <Link href="/reviews" className="flex flex-col items-center gap-0.5 px-3 py-1 text-blue-600 dark:text-blue-400">
            <span className="text-lg">⭐</span>
            <span className="text-[10px] font-medium">{t.title}</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
