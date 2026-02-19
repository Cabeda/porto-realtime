"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { SettingsModal } from "@/components/SettingsModal";
import { UserMenu } from "@/components/UserMenu";
import { ProposalCard } from "@/components/ProposalCard";
import type {
  FeedbackType,
  FeedbackMetadata,
  ProposalType,
  ProposalListResponse,
} from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Reviews section types ───

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

// ─── Shared components ───

function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(rating);
  return (
    <span className="text-yellow-400 text-sm">
      {"★".repeat(stars)}
      {"☆".repeat(5 - stars)}
    </span>
  );
}

function RankingCard({
  item,
  type,
  rank,
}: {
  item: RankingItem;
  type: FeedbackType;
  rank: number;
}) {
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
            <h3 className="font-semibold text-content truncate">{label}</h3>
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
            <p className="text-xs text-blue-500 dark:text-blue-400">
              {t.reviews.seeAll}
            </p>
          )}
        </div>
      )}
    </div>
  );

  return detailHref ? <Link href={detailHref}>{content}</Link> : content;
}

// ─── Reviews Tab ───

const REVIEW_TABS: { key: FeedbackType; label: string; icon: string }[] = [
  { key: "LINE", label: "", icon: "🚌" },
  { key: "STOP", label: "", icon: "🚏" },
  { key: "VEHICLE", label: "", icon: "🚍" },
  { key: "BIKE_PARK", label: "", icon: "🚲" },
  { key: "BIKE_LANE", label: "", icon: "🛤️" },
];

function ReviewsTab() {
  const t = useTranslations();
  const [reviewType, setReviewType] = useState<FeedbackType>("LINE");
  const [reviewSort, setReviewSort] = useState<"count" | "avg">("count");

  const tabs = REVIEW_TABS.map((tab) => ({
    ...tab,
    label:
      tab.key === "LINE"
        ? t.reviews.lines
        : tab.key === "STOP"
          ? t.reviews.stops
          : tab.key === "VEHICLE"
            ? t.reviews.vehicles
            : tab.key === "BIKE_PARK"
              ? t.reviews.bikeParks
              : t.reviews.bikeLanes,
  }));

  const { data, isLoading } = useSWR<RankingsResponse>(
    `/api/feedback/rankings?type=${reviewType}&sort=${reviewSort}&order=desc&limit=50`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  return (
    <>
      {/* Review type tabs */}
      <div className="flex gap-1 bg-surface-sunken rounded-lg p-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setReviewType(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              reviewType === tab.key
                ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                : "text-content-secondary hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Sort + stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-content-muted">
          {data && (
            <>
              {t.reviews.totalTargets(data.totalTargets)}
              <span className="mx-1">·</span>
              {t.reviews.totalReviews(
                data.rankings.reduce((sum, r) => sum + r.count, 0)
              )}
            </>
          )}
        </div>
        <div className="flex gap-1 bg-surface-sunken rounded-lg p-0.5">
          <button
            onClick={() => setReviewSort("count")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              reviewSort === "count"
                ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                : "text-content-muted"
            }`}
          >
            {t.reviews.sortByCount}
          </button>
          <button
            onClick={() => setReviewSort("avg")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              reviewSort === "avg"
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
              type={reviewType}
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
    </>
  );
}

// ─── Proposals Tab ───

const PROPOSAL_TYPE_TABS: { key: ProposalType | "ALL"; icon: string }[] = [
  { key: "ALL", icon: "📋" },
  { key: "BIKE_LANE", icon: "🛤️" },
  { key: "STOP", icon: "🚏" },
  { key: "LINE", icon: "🚌" },
];

function ProposalsTab() {
  const t = useTranslations();
  const tp = t.proposals;
  const [proposalType, setProposalType] = useState<ProposalType | "ALL">(
    "ALL"
  );
  const [proposalSort, setProposalSort] = useState<"votes" | "recent">(
    "votes"
  );
  const [page, setPage] = useState(0);

  const typeFilter =
    proposalType === "ALL" ? "" : `&type=${proposalType}`;
  const { data, isLoading, mutate } = useSWR<ProposalListResponse>(
    `/api/proposals?status=OPEN${typeFilter}&sort=${proposalSort}&page=${page}&limit=20`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const totalPages = data?.total ? Math.ceil(data.total / 20) : 0;

  const typeLabels: Record<ProposalType | "ALL", string> = {
    ALL: tp.allTypes,
    BIKE_LANE: tp.bikeLanes,
    STOP: tp.stops,
    LINE: tp.lines,
  };

  return (
    <>
      {/* Proposal type tabs */}
      <div className="flex gap-1 bg-surface-sunken rounded-lg p-1 mb-4">
        {PROPOSAL_TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setProposalType(tab.key);
              setPage(0);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              proposalType === tab.key
                ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                : "text-content-secondary hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{typeLabels[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Sort + stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-content-muted">
          {data?.total != null && tp.totalProposals(data.total)}
        </div>
        <div className="flex gap-1 bg-surface-sunken rounded-lg p-0.5">
          <button
            onClick={() => {
              setProposalSort("votes");
              setPage(0);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              proposalSort === "votes"
                ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                : "text-content-muted"
            }`}
          >
            {tp.sortByVotes}
          </button>
          <button
            onClick={() => {
              setProposalSort("recent");
              setPage(0);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              proposalSort === "recent"
                ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                : "text-content-muted"
            }`}
          >
            {tp.sortByRecent}
          </button>
        </div>
      </div>

      {/* Proposals list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-surface-raised rounded-lg shadow p-4 h-32 animate-pulse"
            />
          ))}
        </div>
      ) : data?.proposals && data.proposals.length > 0 ? (
        <div className="space-y-3">
          {data.proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onVoteChange={() => mutate()}
            />
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm rounded-lg bg-surface-raised border border-border disabled:opacity-40 hover:bg-surface-sunken transition-colors"
              >
                &larr; {tp.previous}
              </button>
              <span className="text-xs text-content-muted">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm rounded-lg bg-surface-raised border border-border disabled:opacity-40 hover:bg-surface-sunken transition-colors"
              >
                {tp.next} &rarr;
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface-raised rounded-lg shadow-md p-8 text-center">
          <div className="text-5xl mb-4">💡</div>
          <h3 className="text-lg font-semibold text-content mb-2">
            {tp.noProposals}
          </h3>
          <p className="text-content-muted text-sm mb-4">
            {tp.noProposalsDesc}
          </p>
          <Link
            href="/proposals/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-content-inverse rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
          >
            {tp.createProposal}
          </Link>
        </div>
      )}
    </>
  );
}

// ─── Main Community Page ───

type Section = "reviews" | "proposals";

function CommunityContent() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSettings, setShowSettings] = useState(false);

  const sectionParam = searchParams?.get("section") || "reviews";
  const activeSection: Section =
    sectionParam === "proposals" ? "proposals" : "reviews";

  const setSection = (section: Section) => {
    router.replace(
      `/community${section === "proposals" ? "?section=proposals" : ""}`,
      { scroll: false }
    );
  };

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
              <span className="mr-2">&larr;</span>
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
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
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

          {/* Title + New Proposal CTA */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-content">
                {t.nav.community}
              </h1>
              <p className="text-sm text-content-muted mt-1">
                {t.community.subtitle}
              </p>
            </div>
            {activeSection === "proposals" && (
              <Link
                href="/proposals/new"
                className="flex items-center gap-1.5 px-4 py-2 bg-accent text-content-inverse rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium flex-shrink-0"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {t.proposals.newProposal}
              </Link>
            )}
          </div>

          {/* Section toggle: Reviews | Proposals */}
          <div className="flex gap-1 mt-4 bg-surface-sunken rounded-lg p-1">
            <button
              onClick={() => setSection("reviews")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                activeSection === "reviews"
                  ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                  : "text-content-secondary hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              <span>⭐</span>
              {t.community.reviews}
            </button>
            <button
              onClick={() => setSection("proposals")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                activeSection === "proposals"
                  ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                  : "text-content-secondary hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              <span>💡</span>
              {t.community.proposals}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-20 sm:pb-6">
        {activeSection === "reviews" ? <ReviewsTab /> : <ProposalsTab />}
      </main>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default function CommunityPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-sunken flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      }
    >
      <CommunityContent />
    </Suspense>
  );
}
