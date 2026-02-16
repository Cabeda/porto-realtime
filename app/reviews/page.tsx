"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { SettingsModal } from "@/components/SettingsModal";
import { UserMenu } from "@/components/UserMenu";
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
  totalTargets: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
  const t = useTranslations();
  const detailHref =
    type === "LINE"
      ? `/reviews/line?id=${encodeURIComponent(item.targetId)}`
      : type === "VEHICLE"
        ? `/reviews/vehicle?id=${encodeURIComponent(item.targetId)}`
        : type === "STOP"
          ? `/reviews/stop?id=${encodeURIComponent(item.targetId)}`
          : type === "BIKE_LANE"
            ? `/reviews/bike-lane?id=${encodeURIComponent(item.targetId)}`
            : type === "BIKE_PARK"
              ? `/reviews/bike-park?id=${encodeURIComponent(item.targetId)}`
              : null;

  const label =
    type === "LINE"
      ? `${t.reviews.line} ${item.targetId}`
      : type === "VEHICLE"
        ? `${t.reviews.vehicle} ${item.targetId}`
        : type === "BIKE_PARK"
          ? `🚲 ${item.targetId}`
          : type === "BIKE_LANE"
            ? `🛤️ ${item.targetId}`
            : item.targetId;

  const bgColor =
    rank === 1
      ? "border-l-yellow-400"
      : rank === 2
        ? "border-l-gray-400"
        : rank === 3
          ? "border-l-amber-600"
          : "border-l-gray-200 dark:border-l-gray-700";

  const content = (
    <div
      className={`bg-surface-raised rounded-lg shadow-md hover:shadow-lg transition-all p-4 border-l-4 ${bgColor}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-sunken flex items-center justify-center text-sm font-bold text-content-secondary">
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-content truncate">
              {label}
            </h3>
            <span className="flex-shrink-0 text-sm font-bold text-content-secondary">
              {item.avg.toFixed(1)}
            </span>
            <StarRating rating={item.avg} />
          </div>
          <p className="text-xs text-content-muted mt-0.5">
            {t.feedback.ratings(item.count)}
          </p>
        </div>
        {detailHref && <span className="text-content-muted text-sm">→</span>}
      </div>

      {item.recentComments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-strong space-y-2">
          {item.recentComments.slice(0, 2).map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-yellow-400 text-xs mt-0.5 flex-shrink-0">
                {"★".repeat(c.rating)}
              </span>
              <p className="text-xs text-content-secondary line-clamp-2">
                {c.comment}
              </p>
            </div>
          ))}
          {item.recentComments.length > 2 && (
            <p className="text-xs text-blue-500 dark:text-blue-400">{t.reviews.seeAll}</p>
          )}
        </div>
      )}
    </div>
  );

  return detailHref ? <Link href={detailHref}>{content}</Link> : content;
}

const VALID_TABS: FeedbackType[] = ["LINE", "STOP", "VEHICLE", "BIKE_PARK", "BIKE_LANE"];

function ReviewsContent() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSettings, setShowSettings] = useState(false);

  const tabParam = searchParams?.get("tab")?.toUpperCase() || "";
  const activeTab: FeedbackType = VALID_TABS.includes(tabParam as FeedbackType)
    ? (tabParam as FeedbackType)
    : "LINE";

  const setActiveTab = (tab: FeedbackType) => {
    router.replace(`/reviews?tab=${tab}`, { scroll: false });
  };

  const [sort, setSort] = useState<"count" | "avg">("count");

  const tabs: { key: FeedbackType; label: string; icon: string }[] = [
    { key: "LINE", label: t.reviews.lines, icon: "🚌" },
    { key: "STOP", label: t.reviews.stops, icon: "🚏" },
    { key: "VEHICLE", label: t.reviews.vehicles, icon: "🚍" },
    { key: "BIKE_PARK", label: t.reviews.bikeParks, icon: "🚲" },
    { key: "BIKE_LANE", label: t.reviews.bikeLanes, icon: "🛤️" },
  ];

  const { data, isLoading } = useSWR<RankingsResponse>(
    `/api/feedback/rankings?type=${activeTab}&sort=${sort}&order=desc&limit=50`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  return (
    <div className="min-h-screen bg-surface-sunken transition-colors">
      {/* Header */}
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/"
              className="inline-flex items-center text-accent hover:text-accent-hover font-medium text-sm transition-colors"
            >
              <span className="mr-2">←</span>
              {t.nav.map}
            </Link>
            <div className="hidden sm:flex items-center gap-1">
              <Link
                href="/"
                className="px-3 py-1.5 text-sm font-medium text-content-secondary hover:text-accent hover:bg-surface-sunken rounded-lg transition-colors"
              >
                🗺️ {t.nav.map}
              </Link>
              <Link
                href="/stations"
                className="px-3 py-1.5 text-sm font-medium text-content-secondary hover:text-accent hover:bg-surface-sunken rounded-lg transition-colors"
              >
                🚏 {t.nav.stations}
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <UserMenu />
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
          </div>
          <h1 className="text-2xl font-bold text-content">
            {t.reviews.title}
          </h1>
          <p className="text-sm text-content-muted mt-1">
            {t.reviews.subtitle}
          </p>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-surface-sunken rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                    : "text-content-secondary hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-20 sm:pb-6">
        {/* Sort + stats bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-content-muted">
            {data && (
              <>
                {t.reviews.totalTargets(data.totalTargets)}
                <span className="mx-1">·</span>
                {t.reviews.totalReviews(data.rankings.reduce((sum, r) => sum + r.count, 0))}
              </>
            )}
          </div>
          <div className="flex gap-1 bg-surface-sunken rounded-lg p-0.5">
            <button
              onClick={() => setSort("count")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sort === "count"
                  ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                  : "text-content-muted"
              }`}
            >
              {t.reviews.sortByCount}
            </button>
            <button
              onClick={() => setSort("avg")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sort === "avg"
                  ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                  : "text-content-muted"
              }`}
            >
              {t.reviews.sortByRating}
            </button>
          </div>
        </div>

        {/* Rankings list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-surface-raised rounded-lg shadow p-4 h-20 animate-pulse"
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
          <div className="bg-surface-raised rounded-lg shadow-md p-8 text-center">
            <div className="text-5xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-content mb-2">
              {t.reviews.noReviews}
            </h3>
            <p className="text-content-muted text-sm mb-4">
              {t.reviews.noReviewsDesc}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-content-inverse rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
              >
                🗺️ {t.reviews.viewMap}
              </Link>
              <Link
                href="/stations"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-surface-sunken text-content-secondary rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                🚏 {t.reviews.viewStops}
              </Link>
            </div>
          </div>
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-sunken flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      }
    >
      <ReviewsContent />
    </Suspense>
  );
}
