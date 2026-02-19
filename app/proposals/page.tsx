"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { SettingsModal } from "@/components/SettingsModal";
import { UserMenu } from "@/components/UserMenu";
import { ProposalCard } from "@/components/ProposalCard";
import type { ProposalType, ProposalListResponse } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TYPE_TABS: { key: ProposalType | "ALL"; icon: string }[] = [
  { key: "ALL", icon: "📋" },
  { key: "BIKE_LANE", icon: "🛤️" },
  { key: "STOP", icon: "🚏" },
  { key: "LINE", icon: "🚌" },
];

function ProposalsContent() {
  const t = useTranslations();
  const tp = t.proposals;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSettings, setShowSettings] = useState(false);

  const tabParam = searchParams?.get("type")?.toUpperCase() || "ALL";
  const activeType = (["ALL", "BIKE_LANE", "STOP", "LINE"].includes(tabParam) ? tabParam : "ALL") as ProposalType | "ALL";

  const setActiveType = (type: ProposalType | "ALL") => {
    const params = new URLSearchParams();
    if (type !== "ALL") params.set("type", type);
    if (sort !== "recent") params.set("sort", sort);
    router.replace(`/proposals${params.toString() ? "?" + params.toString() : ""}`, { scroll: false });
  };

  const sortParam = searchParams?.get("sort") || "votes";
  const [sort, setSort] = useState<"votes" | "recent">(sortParam === "recent" ? "recent" : "votes");
  const [page, setPage] = useState(0);

  const typeFilter = activeType === "ALL" ? "" : `&type=${activeType}`;
  const { data, isLoading, mutate } = useSWR<ProposalListResponse>(
    `/api/proposals?status=OPEN${typeFilter}&sort=${sort}&page=${page}&limit=20`,
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

  const handleVoteChange = () => {
    mutate();
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
                {t.nav.map}
              </Link>
              <Link
                href="/reviews"
                className="px-3 py-1.5 text-sm font-medium text-content-secondary hover:text-accent hover:bg-surface-sunken rounded-lg transition-colors"
              >
                {t.nav.reviews}
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

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-content">{tp.title}</h1>
              <p className="text-sm text-content-muted mt-1">{tp.subtitle}</p>
            </div>
            <Link
              href="/proposals/new"
              className="flex items-center gap-1.5 px-4 py-2 bg-accent text-content-inverse rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {tp.newProposal}
            </Link>
          </div>

          {/* Type tabs */}
          <div className="flex gap-1 mt-4 bg-surface-sunken rounded-lg p-1">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveType(tab.key); setPage(0); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeType === tab.key
                    ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                    : "text-content-secondary hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{typeLabels[tab.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-20 sm:pb-6">
        {/* Sort + stats */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-content-muted">
            {data?.total != null && tp.totalProposals(data.total)}
          </div>
          <div className="flex gap-1 bg-surface-sunken rounded-lg p-0.5">
            <button
              onClick={() => { setSort("votes"); setPage(0); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sort === "votes"
                  ? "bg-white dark:bg-gray-600 text-content shadow-sm"
                  : "text-content-muted"
              }`}
            >
              {tp.sortByVotes}
            </button>
            <button
              onClick={() => { setSort("recent"); setPage(0); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sort === "recent"
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
              <div key={i} className="bg-surface-raised rounded-lg shadow p-4 h-32 animate-pulse" />
            ))}
          </div>
        ) : data?.proposals && data.proposals.length > 0 ? (
          <div className="space-y-3">
            {data.proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onVoteChange={() => handleVoteChange()}
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
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
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
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default function ProposalsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-sunken flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      }
    >
      <ProposalsContent />
    </Suspense>
  );
}
